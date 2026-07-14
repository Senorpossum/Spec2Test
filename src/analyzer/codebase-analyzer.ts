import * as fs from "fs";
import * as path from "path";
import {
    CodebaseAnalysis,
    Language,
    ProjectStructure,
    ExistingTest,
    CodePatterns,
    CoverageGap,
    TestFramework,
    TestStyle,
} from "../types/index.js";

/**
 * Analyzes a codebase to understand its structure, test patterns,
 * existing coverage, and gaps. This information guides test generation.
 */
export class CodebaseAnalyzer {
    private rootDir: string;
    private fileCache = new Map<string, string>();

    constructor(rootDir: string) {
        this.rootDir = path.resolve(rootDir);
    }

    /**
     * Perform a full codebase analysis.
     */
    analyze(): CodebaseAnalysis {
        const language = this.detectLanguage();
        const structure = this.analyzeStructure();
        const testFramework = this.detectTestFramework();
        const existingTests = this.findExistingTests();
        const patterns = this.detectCodePatterns();
        const gaps = this.identifyCoverageGaps(language, existingTests);

        return {
            language,
            testFramework,
            structure,
            existingTests,
            patterns,
            gaps,
        };
    }

    /**
     * Detect the primary language of the project.
     */
    private detectLanguage(): Language {
        const extensions: Record<Language, string[]> = {
            typescript: [".ts", ".tsx"],
            javascript: [".js", ".jsx", ".mjs", ".cjs"],
            python: [".py"],
            java: [".java"],
            go: [".go"],
            rust: [".rs"],
            other: [],
        };

        const counts: Partial<Record<Language, number>> = {};
        const extCount = this.countFilesByExtension();

        for (const [lang, exts] of Object.entries(extensions) as [Language, string[]][]) {
            if (lang === "other") continue;
            counts[lang] = exts.reduce((sum, ext) => sum + (extCount[ext] || 0), 0);
        }

        let maxLang: Language = "typescript";
        let maxCount = 0;

        for (const [lang, count] of Object.entries(counts) as [Language, number][]) {
            if (count > maxCount) {
                maxCount = count;
                maxLang = lang;
            }
        }

        return maxLang;
    }

    /**
     * Count files by their extension.
     */
    private countFilesByExtension(): Record<string, number> {
        const counts: Record<string, number> = {};
        this.walkDirectory(this.rootDir, (filePath) => {
            const ext = path.extname(filePath).toLowerCase();
            if (ext) {
                counts[ext] = (counts[ext] || 0) + 1;
            }
        });
        return counts;
    }

    /**
     * Analyze the directory structure.
     */
    private analyzeStructure(): ProjectStructure {
        const sourceDirs: string[] = [];
        const testDirs: string[] = [];
        let configFile: string | null = null;
        let entryPoint: string | null = null;

        this.walkDirectory(this.rootDir, (filePath, dirName) => {
            const fileName = path.basename(filePath);

            // Detect source directories
            if (dirName === "src" || dirName === "lib" || dirName === "app" || dirName === "packages") {
                if (!sourceDirs.includes(dirName)) {
                    sourceDirs.push(dirName);
                }
            }

            // Detect test directories
            if (
                dirName === "tests" ||
                dirName === "__tests__" ||
                dirName === "test" ||
                dirName === "spec" ||
                dirName.endsWith(".test") ||
                dirName.endsWith(".spec")
            ) {
                if (!testDirs.includes(dirName)) {
                    testDirs.push(dirName);
                }
            }

            // Detect config files
            if (fileName === "package.json" || fileName === "tsconfig.json" || fileName === "jest.config.js") {
                configFile = filePath;
            }

            // Detect entry points
            if (
                fileName === "index.ts" ||
                fileName === "index.js" ||
                fileName === "main.ts" ||
                fileName === "main.js"
            ) {
                entryPoint = filePath;
            }
        });

        return {
            sourceDirs: sourceDirs.length > 0 ? sourceDirs : ["src"],
            testDirs: testDirs.length > 0 ? testDirs : ["__tests__"],
            configFile,
            entryPoint,
        };
    }

