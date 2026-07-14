#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { SpecGenerator } from '../generator/spec-generator.js';
import { StoryParser } from '../parser/story-parser.js';
import { CodebaseAnalyzer } from '../analyzer/codebase-analyzer.js';
import type { TestFramework, Language } from '../types/index.js';

interface CLIArgs {
    command: string;
    stories?: string;
    sourceDir?: string;
    outputDir?: string;
    framework?: TestFramework;
    language?: Language;
    includeEdgeCases: boolean;
    includeSecurity: boolean;
    includeAccessibility: boolean;
    includePerformance: boolean;
    verbose: boolean;
    config?: string;
}

function parseArgs(argv: string[]): CLIArgs {
    const args: CLIArgs = {
        command: 'generate',
        includeEdgeCases: false,
        includeSecurity: false,
        includeAccessibility: false,
        includePerformance: false,
        verbose: false,
    };

    let i = 2; // Skip node and script path
    while (i < argv.length) {
        const arg = argv[i];
        switch (arg) {
            case 'generate':
                args.command = 'generate';
                break;
            case '--stories':
            case '-s':
                args.stories = argv[++i];
                break;
            case '--source-dir':
            case '-d':
                args.sourceDir = argv[++i];
                break;
            case '--output-dir':
            case '-o':
                args.outputDir = argv[++i];
                break;
            case '--framework':
            case '-f':
                args.framework = argv[++i] as TestFramework;
                break;
            case '--language':
            case '-l':
                args.language = argv[++i] as Language;
                break;
            case '--include-edge-cases':
                args.includeEdgeCases = true;
                break;
            case '--include-security':
                args.includeSecurity = true;
                break;
            case '--include-accessibility':
                args.includeAccessibility = true;
                break;
            case '--include-performance':
                args.includePerformance = true;
                break;
            case '--verbose':
            case '-v':
                args.verbose = true;
                break;
            case '--config':
            case '-c':
                args.config = argv[++i];
                break;
            case '--help':
            case '-h':
                printHelp();
                process.exit(0);
                break;
        }
        i++;
    }

    return args;
}

function printHelp(): void {
    console.log(`
Spec2Test - Automated test suite generation from user stories

Usage:
  spec2test generate [options]

Options:
  --stories, -s          Path to user stories (markdown or text)
  --source-dir, -d       Path to source code directory
  --output-dir, -o       Path to output directory for generated tests
  --framework, -f        Test framework: jest, vitest, playwright, cypress, mocha
  --language, -l         Source language: typescript, javascript, python, java, go, rust
  --include-edge-cases   Include edge case tests
  --include-security     Include security tests
  --include-accessibility Include accessibility tests
  --include-performance  Include performance tests
  --config, -c           Path to spec2test.config.json
  --verbose, -v          Enable verbose output
  --help, -h             Show this help message
`);
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv);

    if (args.command === 'generate') {
        if (!args.stories) {
            console.error('Error: --stories is required for generate command');
            process.exit(1);
        }

        const sourceDir = args.sourceDir || process.cwd();
        const outputDir = args.outputDir || path.join(process.cwd(), 'tests/generated');
        const framework = args.framework || 'jest';
        const language = args.language || 'typescript';

        if (args.verbose) {
            console.log('Spec2Test starting...');
            console.log(`  Stories file: ${args.stories}`);
            console.log(`  Source directory: ${sourceDir}`);
            console.log(`  Output directory: ${outputDir}`);
            console.log(`  Framework: ${framework}`);
        }

        // Check if stories file exists
        if (!fs.existsSync(args.stories)) {
            console.error(`Error: Stories file not found: ${args.stories}`);
            process.exit(1);
        }

        // Read and parse stories
        const storiesContent = fs.readFileSync(args.stories, 'utf-8');
        const parser = new StoryParser();
        const stories = parser.parse(storiesContent);

        if (args.verbose) {
            console.log(`  Parsed ${stories.length} user story(s)`);
        }

        if (stories.length === 0) {
            console.warn('Warning: No user stories found in the input file');
            return;
        }

        // Analyze codebase
        const analyzer = new CodebaseAnalyzer(sourceDir);
        const analysis = analyzer.analyze();

        if (args.verbose) {
            console.log(`  Detected language: ${analysis.language}`);
            console.log(`  Detected framework: ${analysis.testFramework || 'unknown'}`);
        }

        // Generate tests
        const generator = new SpecGenerator(sourceDir);

        const frameworkOptions = {
            sourceDirectory: sourceDir,
            outputDirectory: outputDir,
            framework,
            language,
            includeEdgeCases: args.includeEdgeCases,
            includeSecurity: args.includeSecurity,
            includeAccessibility: args.includeAccessibility,
            includePerformance: args.includePerformance,
            verbose: args.verbose,
        };

        const result = await generator.generateFromParsed(stories, analysis, frameworkOptions);

        if (!result.success) {
            console.error('Test generation failed:');
            for (const error of result.errors) {
                console.error(`  - ${error}`);
            }
            process.exit(1);
        }

        if (result.warnings.length > 0 && args.verbose) {
            console.log('Warnings:');
            for (const warning of result.warnings) {
                console.log(`  - ${warning}`);
            }
        }

        // Write output
        const writtenFiles = await generator.writeTests(result, outputDir);

        console.log(`Generated ${result.stats.testsGenerated} test(s) from ${result.stats.storiesProcessed} story(ies)`);
        console.log(`Output files:`);
        for (const file of writtenFiles) {
            console.log(`  - ${file}`);
        }

        if (args.verbose) {
            console.log(`Processing time: ${result.stats.processingTimeMs}ms`);
        }
    }
}

main().catch((error) => {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
});