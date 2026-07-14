# Spec2Test

Automated test suite generation from user stories and specification documents. Analyzes your codebase to match existing patterns and generates tests in your preferred framework.

## Features

- User Story to Test Suite: Convert markdown files, Jira tickets, or plain text requirements into executable test definitions
- Codebase-Aware: Analyzes your existing code structure, test patterns, and framework conventions
- Multi-Framework Support: Jest, Vitest, Playwright, Cypress, and Mocha
- Comprehensive Coverage: Generates unit tests, integration tests, E2E tests, API tests, edge cases, security tests, accessibility tests, and performance tests
- CI/CD Ready: Integrates into CI pipelines or run locally
- Rich Reporting: Generates markdown documentation and JSON metadata for every test suite

## Installation

```bash
npm install -g spec2test
# or locally:
npm install --save-dev spec2test
```

## Quick Start

### 1. Create a user story file (`stories.md`)

```markdown
# User Stories

## US-001: User Login

As a registered user, I want to log in with my email and password so that I can access my account.

**Acceptance Criteria:**

- AC1: User can log in with valid credentials
    - Given the user has a registered account
    - When they enter valid email and password
    - Then they are redirected to their dashboard
- AC2: Invalid password shows error
    - Given the user has a registered account
    - When they enter wrong password
    - Then an error message "Invalid credentials" is shown
```

### 2. Run Spec2Test

```bash
spec2test generate \
  --stories stories.md \
  --source-dir ./src \
  --output-dir ./tests \
  --framework jest \
  --include-edge-cases \
  --include-security \
  --include-accessibility
```

### 3. Check Generated Tests

Spec2Test will generate:

```
tests/
├── generated-tests.jest.test.ts  # The test file
├── test-suite-metadata.json      # Test metadata and stats
└── TEST_COVERAGE.md              # Coverage documentation
```

## CLI Reference

```
spec2test generate --stories <file> [options]

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
  --dry-run              Show what would be generated without writing files
  --watch                Watch for changes and regenerate
```

## Configuration

Create a `spec2test.config.json` file:

```json
{
    "version": "1.0.0",
    "general": {
        "projectName": "my-app",
        "language": "typescript",
        "testFramework": "jest",
        "includeEdgeCases": true,
        "includeSecurity": true,
        "includeAccessibility": true,
        "includePerformance": false
    },
    "generation": {
        "maxTestsPerStory": 20,
        "minEdgeCasesPerStory": 3,
        "duplicateThreshold": 0.8,
        "generateDocumentation": true,
        "generateSetupCode": true
    },
    "output": {
        "outputDir": "./tests/generated",
        "fileNamePattern": "{{framework}}-{{date}}",
        "format": "single-file",
        "includeTimestamp": true,
        "overwrite": false
    }
}
```

## Integrations

### GitHub Action

```yaml
name: Generate Tests
on: [push]

jobs:
    generate:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - name: Generate Tests
              uses: Senorpossum/generate-tests@v1
              with:
                  user-story: ${{ github.event.pull_request.body }}
                  source-directory: ./src
                  output-directory: ./tests/generated
                  framework: jest
                  auto-commit: true
```

### Jira Integration

```bash
spec2test generate \
  --jira-base-url https://your-company.atlassian.net \
  --jira-api-key $JIRA_API_KEY \
  --tickets PROJ-123,PROJ-124,PROJ-125 \
  --source-dir ./src \
  --output-dir ./tests
```

## Architecture

```
src/
├── parser/
│   ├── story-parser.ts      # Parses markdown/Jira/plain text into UserStory objects
│   └── index.ts
├── analyzer/
│   └── codebase-analyzer.ts # Analyzes codebase structure, patterns, and gaps
├── generator/
│   ├── test-generator.ts     # Generates test cases from stories + analysis
│   └── spec-generator.ts     # Main orchestrator/pipeline
└── types/
    └── index.ts              # Core type definitions
```

Pipeline:

1. Parse: Input to UserStory objects
2. Analyze: Codebase to patterns, frameworks, existing tests
3. Generate: Stories + Analysis to TestSuite
4. Output: TestSuite to test files + documentation

## API Usage

```typescript
import { SpecGenerator } from "spec2test";

const generator = new SpecGenerator("./my-project/src");

const stories = [
    {
        id: "story-1",
        title: "User Login",
        description: "As a registered user, I want to log in...",
        actor: "registered-user",
        action: "log in with email and password",
        purpose: "access my account",
        acceptanceCriteria: [
            {
                id: "ac-1",
                statement: "User can log in with valid credentials",
                scenario: [
                    {
                        given: ["the user has a registered account"],
                        when: "they enter valid email and password",
                        then: ["they are redirected to their dashboard"],
                    },
                ],
            },
        ],
        metadata: {
            priority: "high",
            tags: ["auth", "login"],
            estimatedComplexity: "moderate",
            domain: "authentication",
        },
    },
];

const analysis = await generator["analyzeCodebase"]("./src", {});
const result = await generator.generateFromParsed(stories, analysis, {
    sourceDirectory: "./src",
    outputDirectory: "./tests",
    framework: "jest",
    language: "typescript",
    includeEdgeCases: true,
    includeSecurity: true,
    includeAccessibility: true,
    includePerformance: false,
});

await generator.writeTests(result, "./tests/generated");
```

## License

MIT