    /**
     * Detect the test framework used in the project.
     */
    private detectTestFramework(): TestFramework | null {
        // Check package.json for test framework dependencies
        const packageJsonPath = path.join(this.rootDir, "package.json");
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
                const deps = {
                    ...packageJson.dependencies,
                    ...packageJson.devDependencies,
                };

                if (deps.jest || deps["@jest/core"]) return "jest";
                if (deps.vitest) return "vitest";
                if (deps.mocha) return "mocha";
                if (deps.playwright || deps("@playwright/test")) return "playwright";
                if (deps.cypress) return "cypress";
            } catch {
                // Ignore parse errors
            }
        }

        // Check for test config files
        const configFiles = [
            "jest.config.js",
            "jest.config.ts",
            "jest.config.mjs",
            "vitest.config.js",
            "vitest.config.ts",
            "mocha.opts",
            ".mocharc.js",
        ];

        for (const config of configFiles) {
            const configPath = path.join(this.rootDir, config);
            if (fs.existsSync(configPath)) {
                if (config.startsWith("jest")) return "jest";
                if (config.startsWith("vitest")) return "vitest";
                if (config.startsWith("mocha")) return "mocha";
            }
        }

        // Check for existing test files to infer framework
        const testFiles = this.findTestFiles();
        if (testFiles.length > 0) {
            return this.detectFrameworkFromTestFiles(testFiles);
        }

        return null;
    }

    /**
     * Detect the test framework from the content of test files.
     */
    private detectFrameworkFromTestFiles(testFiles: string[]): TestFramework {
        let jestScore = 0;
        let vitestScore = 0;
        let mochaScore = 0;
        let playwrightScore = 0;
        let cypressScore = 0;

        for (const testFile of testFiles.slice(0, 20)) {
            const content = this.readFile(testFile);

            if (content.includes("describe(") || content.includes("it(") || content.includes("test(")) {
                jestScore++;
            }
            if (content.includes("describe(") || content.includes("it(")) {
                vitestScore++;
                mochaScore++;
            }
            if (content.includes("test(") && !content.includes("describe(")) {
                vitestScore++;
            }
            if (content.includes("@playwright/test") || content.includes("test.describe")) {
                playwrightScore++;
            }
            if (content.includes("cy.") || content.includes("Cypress.")) {
                cypressScore++;
            }
        }

        const scores: Record<string, number> = {
            jest: jestScore,
            vitest: vitestScore,
            mocha: mochaScore,
            playwright: playwrightScore,
            cypress: cypressScore,
        };

        let maxFramework = "jest";
        let maxScore = 0;

        for (const [framework, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                maxFramework = framework;
            }
        }

        return maxFramework as TestFramework;
    }

    /**
     * Find all existing test files.
     */
    private findTestFiles(): string[] {
        const testFiles: string[] = [];

        const testPatterns = [
            "**/*.test.ts",
            "**/*.test.js",
            "**/*.test.tsx",
            "**/*.test.jsx",
            "**/*.spec.ts",
            "**/*.spec.js",
            "**/*.spec.tsx",
            "**/*.spec.jsx",
            "**/__tests__/**",
            "**/tests/**",
        ];

        for (const pattern of testPatterns) {
            const searchPath = path.join(this.rootDir, pattern);
            const files = this.globFiles(searchPath);
            testFiles.push(...files);
        }

        return [...new Set(testFiles)];
    }

    /**
     * Analyze existing test files to understand patterns and styles.
     */
    private findExistingTests(): ExistingTest[] {
        const testFiles = this.findTestFiles();
        const existingTests: ExistingTest[] = [];

        for (const testFile of testFiles.slice(0, 50)) {
            const content = this.readFile(testFile);
            const patterns = this.extractTestPatterns(content);
            const style = this.detectTestStyle(content);
            const coverage = this.extractCoveredItems(content);

            existingTests.push({
                path: path.relative(this.rootDir, testFile),
                patterns,
                style,
                coverage,
            });
        }

        return existingTests;
    }

    /**
     * Extract test patterns from a test file (e.g., test function names, hooks).
     */
    private extractTestPatterns(content: string): string[] {
        const patterns: string[] = [];

        if (content.includes("describe(")) patterns.push("describe");
        if (content.includes("it(")) patterns.push("it");
        if (content.includes("test(")) patterns.push("test");
        if (content.includes("beforeEach(")) patterns.push("beforeEach");
        if (content.includes("afterEach(")) patterns.push("afterEach");
        if (content.includes("beforeAll(")) patterns.push("beforeAll");
        if (content.includes("afterAll(")) patterns.push("afterAll");
        if (content.includes("expect(")) patterns.push("expect");
        if (content.includes("assert(")) patterns.push("assert");
        if (content.includes(".toBe(")) patterns.push("toBe");
        if (content.includes(".toEqual(")) patterns.push("toEqual");
        if (content.includes(".toHaveProperty(")) patterns.push("toHaveProperty");
        if (content.includes("jest.fn(")) patterns.push("jest.fn");
        if (content.includes("vi.fn(")) patterns.push("vi.fn");
        if (content.includes("spyOn(")) patterns.push("spyOn");

        return patterns;
    }

    /**
     * Detect the test style used (BDD, TDD, etc.).
     */
    private detectTestStyle(content: string): TestStyle {
        const hasDescribe = content.includes("describe(");
        const hasIt = content.includes("it(");
        const hasTest = content.includes("test(");
        const hasShould = /\.should\(|\.should\s*\(/.test(content);
        const hasAssert = content.includes("assert(");

        if (hasShould) return "should";
        if (hasAssert) return "assert";
        if (hasDescribe && hasIt) return "describe-it";
        if (hasDescribe && hasTest) return "test-expect";
        if (hasTest) return "expect";

        return "describe-it";
    }

    /**
     * Extract the names of items being tested.
     */
    private extractCoveredItems(content: string): string[] {
        const items: string[] = [];

        // Extract describe block names
        const describeMatches = content.match(/describe\(\s*['"]([^'"]+)['"]/g);
        if (describeMatches) {
            for (const match of describeMatches) {
                const nameMatch = match.match(/describe\(\s*['"]([^'"]+)['"]/);
                if (nameMatch) {
                    items.push(nameMatch[1]);
                }
            }
        }

        // Extract it/test block names
        const itMatches = content.match(/(?:it|test)\(\s*['"]([^'"]+)['"]/g);
        if (itMatches) {
            for (const match of itMatches) {
                const nameMatch = match.match(/(?:it|test)\(\s*['"]([^'"]+)['"]/);
                if (nameMatch) {
                    items.push(nameMatch[1]);
                }
            }
        }

        return items.slice(0, 20);
    }

    /**
     * Detect code patterns (naming conventions, imports, etc.).
     */
    private detectCodePatterns(): CodePatterns {
        const testFiles = this.findTestFiles();
        const namingConvention = this.detectNamingConvention(testFiles);
        const commonImports = this.detectCommonImports(testFiles);
        const mockingStrategy = this.detectMockingStrategy(testFiles);
        const fixturePattern = this.detectFixturePattern(testFiles);
        const setupTeardown = this.detectSetupTeardown(testFiles);

        return {
            namingConvention,
            commonImports,
            mockingStrategy,
            fixturePattern,
            setupTeardown,
        };
    }

    /**
     * Detect naming convention for test files.
     */
    private detectNamingConvention(testFiles: string[]): string {
        if (testFiles.length === 0) {
            return "*.test.{ts,js}";
        }

        const patterns = testFiles.map((f) => path.basename(f));
        const hasTest = patterns.some((p) => p.includes(".test."));
        const hasSpec = patterns.some((p) => p.includes(".spec."));
        const hasTestsDir = testFiles.some((f) => f.includes("/tests/"));
        const hasTestsSlash = testFiles.some((f) => f.includes("__tests__/"));

        if (hasTest) return "*.test.{ts,js}";
        if (hasSpec) return "*.spec.{ts,js}";
        if (hasTestsDir) return "{module}.test.{ts,js}";
        if (hasTestsSlash) return "{module}.test.{ts,js}";

        return "*.test.{ts,js}";
    }

    /**
     * Detect common imports in test files.
     */
    private detectCommonImports(testFiles: string[]): string[] {
        const imports = new Set<string>();

        for (const testFile of testFiles.slice(0, 20)) {
            const content = this.readFile(testFile);

            const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
            let match;

            while ((match = importRegex.exec(content)) !== null) {
                imports.add(match[1]);
            }
        }

        return [...imports].slice(0, 15);
    }

    /**
     * Detect the mocking strategy used.
     */
    private detectMockingStrategy(testFiles: string[]): string {
        let jestScore = 0;
        let vanillaScore = 0;
        let sinonScore = 0;

        for (const testFile of testFiles.slice(0, 20)) {
            const content = this.readFile(testFile);

            if (content.includes("jest.") || content.includes("jest.") || content.includes(".mock")) {
                jestScore++;
            }
            if (content.includes("sinon")) {
                sinonScore++;
            }
            if (content.includes("spyOn") || content.includes("mock") || content.includes("stub")) {
                vanillaScore++;
            }
        }

        if (jestScore > sinonScore && jestScore > vanillaScore) return "jest-mocks";
        if (sinonScore > vanillaScore) return "sinon";
        return "hand-crafted";
    }

    /**
     * Detect fixture pattern (inline, separate files, factories).
     */
    private detectFixturePattern(_testFiles: string[]): string | null {
        const hasFixturesDir = this.checkDirectoryExists("fixtures");
        const hasTestDataDir = this.checkDirectoryExists("test-data");
        const hasFactoriesDir = this.checkDirectoryExists("factories");

        if (hasFactoriesDir) return "factory-pattern";
        if (hasFixturesDir || hasTestDataDir) return "fixture-files";

        return "inline";
    }

    /**
     * Detect setup/teardown patterns.
     */
    private detectSetupTeardown(testFiles: string[]): string | null {
        let hasHooks = false;
        let hasSingleton = false;

        for (const testFile of testFiles.slice(0, 10)) {
            const content = this.readFile(testFile);

            if (
                content.includes("beforeEach") ||
                content.includes("afterEach") ||
                content.includes("beforeAll") ||
                content.includes("afterAll")
            ) {
                hasHooks = true;
            }

            if (content.includes("setup") && content.includes("teardown")) {
                hasSingleton = true;
            }
        }

        if (hasSingleton) return "setup/teardown functions";
        if (hasHooks) return "lifecycle hooks";

        return null;
    }

    /**
     * Identify coverage gaps based on existing tests and codebase analysis.
     */
    private identifyCoverageGaps(_language: Language, existingTests: ExistingTest[]): CoverageGap[] {
        const gaps: CoverageGap[] = [];

        // Check for missing test types
        const hasSecurityTests = existingTests.some(
            (t) =>
                t.patterns.includes(".toBe") &&
                this.anyFileContains(this.findTestFiles().slice(0, 5), /security|auth|permission|csrf|xss|inject/i),
        );

        const hasAccessibilityTests = existingTests.some((_t) =>
            this.anyFileContains(this.findTestFiles().slice(0, 5), /a11y|accessibility|axe|wcag/i),
        );

        const hasPerformanceTests = existingTests.some((_t) =>
            this.anyFileContains(this.findTestFiles().slice(0, 5), /performance|benchmark|timing|slow/i),
        );

        if (!hasSecurityTests) {
            gaps.push({
                area: "security",
                description:
                    "No security tests detected. Consider adding authentication, authorization, and input validation tests.",
                affectedModules: [],
                priority: "critical",
            });
        }

        if (!hasAccessibilityTests) {
            gaps.push({
                area: "accessibility",
                description: "No accessibility tests detected. Consider adding WCAG compliance tests.",
                affectedModules: [],
                priority: "medium",
            });
        }

        if (!hasPerformanceTests) {
            gaps.push({
                area: "performance",
                description: "No performance tests detected. Consider adding benchmark and response time tests.",
                affectedModules: [],
                priority: "low",
            });
        }

        return gaps;
    }

    /**
     * Check if any file in a list contains a pattern.
     */
    private anyFileContains(files: string[], pattern: RegExp): boolean {
        for (const file of files) {
            const content = this.readFile(file);
            if (pattern.test(content)) return true;
        }
        return false;
    }

    /**
     * Check if a directory exists relative to root.
     */
    private checkDirectoryExists(dirName: string): boolean {
        const dirPath = path.join(this.rootDir, dirName);
        try {
            return fs.statSync(dirPath).isDirectory();
        } catch {
            return false;
        }
    }

    /**
     * Walk through all files in a directory.
     */
    private walkDirectory(dir: string, callback: (filePath: string, dirName: string) => void): void {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    if (
                        entry.name !== "node_modules" &&
                        entry.name !== ".git" &&
                        entry.name !== "dist" &&
                        entry.name !== "build"
                    ) {
                        this.walkDirectory(fullPath, callback);
                    }
                } else {
                    callback(fullPath, entry.name);
                }
            }
        } catch {
            // Directory doesn't exist or can't be read
        }
    }

    /**
     * Read a file and cache the result.
     */
    private readFile(filePath: string): string {
        const cached = this.fileCache.get(filePath);
        if (cached !== undefined) {
            return cached;
        }

        try {
            const content = fs.readFileSync(filePath, "utf-8");
            this.fileCache.set(filePath, content);
            return content;
        } catch {
            return "";
        }
    }

    /**
     * Simple glob implementation for common patterns.
     */
    private globFiles(pattern: string): string[] {
        const files: string[] = [];
        const regex = this.globToRegex(pattern);

        this.walkDirectory(this.rootDir, (filePath) => {
            const relativePath = path.relative(this.rootDir, filePath);
            if (regex.test(relativePath)) {
                files.push(filePath);
            }
        });

        return files;
    }

    /**
     * Convert a simple glob pattern to a regex.
     */
    private globToRegex(pattern: string): RegExp {
        // Very simple glob-to-regex converter
        const regexStr =
            "^" +
            pattern
                .replace(/\*\*/g, "<<DOUBLE>>")
                .replace(/\*/g, "[^/]*")
                .replace(/\?/g, ".")
                .replace(/\./g, "\\.")
                .replace(/<<DOUBLE>>/g, ".*") +
            "$";

        return new RegExp(regexStr, "i");
    }
}
