/**
 * Core type definitions for Spec2Test
 */

// ============================================================================
// User Story Parsing
// ============================================================================

export interface UserStory {
    id: string;
    title: string;
    description: string;
    actor: string;
    action: string;
    purpose: string;
    acceptanceCriteria: AcceptanceCriterion[];
    metadata: StoryMetadata;
}

export interface AcceptanceCriterion {
    id: string;
    statement: string;
    scenario: Scenario[];
}

export interface Scenario {
    given: string[];
    when: string;
    then: string[];
}

export interface StoryMetadata {
    priority: "critical" | "high" | "medium" | "low";
    tags: string[];
    estimatedComplexity: "simple" | "moderate" | "complex";
    domain: string;
}

// ============================================================================
// Test Generation
// ============================================================================

export interface TestCase {
    id: string;
    title: string;
    description: string;
    type: TestType;
    severity: TestSeverity;
    tags: string[];
    steps: TestStep[];
    expectedOutcome: string;
    edgeCase: boolean;
    coverage: CoverageArea;
}

export type TestType =
    "unit" | "integration" | "e2e" | "api" | "contract" | "performance" | "accessibility" | "security" | "regression";

export type TestSeverity = "blocker" | "critical" | "major" | "minor" | "trivial";

export interface TestStep {
    order: number;
    action: string;
    data?: Record<string, unknown>;
    assertion?: string;
}

export type CoverageArea =
    | "happy-path"
    | "edge-case"
    | "error-handling"
    | "security"
    | "performance"
    | "accessibility"
    | "internationalization"
    | "responsiveness"
    | "compatibility"
    | "usability";

export interface TestSuite {
    id: string;
    title: string;
    description: string;
    framework: TestFramework;
    tests: TestCase[];
    metadata: SuiteMetadata;
}

export type TestFramework = "jest" | "playwright" | "cypress" | "vitest" | "mocha";

export interface SuiteMetadata {
    generatedAt: string;
    specVersion: string;
    sourceStories: string[];
    totalTests: number;
    coveragePercentage: number;
}

// ============================================================================
// Codebase Analysis
// ============================================================================

export interface CodebaseAnalysis {
    language: Language;
    testFramework: TestFramework | null;
    structure: ProjectStructure;
    existingTests: ExistingTest[];
    patterns: CodePatterns;
    gaps: CoverageGap[];
}

export type Language = "typescript" | "javascript" | "python" | "java" | "go" | "rust" | "other";

export interface ProjectStructure {
    sourceDirs: string[];
    testDirs: string[];
    configFile: string | null;
    entryPoint: string | null;
}

export interface ExistingTest {
    path: string;
    patterns: string[];
    style: TestStyle;
    coverage: string[];
}

export type TestStyle = "describe-it" | "test-expect" | "assert" | "should" | "expect" | "tdd" | "bdd";

export interface CodePatterns {
    namingConvention: string;
    commonImports: string[];
    mockingStrategy: string;
    fixturePattern: string | null;
    setupTeardown: string | null;
}

export interface CoverageGap {
    area: CoverageArea;
    description: string;
    affectedModules: string[];
    priority: "critical" | "high" | "medium" | "low";
}

// ============================================================================
// Configuration
// ============================================================================

export interface Spec2TestConfig {
    version: string;
    general: GeneralConfig;
    ai: AIConfig;
    generation: GenerationConfig;
    output: OutputConfig;
    integrations: IntegrationsConfig;
}

export interface GeneralConfig {
    projectName: string;
    language: Language;
    testFramework: TestFramework;
    includeEdgeCases: boolean;
    includeSecurity: boolean;
    includeAccessibility: boolean;
    includePerformance: boolean;
}

export interface AIConfig {
    provider: "openai" | "anthropic" | "local";
    model: string;
    maxTokens: number;
    temperature: number;
    apiKey: string;
    customPrompt?: string;
}

export interface GenerationConfig {
    maxTestsPerStory: number;
    minEdgeCasesPerStory: number;
    duplicateThreshold: number;
    generateDocumentation: boolean;
    generateSetupCode: boolean;
}

export interface OutputConfig {
    outputDir: string;
    fileNamePattern: string;
    format: "single-file" | "modular" | "component-based";
    includeTimestamp: boolean;
    overwrite: boolean;
}

export interface IntegrationsConfig {
    github: GitHubConfig;
    jira: JiraConfig | null;
    slack: SlackConfig | null;
}

export interface GitHubConfig {
    enabled: boolean;
    actionName: string;
    autoCommit: boolean;
    prComment: boolean;
}

export interface JiraConfig {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    autoSync: boolean;
}

export interface SlackConfig {
    enabled: boolean;
    webhookUrl: string;
    channel: string;
    notifyOnComplete: boolean;
}

// ============================================================================
// CLI Interfaces
// ============================================================================

export interface CLIOptions {
    verbose: boolean;
    config: string | null;
    output: string | null;
    framework: TestFramework | null;
    stories: string[];
    watch: boolean;
    dryRun: boolean;
}

// ============================================================================
// GitHub Action Interfaces
// ============================================================================

export interface GitHubActionInput {
    userStory: string;
    sourceDirectory: string;
    outputDirectory: string;
    framework: TestFramework;
    aiProvider: AIConfig["provider"];
    aiModel: string;
    aiApiKey: string;
    customPrompt: string;
    autoCommit: boolean;
    prComment: boolean;
}

// ============================================================================
// Results & Reporting
// ============================================================================

export interface GenerationResult {
    success: boolean;
    suite: TestSuite | null;
    warnings: string[];
    errors: string[];
    stats: GenerationStats;
}

export interface GenerationStats {
    storiesProcessed: number;
    testsGenerated: number;
    edgeCasesFound: number;
    coverageAreas: Record<CoverageArea, number>;
    processingTimeMs: number;
}

export interface TestRunResult {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    durationMs: number;
    failures: Failure[];
}

export interface Failure {
    testCaseId: string;
    errorMessage: string;
    stackTrace: string;
    screenshot?: string;
}
