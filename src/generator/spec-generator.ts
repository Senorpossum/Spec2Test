import * as fs from "fs";
import * as path from "path";
import { UserStory, CodebaseAnalysis, GenerationResult, TestFramework, Language, TestCase } from "../types/index.js";
import { StoryParser } from "../parser/index.js";
import { CodebaseAnalyzer } from "../analyzer/codebase-analyzer.js";
import { TestGenerator } from "./test-generator.js";

/**
 * Main orchestrator for the Spec2Test pipeline.
 *
 * Pipeline:
 * 1. Parse user stories from various formats
 * 2. Analyze the codebase for patterns and existing tests
 * 3. Generate comprehensive test suites
 * 4. Output results in the requested format
 */
export class SpecGenerator {
    private storyParser: StoryParser;
    private codebaseAnalyzer: CodebaseAnalyzer;
    private testGenerator: TestGenerator;

    constructor(rootDir: string = process.cwd()) {
        this.storyParser = new StoryParser();
        this.codebaseAnalyzer = new CodebaseAnalyzer(rootDir);
        this.testGenerator = new TestGenerator();
    }

    /**
     * Generate tests from a markdown file containing user stories.
     */
    async generateFromMarkdown(markdownPath: string, options: GenerationOptions): Promise<GenerationResult> {
        const markdownContent = fs.readFileSync(markdownPath, "utf-8");
        const stories = this.storyParser.parse(markdownContent);
        const analysis = await this.analyzeCodebase(options.sourceDirectory, options);
        return this.generateFromParsed(stories, analysis, options);
    }

    /**
     * Generate tests from Jira tickets.
     */
    async generateFromJira(
        jiraConfig: {
            baseUrl: string;
            apiKey: string;
            tickets: string[];
        },
        options: GenerationOptions,
    ): Promise<GenerationResult> {
        // Fetch Jira tickets and combine into a single string for parsing
        const ticketContents: string[] = [];
        for (const ticketId of jiraConfig.tickets) {
            const ticketContent = await this.fetchJiraTicket(jiraConfig.baseUrl, jiraConfig.apiKey, ticketId);
            if (ticketContent) {
                ticketContents.push(ticketContent);
            }
        }
        const combinedContent = ticketContents.join("\n---\n");
        const stories = combinedContent ? this.storyParser.parse(combinedContent) : [];
        const analysis = await this.analyzeCodebase(options.sourceDirectory, options);
        return this.generateFromParsed(stories, analysis, options);
    }

    /**
     * Fetch a Jira ticket by ID (placeholder for actual API call).
     */
    private async fetchJiraTicket(baseUrl: string, _apiKey: string, ticketId: string): Promise<string | null> {
        // TODO: Implement actual Jira API integration
        // For now, return null as a placeholder
        console.warn(`Jira API integration for ticket ${ticketId} is not yet implemented`);
        return null;
    }

    /**
     * Generate tests from a plain text file with user stories.
     */
    async generateFromPlainText(textPath: string, options: GenerationOptions): Promise<GenerationResult> {
        const textContent = fs.readFileSync(textPath, "utf-8");
        const stories = this.storyParser.parse(textContent);
        const analysis = await this.analyzeCodebase(options.sourceDirectory, options);
        return this.generateFromParsed(stories, analysis, options);
    }

    /**
     * Generate tests from already-parsed user stories.
     */
    async generateFromParsed(
        stories: UserStory[],
        analysis: CodebaseAnalysis,
        _options: GenerationOptions,
    ): Promise<GenerationResult> {
        const result = this.testGenerator.generate(stories, analysis);

        return result;
    }

