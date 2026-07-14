import {
    TestCase,
    TestType,
    TestSeverity,
    CoverageArea,
    UserStory,
    AcceptanceCriterion,
    Scenario,
    CodebaseAnalysis,
    TestFramework,
    TestSuite,
    TestStep,
    GenerationResult,
    GenerationStats,
} from '../types/index.js';

/**
 * Generates test cases from user stories by analyzing acceptance criteria
 * and mapping them to appropriate test types based on the codebase analysis.
 */
export class TestGenerator {
    private testCounter = 0;
    private edgeCaseCounter = 0;
    private errorCaseCounter = 0;

    /**
     * Generate a complete test suite from user stories and codebase analysis.
     */
    generate(stories: UserStory[], analysis: CodebaseAnalysis): GenerationResult {
        const startTime = Date.now();
        const warnings: string[] = [];
        const errors: string[] = [];
        const allTests: TestCase[] = [];
        const coverageAreas: Record<string, number> = {
            'happy-path': 0,
            'edge-case': 0,
            'error-handling': 0,
            'security': 0,
            'performance': 0,
            'accessibility': 0,
            'internationalization': 0,
            'responsiveness': 0,
            'compatibility': 0,
            'usability': 0,
        };

        // Validate input
        if (stories.length === 0) {
            errors.push('No user stories provided for test generation');
            return {
                success: false,
                suite: null,
                warnings,
                errors,
                stats: this.getStats(startTime, 0, 0, coverageAreas),
            };
        }

        // Generate tests for each story
        for (const story of stories) {
            try {
                const storyTests = this.generateForStory(story, analysis);
                allTests.push(...storyTests);

                // Track coverage
                for (const test of storyTests) {
                    coverageAreas[test.coverage] = (coverageAreas[test.coverage] || 0) + 1;
                }
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                errors.push(`Failed to generate tests for story ${story.id}: ${errorMsg}`);
                warnings.push(`Story ${story.id} had partial generation`);
            }
        }

        // Detect potential duplicates
        const duplicates = this.detectDuplicates(allTests);
        if (duplicates.length > 0) {
            warnings.push(`Detected ${duplicates.length} potentially duplicate test cases`);
        }

        const stats = this.getStats(startTime, stories.length, allTests.length, coverageAreas);

        return {
            success: errors.length === 0,
            suite: this.buildTestSuite(allTests, stories, analysis.testFramework || 'jest'),
            warnings,
            errors,
            stats,
        };
    }

    /**
     * Generate tests for a single user story.
     */
    private generateForStory(story: UserStory, analysis: CodebaseAnalysis): TestCase[] {
        const tests: TestCase[] = [];

        // Generate happy-path tests from acceptance criteria
        for (const criterion of story.acceptanceCriteria) {
            const happyTests = this.generateFromAcceptanceCriterion(criterion, story, 'happy-path');
            tests.push(...happyTests);

            // Generate error-case tests
            const errorTests = this.generateErrorCases(criterion, story);
            tests.push(...errorTests);

            // Generate edge-case tests
            const edgeTests = this.generateEdgeCases(criterion, story);
            tests.push(...edgeTests);
        }

        // Generate security tests for high-priority stories
        if (story.metadata.priority === 'critical' || story.metadata.priority === 'high') {
            const securityTests = this.generateSecurityTests(story);
            tests.push(...securityTests);
        }

        // Generate performance tests for complex stories
        if (story.metadata.estimatedComplexity === 'complex') {
            const perfTests = this.generatePerformanceTests(story);
            tests.push(...perfTests);
        }

        // Generate tests for Gherkin scenarios
        for (const criterion of story.acceptanceCriteria) {
            if (criterion.scenario && criterion.scenario.length > 0) {
                const scenarioTests = this.generateFromScenarios(criterion.scenario, story);
                tests.push(...scenarioTests);
            }
        }

        // Add integration-level tests
        const integrationTests = this.generateIntegrationTests(story, analysis);
        tests.push(...integrationTests);

        return tests;
    }

