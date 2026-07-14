# Contributing to Spec2Test

First off, thank you for considering contributing to Spec2Test! All contributions are welcome and appreciated.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Architecture Overview](#architecture-overview)
- [Adding a New Test Type](#adding-a-new-test-type)
- [Adding a New Story Format](#adding-a-new-story-format)
- [Adding a New Integration](#adding-a-new-integration)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Semantic Versioning](#semantic-versioning)

## Code of Conduct

This project adheres to the [Contributor Covenant](https://www.contributor-covenant.org).
By participating, you are expected to uphold to this code.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Setup

```bash
# Clone the repository
git clone https://github.com/Senorpossum/spec2test.git
cd spec2test

# Install dependencies
npm ci

# Build the project
npm run build

# Run the test suite
npm test
```

### Development Workflow

```bash
# Watch mode for rapid iteration
npm run dev:watch

# Type checking without emitting
npm run typecheck

# Linting
npm run lint
npm run lint:fix    # auto-fix

# Formatting
npm run format
npm run format:fix
```

## Architecture Overview

Spec2Test follows a modular pipeline architecture:

```
Input -> Parser -> Analyzer -> Generator -> Output
```

### Directory Structure

```
src/
  cli/              # CLI entry point and watch mode
  generator/        # Test generation engine
  parser/           # User story parsers (Markdown, Jira, Linear, plain text)
  analyzer/         # Codebase analysis (filesystem, AST)
  types/            # Shared type definitions
```

### Key Classes

| Class              | File                                | Responsibility                              |
| ------------------ | ----------------------------------- | ------------------------------------------- |
| `StoryParser`      | `src/parser/story-parser.ts`        | Parses user stories from various formats    |
| `CodebaseAnalyzer` | `src/analyzer/codebase-analyzer.ts` | Analyzes source code structure and patterns |
| `TestGenerator`    | `src/generator/test-generator.ts`   | Generates test cases from stories           |
| `SpecGenerator`    | `src/generator/spec-generator.ts`   | Orchestrates the full pipeline              |
| `CLI`              | `src/cli/index.ts`                  | Command-line interface                      |

### Adding a New Test Type

To add a new test type (e.g., `mutation`, `graphql`, `snapshot`):

1. **Update types**: Add the new type to `TestType` in `src/types/index.ts`
2. **Add coverage area** (if applicable): Add to `CoverageArea` in `src/types/index.ts`
3. **Implement generation logic**: Add a method like `generateNewTestType()` in `src/generator/test-generator.ts`
4. **Wire into pipeline**: Call your new method from `generateForStory()`
5. **Update CLI**: Add a `--include-new-test-type` flag if it should be opt-in
6. **Document**: Update README.md with the new feature

### Adding a New Story Format

To add support for a new story format (e.g., Azure DevOps, Notion, Confluence):

1. **Detection method**: Add a method like `isNewFormatFormat()` in `src/parser/story-parser.ts`
2. **Parser method**: Implement `parseNewFormat()` in `src/parser/story-parser.ts`
3. **Route in main parser**: Add a branch in the `parse()` method
4. **Test**: Add example story files in `test/fixtures/` to validate parsing

### Adding a New Integration

To add a new integration (e.g., Jira, GitHub, Linear):

1. **Config**: Add configuration interface to `src/types/index.ts` (e.g., `AzureDevOpsConfig`)
2. **API client**: Create `src/integrations/azure-devops.ts` with API methods
3. **Generator integration**: Add a method like `generateFromAzureDevOps()` in `src/generator/spec-generator.ts`
4. **CLI**: Add integration flags to `src/cli/index.ts`
5. **Documentation**: Update README.md with integration instructions

### Testing

Run the test suite before submitting:

```bash
npm test
```

For coverage reporting:

```bash
npm run test:coverage
```

Tests live alongside source files (e.g., `src/parser/story-parser.test.ts`) or in a `test/` directory.

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run the full test suite (`npm test`)
5. Ensure linting passes (`npm run lint && npm run format`)
6. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
    - `feat:` new feature
    - `fix:` bug fix
    - `docs:` documentation changes
    - `refactor:` code refactoring
    - `test:` test updates
    - `chore:` maintenance
7. Push to your fork
8. Open a Pull Request

## Semantic Versioning

Spec2Test follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (x.x.x): Breaking API changes, significant architecture changes
- **MINOR** (x.x): New features, new parsers, new integrations
- **PATCH** (x.x.x): Bug fixes, documentation improvements, performance improvements

The public API (types exported from `src/index.ts`) must remain backward compatible within major versions.