    /**
     * Write the generated test suite to disk.
     */
    async writeTests(result: GenerationResult, outputDir: string): Promise<string[]> {
        if (!result.success || !result.suite) {
            throw new Error(`Test generation failed: ${result.errors.join(", ")}`);
        }

        const writtenFiles: string[] = [];

        // Write the main test file
        const fileName = `generated-tests.${result.suite.framework}.test.ts`;
        const filePath = path.join(outputDir, fileName);
        const fileContent = this.formatTestFile(result.suite);
        fs.mkdirSync(outputDir, { recursive: true });
        if (fs.existsSync(outputDir)) {
            fs.writeFileSync(filePath, fileContent, "utf-8");
        } else {
            throw new Error(`Failed to create output directory: ${outputDir}`);
        }
        writtenFiles.push(filePath);

        // Write the metadata file
        const metadataPath = path.join(outputDir, "test-suite-metadata.json");
        const metadataContent = JSON.stringify(
            {
                suite: result.suite,
                stats: result.stats,
                warnings: result.warnings,
                errors: result.errors,
            },
            null,
            2,
        );
        fs.writeFileSync(metadataPath, metadataContent, "utf-8");
        writtenFiles.push(metadataPath);

        // Write documentation
        const docPath = path.join(outputDir, "TEST_COVERAGE.md");
        const docContent = this.generateDocumentation(result);
        fs.writeFileSync(docPath, docContent, "utf-8");
        writtenFiles.push(docPath);

        return writtenFiles;
    }

    /**
     * Analyze a codebase to determine language, framework, patterns, and gaps.
     */
    private async analyzeCodebase(sourceDir: string, _options: GenerationOptions): Promise<CodebaseAnalysis> {
        // Recreate analyzer with the target directory
        const analyzer = new CodebaseAnalyzer(sourceDir);
        return analyzer.analyze();
    }

    /**
     * Format a TestSuite into a TypeScript test file string.
     */
    private formatTestFile(suite: NonNullable<GenerationResult["suite"]>): string {
        const lines: string[] = [];

        // Header
        lines.push(`/**`);
        lines.push(` * ${suite.description}`);
        lines.push(` * Generated by Spec2Test`);
        lines.push(` * Generated at: ${suite.metadata.generatedAt}`);
        lines.push(` * Total tests: ${suite.metadata.totalTests}`);
        lines.push(` */`);
        lines.push("");

        // Imports
        lines.push(`import { ${this.getImports(suite.framework)} } from '${this.getImportPath(suite.framework)}';`);
        lines.push("");

        // Test suite
        lines.push(`describe('${this.escapeForDescribe(suite.title)}', () => {`);

        // Group tests by type
        const testsByType = this.groupTestsByType(suite.tests);

        for (const [testType, tests] of Object.entries(testsByType)) {
            lines.push("");
            lines.push(`  // ${testType} tests`);
            lines.push(`  describe('${this.escapeForDescribe(testType)}', () => {`);

            for (const test of tests) {
                lines.push("");
                lines.push(`    it('${this.escapeForIt(test.title)}', async () => {`);

                // Write steps
                for (const step of test.steps) {
                    if (step.action) {
                        lines.push(`      // ${step.action}`);
                    }
                    if (step.data) {
                        const dataStr = JSON.stringify(step.data, null, 6);
                        lines.push(`      const data = ${dataStr};`);
                    }
                    if (step.assertion) {
                        lines.push(`      expect(/* assertion: ${step.assertion} */).toBeDefined();`);
                    }
                }

                lines.push(`      // TODO: Implement assertions for: ${test.expectedOutcome}`);
                lines.push(`    });`);
            }

            lines.push("  });");
        }

        lines.push("});");
        lines.push("");

        return lines.join("\n");
    }

    /**
     * Group tests by their type.
     */
    private groupTestsByType(tests: TestCase[]): Record<string, TestCase[]> {
        const groups: Record<string, TestCase[]> = {};
        for (const test of tests) {
            if (!groups[test.type]) {
                groups[test.type] = [];
            }
            groups[test.type].push(test);
        }
        return groups;
    }