    /**
     * Generate test cases from an acceptance criterion.
     */
    private generateFromAcceptanceCriterion(
        criterion: AcceptanceCriterion,
        story: UserStory,
        coverage: CoverageArea,
    ): TestCase[] {
        const tests: TestCase[] = [];

        // Main happy-path test
        const mainTest: TestCase = {
            id: this.getTestId('test'),
            title: `${story.title} - ${criterion.statement}`,
            description: `Verify that ${story.actor} can ${story.action.toLowerCase()} as described in: ${criterion.statement}`,
            type: this.determineTestType(story),
            severity: this.determineSeverity(story, criterion),
            tags: [...story.metadata.tags, criterion.id, story.id],
            steps: this.buildTestSteps(criterion, story),
            expectedOutcome: `The ${story.action} should succeed and ${story.purpose || 'the expected behavior should occur'}`,
            edgeCase: false,
            coverage,
        };

        tests.push(mainTest);

        // Add negative variant if the criterion implies validation
        if (this.isValidationCriterion(criterion.statement)) {
            const negativeTest = this.generateNegativeTest(criterion, story);
            tests.push(negativeTest);
        }

        return tests;
    }

    /**
     * Generate tests from Gherkin scenarios.
     */
    private generateFromScenarios(scenarios: Scenario[], story: UserStory): TestCase[] {
        const tests: TestCase[] = [];

        for (const scenario of scenarios) {
            const test: TestCase = {
                id: this.getTestId('scenario'),
                title: `${story.title} - Scenario: ${scenario.when}`,
                description: `Test scenario: Given ${scenario.given.join(', ')}, When ${scenario.when}, Then ${scenario.then.join(', ')}`,
                type: this.determineTestType(story),
                severity: 'critical',
                tags: [...story.metadata.tags, 'gherkin', scenario.when.substring(0, 50), story.id],
                steps: this.buildGherkinSteps(scenario),
                expectedOutcome: scenario.then.join(', '),
                edgeCase: false,
                coverage: 'happy-path',
            };

            tests.push(test);
        }

        return tests;
    }

    /**
     * Generate error-handling test cases.
     */
    private generateErrorCases(criterion: AcceptanceCriterion, story: UserStory): TestCase[] {
        const tests: TestCase[] = [];
        const entities = this.extractEntities(story);

        for (const entity of entities) {
            // Invalid input test
            const invalidInputTest: TestCase = {
                id: this.getTestId('error'),
                title: `${story.title} - Reject invalid ${entity} input`,
                description: `Verify that the system properly rejects invalid or malformed ${entity} input`,
                type: 'unit',
                severity: 'major',
                tags: [...story.metadata.tags, 'error-handling', entity, story.id],
                steps: [
                    { order: 1, action: `Prepare invalid ${entity} data with malformed or missing required fields` },
                    { order: 2, action: 'Pass the invalid data to the system' },
                    { order: 3, action: 'Verify the system rejects the input', assertion: 'Expected error response or validation message' },
                ],
                expectedOutcome: `The system should reject invalid ${entity} input with a clear error message`,
                edgeCase: false,
                coverage: 'error-handling',
            };
            tests.push(invalidInputTest);

            // Empty/null input test
            const nullInputTest: TestCase = {
                id: this.getTestId('error-null'),
                title: `${story.title} - Handle null/empty ${entity}`,
                description: `Verify that the system properly handles null or empty ${entity} values`,
                type: 'unit',
                severity: 'critical',
                tags: [...story.metadata.tags, 'error-handling', entity, 'null-input', story.id],
                steps: [
                    { order: 1, action: `Set ${entity} to null or empty value` },
                    { order: 2, action: 'Pass the null/empty value to the system' },
                    { order: 3, action: 'Verify the system handles gracefully', assertion: 'No crash, proper default or error handling' },
                ],
                expectedOutcome: `The system should handle null/empty ${entity} without crashing`,
                edgeCase: false,
                coverage: 'error-handling',
            };
            tests.push(nullInputTest);
        }

        return tests;
    }

    /**
     * Generate edge-case test cases.
     */
    private generateEdgeCases(_criterion: AcceptanceCriterion, story: UserStory): TestCase[] {
        const tests: TestCase[] = [];
        const entities = this.extractEntities(story);

        for (const entity of entities) {
            // Boundary value analysis
            const boundaryTest: TestCase = {
                id: this.getTestId('edge'),
                title: `${story.title} - Boundary value: ${entity}`,
                description: `Test boundary values for ${entity} (minimum, maximum, just outside boundaries)`,
                type: 'unit',
                severity: 'major',
                tags: [...story.metadata.tags, 'edge-case', 'boundary', entity, story.id],
                steps: [
                    { order: 1, action: `Test with minimum valid ${entity} value` },
                    { order: 2, action: 'Verify correct behavior' },
                    { order: 3, action: `Test with maximum valid ${entity} value` },
                    { order: 4, action: 'Verify correct behavior' },
                    { order: 5, action: `Test with value just outside ${entity} boundaries` },
                    { order: 6, action: 'Verify appropriate rejection' },
                ],
                expectedOutcome: 'Boundary values are handled correctly',
                edgeCase: true,
                coverage: 'edge-case',
            };
            tests.push(boundaryTest);

            // Large input test
            const largeInputTest: TestCase = {
                id: this.getTestId('edge-large'),
                title: `${story.title} - Large ${entity} input`,
                description: `Test handling of unusually large ${entity} input`,
                type: 'unit',
                severity: 'minor',
                tags: [...story.metadata.tags, 'edge-case', 'large-input', entity, story.id],
                steps: [
                    { order: 1, action: `Prepare ${entity} input at or near system limits` },
                    { order: 2, action: 'Submit the large input' },
                    { order: 3, action: 'Verify appropriate handling', assertion: 'No memory exhaustion, graceful degradation or rejection' },
                ],
                expectedOutcome: 'Large inputs are handled without system degradation',
                edgeCase: true,
                coverage: 'edge-case',
            };
            tests.push(largeInputTest);
        }

        return tests;
    }

    /**
     * Generate security-focused test cases.
     */
    private generateSecurityTests(story: UserStory): TestCase[] {
        const tests: TestCase[] = [];
        const entities = this.extractEntities(story);

        // SQL Injection test
        if (entities.some(e => ['user', 'login', 'password', 'email', 'data', 'input'].includes(e))) {
            const sqlInjectionTest: TestCase = {
                id: this.getTestId('security-sqli'),
                title: `${story.title} - SQL injection prevention`,
                description: 'Verify that user inputs are properly sanitized against SQL injection attacks',
                type: 'security',
                severity: 'blocker',
                tags: [...story.metadata.tags, 'security', 'sql-injection', story.id],
                steps: [
                    { order: 1, action: "Inject common SQL injection payloads into input fields" },
                    { order: 2, action: 'Submit the requests' },
                    { order: 3, action: 'Verify no unauthorized database access', assertion: 'Input is parameterized/sanitized' },
                ],
                expectedOutcome: 'SQL injection attempts are prevented',
                edgeCase: false,
                coverage: 'security',
            };
            tests.push(sqlInjectionTest);
        }

        // XSS prevention test
        const xssTest: TestCase = {
            id: this.getTestId('security-xss'),
            title: `${story.title} - XSS prevention`,
            description: 'Verify that user inputs are properly escaped to prevent cross-site scripting',
            type: 'security',
            severity: 'blocker',
            tags: [...story.metadata.tags, 'security', 'xss', story.id],
            steps: [
                { order: 1, action: 'Inject JavaScript payloads into all input fields' },
                { order: 2, action: 'Submit requests containing XSS payloads' },
                { order: 3, action: 'Verify payloads are sanitized', assertion: 'No script execution occurs' },
            ],
            expectedOutcome: 'XSS payloads are neutralized',
            edgeCase: false,
            coverage: 'security',
        };
        tests.push(xssTest);

        // Authentication/authorization test
        const authTest: TestCase = {
            id: this.getTestId('security-auth'),
            title: `${story.title} - Authorization check`,
            description: 'Verify that the actor can only perform authorized actions',
            type: 'security',
            severity: 'blocker',
            tags: [...story.metadata.tags, 'security', 'authorization', story.id],
            steps: [
                { order: 1, action: 'Attempt the action without proper authentication' },
                { order: 2, action: 'Attempt the action with insufficient permissions' },
                { order: 3, action: 'Verify access is denied', assertion: 'Unauthorized requests return 401/403' },
            ],
            expectedOutcome: 'Unauthorized access is properly denied',
            edgeCase: false,
            coverage: 'security',
        };
        tests.push(authTest);

        return tests;
    }