    /**
     * Generate markdown documentation for the test suite.
     */
    private generateDocumentation(result: GenerationResult): string {
        if (!result.suite) {
            return (
                "# Test Generation Report\n\n**Status:** Failed\n\n**Errors:**\n\n" +
                result.errors.map((e) => `- ${e}`).join("\n") +
                "\n"
            );
        }

        const lines: string[] = [];
        lines.push("# Test Coverage Report");
        lines.push("");
        lines.push(`**Generated by:** Spec2Test`);
        lines.push(`**Generated at:** ${result.suite.metadata.generatedAt}`);
        lines.push(`**Test framework:** ${result.suite.framework}`);
        lines.push(`**Total tests:** ${result.stats.testsGenerated}`);
        lines.push(`**Processing time:** ${result.stats.processingTimeMs}ms`);
        lines.push("");

        // Summary
        lines.push("## Summary");
        lines.push("");
        lines.push(`| Metric | Value |`);
        lines.push(`|--------|-------|`);
        lines.push(`| Stories Processed | ${result.stats.storiesProcessed} |`);
        lines.push(`| Tests Generated | ${result.stats.testsGenerated} |`);
        lines.push(`| Edge Cases Found | ${result.stats.edgeCasesFound} |`);
        lines.push(`| Coverage Areas | ${result.suite.metadata.coveragePercentage}% |`);
        lines.push("");

        // Coverage breakdown
        lines.push("## Coverage Breakdown");
        lines.push("");
        lines.push("| Coverage Area | Count |");
        lines.push("|--------------|-------|");
        const coverageAreas = result.stats.coverageAreas;
        for (const [area, count] of Object.entries(coverageAreas)) {
            lines.push(`| ${area} | ${count} |`);
        }
        lines.push("");

        // Source stories
        lines.push("## Source Stories");
        lines.push("");
        for (const storyId of result.suite.metadata.sourceStories) {
            lines.push(`- ${storyId}`);
        }
        lines.push("");

        // Test list
        lines.push("## Generated Tests");
        lines.push("");
        lines.push("| ID | Title | Type | Severity | Tags |");
        lines.push("|----|-------|------|----------|------|");
        for (const test of result.suite.tests) {
            lines.push(`| ${test.id} | ${test.title} | ${test.type} | ${test.severity} | ${test.tags.join(", ")} |`);
        }
        lines.push("");

        // Warnings
        if (result.warnings.length > 0) {
            lines.push("## Warnings");
            lines.push("");
            for (const warning of result.warnings) {
                lines.push(`- ⚠️ ${warning}`);
            }
            lines.push("");
        }

        // Errors
        if (result.errors.length > 0) {
            lines.push("## Errors");
            lines.push("");
            for (const error of result.errors) {
                lines.push(`- ❌ ${error}`);
            }
            lines.push("");
        }

        return lines.join("\n");
    }

    /**
     * Get the appropriate imports for a test framework.
     */
    private getImports(framework: TestFramework): string {
        switch (framework) {
            case "jest":
            case "vitest":
                return "describe, it, expect, beforeAll, afterAll, beforeEach, afterEach";
            case "playwright":
                return "test, expect";
            case "cypress":
                return "cy";
            case "mocha":
                return "describe, it, before, after, beforeEach, afterEach";
            default:
                return "describe, it, expect";
        }
    }

    /**
     * Get the import path for a test framework.
     */
    private getImportPath(framework: TestFramework): string {
        switch (framework) {
            case "jest":
                return "jest";
            case "vitest":
                return "vitest";
            case "playwright":
                return "@playwright/test";
            case "cypress":
                return "cypress";
            case "mocha":
                return "mocha";
            default:
                return "jest";
        }
    }

    /**
     * Escape a string for use inside describe().
     */
    private escapeForDescribe(str: string): string {
        return str.replace(/'/g, "\\'").replace(/"/g, '\\"').substring(0, 100);
    }

    /**
     * Escape a string for use inside it().
     */
    private escapeForIt(str: string): string {
        return str.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, " ").substring(0, 150);
    }
}

/**
 * Options for test generation.
 */
export interface GenerationOptions {
    sourceDirectory: string;
    outputDirectory: string;
    framework: TestFramework;
    language: Language;
    includeEdgeCases: boolean;
    includeSecurity: boolean;
    includeAccessibility: boolean;
    includePerformance: boolean;
    customPrompt?: string;
    verbose?: boolean;
}