    /**
     * Generate performance-focused test cases.
     */
    private generatePerformanceTests(story: UserStory): TestCase[] {
        const tests: TestCase[] = [];

        const responseTimeTest: TestCase = {
            id: this.getTestId('perf-response'),
            title: `${story.title} - Response time`,
            description: 'Verify that the action completes within acceptable time bounds',
            type: 'performance',
            severity: 'major',
            tags: [...story.metadata.tags, 'performance', story.id],
            steps: [
                { order: 1, action: `Execute ${story.action.toLowerCase()} under normal load` },
                { order: 2, action: 'Measure response time' },
                { order: 3, action: 'Verify response time is within acceptable bounds', assertion: 'Response time < 2 seconds for typical operations' },
            ],
            expectedOutcome: 'Response time is within acceptable performance bounds',
            edgeCase: false,
            coverage: 'performance',
        };
        tests.push(responseTimeTest);

        const concurrentTest: TestCase = {
            id: this.getTestId('perf-concurrent'),
            title: `${story.title} - Concurrent users`,
            description: 'Verify the system handles concurrent users performing the same action',
            type: 'performance',
            severity: 'major',
            tags: [...story.metadata.tags, 'performance', 'concurrency', story.id],
            steps: [
                { order: 1, action: 'Simulate multiple concurrent users performing the action' },
                { order: 2, action: 'Monitor system performance metrics' },
                { order: 3, action: 'Verify system remains responsive', assertion: 'No degradation beyond acceptable thresholds' },
            ],
            expectedOutcome: 'System handles concurrent load without degradation',
            edgeCase: false,
            coverage: 'performance',
        };
        tests.push(concurrentTest);

        return tests;
    }

    /**
     * Generate integration-level test cases.
     */
    private generateIntegrationTests(story: UserStory, _analysis: CodebaseAnalysis): TestCase[] {
        const tests: TestCase[] = [];

        const integrationTest: TestCase = {
            id: this.getTestId('integration'),
            title: `${story.title} - End-to-end flow`,
            description: `Test the complete user flow: ${story.actor} ${story.action.toLowerCase()} across system boundaries`,
            type: 'e2e',
            severity: 'critical',
            tags: [...story.metadata.tags, 'integration', 'e2e', story.id],
            steps: [
                { order: 1, action: `Navigate to the application as ${story.actor}` },
                { order: 2, action: `Perform ${story.action.toLowerCase()}` },
                { order: 3, action: 'Verify downstream effects are triggered correctly' },
                { order: 4, action: 'Verify data persistence and consistency' },
            ],
            expectedOutcome: `The complete user flow succeeds with all downstream effects working correctly`,
            edgeCase: false,
            coverage: 'happy-path',
        };
        tests.push(integrationTest);

        return tests;
    }

    /**
     * Generate a negative test variant from an acceptance criterion.
     */
    private generateNegativeTest(criterion: AcceptanceCriterion, story: UserStory): TestCase {
        return {
            id: this.getTestId('negative'),
            title: `${story.title} - Negative: ${criterion.statement}`,
            description: `Verify that ${story.actor} CANNOT ${story.action.toLowerCase()} under invalid conditions`,
            type: 'unit',
            severity: 'critical',
            tags: [...story.metadata.tags, 'negative-test', criterion.id, story.id],
            steps: [
                { order: 1, action: `Set up invalid conditions for ${story.action.toLowerCase()}` },
                { order: 2, action: 'Attempt the action' },
                { order: 3, action: 'Verify the action fails gracefully', assertion: 'Appropriate error or validation message' },
            ],
            expectedOutcome: `The ${story.action} should fail with appropriate validation`,
            edgeCase: false,
            coverage: 'error-handling',
        };
    }

    // =========================================================================
    // Helper methods
    // =========================================================================

    /**
     * Build test steps from an acceptance criterion.
     */
    private buildTestSteps(criterion: AcceptanceCriterion, story: UserStory): TestStep[] {
        const steps: TestStep[] = [];
        let order = 1;

        // Setup step
        steps.push({
            order: order++,
            action: `Login or authenticate as ${story.actor}`,
        });

        // Action step
        steps.push({
            order: order++,
            action: story.action,
        });

        // Assertion step
        steps.push({
            order: order++,
            action: 'Verify the expected outcome',
            assertion: criterion.statement,
        });

        return steps;
    }

    /**
     * Build test steps from a Gherkin scenario.
     */
    private buildGherkinSteps(scenario: Scenario): TestStep[] {
        const steps: TestStep[] = [];
        let order = 1;

        // Given steps (setup)
        for (const given of scenario.given) {
            steps.push({
                order: order++,
                action: `Given: ${given}`,
            });
        }

        // When step
        steps.push({
            order: order++,
            action: `When: ${scenario.when}`,
        });

        // Then steps (assertions)
        for (const then of scenario.then) {
            steps.push({
                order: order++,
                action: `Then: ${then}`,
                assertion: then,
            });
        }

        return steps;
    }

    /**
     * Determine the appropriate test type for a story.
     */
    private determineTestType(story: UserStory): TestType {
        const actionLower = story.action.toLowerCase();

        if (actionLower.includes('api') || actionLower.includes('endpoint') || actionLower.includes('request')) {
            return 'api';
        }
        if (actionLower.includes('ui') || actionLower.includes('interface') || actionLower.includes('page')) {
            return 'e2e';
        }
        if (story.metadata.estimatedComplexity === 'complex') {
            return 'integration';
        }
        return 'unit';
    }

    /**
     * Determine the severity of a test based on the story and criterion.
     */
    private determineSeverity(story: UserStory, _criterion: AcceptanceCriterion): TestSeverity {
        switch (story.metadata.priority) {
            case 'critical':
                return 'blocker';
            case 'high':
                return 'critical';
            case 'medium':
                return 'major';
            case 'low':
                return 'minor';
            default:
                return 'major';
        }
    }

    /**
     * Check if a criterion implies validation.
     */
    private isValidationCriterion(statement: string): boolean {
        const validationKeywords = [
            'valid', 'invalid', 'required', 'validat', 'reject', 'accept',
            'error', 'invalid', 'malformed', 'proper', 'correct',
        ];
        return validationKeywords.some(keyword =>
            statement.toLowerCase().includes(keyword),
        );
    }

    /**
     * Extract key entities from a user story.
     */
    private extractEntities(story: UserStory): string[] {
        const text = `${story.title} ${story.description} ${story.action} ${story.actor}`.toLowerCase();
        const commonEntities = [
            'user', 'account', 'product', 'order', 'payment', 'session',
            'data', 'file', 'image', 'email', 'password', 'token',
            'input', 'form', 'button', 'link', 'page', 'resource',
            'document', 'report', 'notification', 'message', 'comment',
            'setting', 'configuration', 'profile', 'role', 'permission',
        ];

        const entities: string[] = [];
        for (const entity of commonEntities) {
            if (text.includes(entity)) {
                entities.push(entity);
            }
        }

        // If no entities found, use generic ones
        if (entities.length === 0) {
            entities.push('input', 'data', 'resource');
        }

        return entities;
    }

    /**
     * Detect duplicate test cases.
     */
    private detectDuplicates(tests: TestCase[]): TestCase[] {
        const seen = new Map<string, TestCase>();
        const duplicates: TestCase[] = [];

        for (const test of tests) {
            const key = test.title.toLowerCase().trim();
            const existing = seen.get(key);
            if (existing && existing.id !== test.id) {
                duplicates.push(test);
            }
            seen.set(key, test);
        }

        return duplicates;
    }

    /**
     * Generate a unique test ID.
     */
    private getTestId(prefix: string): string {
        const counter = prefix === 'edge' ? this.edgeCaseCounter++
            : prefix === 'error' || prefix.startsWith('error') ? this.errorCaseCounter++
                : this.testCounter++;
        return `${prefix}-${counter}`;
    }

    /**
     * Build the final test suite.
     */
    private buildTestSuite(tests: TestCase[], stories: UserStory[], framework: TestFramework): TestSuite {
        return {
            id: `suite-${Date.now()}`,
            title: `Generated Test Suite`,
            description: `Test suite auto-generated by Spec2Test from ${stories.length} user story(Stories)`,
            framework,
            tests,
            metadata: {
                generatedAt: new Date().toISOString(),
                specVersion: '1.0.0',
                sourceStories: stories.map(s => s.id),
                totalTests: tests.length,
                coveragePercentage: this.calculateCoveragePercentage(tests),
            },
        };
    }

    /**
     * Calculate coverage percentage based on coverage areas.
     */
    private calculateCoveragePercentage(tests: TestCase[]): number {
        const coverageTypes = new Set(tests.map(t => t.coverage));
        const totalTypes = Object.keys({
            'happy-path': 0,
            'edge-case': 0,
            'error-handling': 0,
            'security': 0,
            'performance': 0,
            'accessibility': 0,
            'internationalization': 0,
            'responsiveness': 0,
            'compatibility': 0,
            'usability': 0,
        }).length;

        return Math.round((coverageTypes.size / totalTypes) * 100);
    }

    /**
     * Generate generation statistics.
     */
    private getStats(
        startTime: number,
        storiesProcessed: number,
        testsGenerated: number,
        coverageAreas: Record<string, number>,
    ): GenerationStats {
        const edgeCases = Object.keys(coverageAreas).reduce((sum, area) => {
            if (area === 'edge-case') return sum + (coverageAreas[area] || 0);
            return sum;
        }, 0);

        return {
            storiesProcessed,
            testsGenerated,
            edgeCasesFound: edgeCases,
            coverageAreas: coverageAreas as unknown as Record<CoverageArea, number>,
            processingTimeMs: Date.now() - startTime,
        };
    }
}