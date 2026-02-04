# Unit Testing Guide

This document explains the testing strategy for excalirender and provides guidance on writing unit tests.

## Testing Philosophy

excalirender uses a **layered testing approach**:

| Test Type | Purpose | Location |
|-----------|---------|----------|
| Visual regression | Verify rendered output matches baselines | `tests/visual/` |
| Native tests | Verify binary works across Linux distros | `tests/native/` |
| Unit tests | Test isolated pure functions | `tests/*/run.ts` |
| Integration tests | Test CLI behavior end-to-end | Within test runners |

**Key principle**: Visual regression tests are the primary way to verify rendering correctness. Unit tests are for isolated utility functions that can be tested without canvas/rendering dependencies.

## Existing Test Structure

```
tests/
├── visual/           # Visual regression tests
│   ├── run.ts        # Test runner (bun run test:visual)
│   ├── fixtures/     # .excalidraw input files
│   ├── baselines/    # Expected PNG/SVG outputs
│   ├── output/       # Generated outputs (gitignored)
│   └── diffs/        # Diff images on failure (gitignored)
├── native/           # Native binary tests
│   └── run.ts        # Tests binary on different distros
└── recursive/        # Recursive feature tests
    └── run.ts        # Unit tests for scanner + integration tests
```

## When to Write Unit Tests

Write unit tests when:

1. **New isolated utilities** - Functions that don't depend on canvas, roughjs, or other rendering infrastructure
2. **Pure functions** - Functions that take input and return output without side effects
3. **Complex logic** - Algorithms that benefit from targeted testing of edge cases

Examples of good unit test candidates:
- File path manipulation
- JSON parsing/validation
- String transformation utilities
- Configuration processing

**Don't write unit tests for**:
- Rendering functions (use visual regression instead)
- Functions tightly coupled to canvas context
- Simple pass-through functions

## How to Write Unit Tests

### Test File Structure

Create a test runner file following the pattern in `tests/recursive/run.ts`:

```typescript
/**
 * Description of what this test file covers.
 *
 * Usage:
 *   bun run test:myfeature
 */

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function pass(name: string) {
  results.push({ name, passed: true });
  console.log(`  PASS  ${name}`);
}

function fail(name: string, error: string) {
  results.push({ name, passed: false, error });
  console.log(`  FAIL  ${name}`);
  console.log(`        ${error}`);
}

// Test functions
async function testExample() {
  const testName = "example: describes what is being tested";
  try {
    const result = myFunction("input");
    if (result !== "expected") {
      fail(testName, `Expected "expected", got "${result}"`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// Main
async function main() {
  console.log("My Feature Tests");
  console.log("=".repeat(50));

  await testExample();
  // ... more tests

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
```

### Adding to package.json

Add a script to run your tests:

```json
{
  "scripts": {
    "test:myfeature": "bun run tests/myfeature/run.ts"
  }
}
```

### Test Naming Convention

Use descriptive test names with the pattern: `<module>: <behavior being tested>`

```typescript
"scanner: finds .excalidraw files recursively"
"scanner: returns sorted file paths"
"scanner: throws for nonexistent directory"
```

## Running Tests

```bash
# Run all visual regression tests
bun run test:visual

# Update visual regression baselines
bun run test:visual --update

# Run recursive feature tests (unit + integration)
bun run test:recursive

# Run native binary tests
bun run test:native
```

## Integration Tests via Docker

For testing CLI behavior that requires the full rendering pipeline, use Docker:

```typescript
async function runDockerCli(
  args: string[],
  mounts: { host: string; container: string }[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const dockerArgs = ["docker", "run", "--rm"];

  for (const mount of mounts) {
    dockerArgs.push("-v", `${mount.host}:${mount.container}`);
  }

  dockerArgs.push("excalirender-builder", ...args);

  const proc = Bun.spawn(dockerArgs, {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}
```

This pattern is used in `tests/recursive/run.ts` for testing the `-r` flag end-to-end.

## Example: scanner.ts Unit Tests

The `src/scanner.ts` module demonstrates the ideal pattern:

1. **Isolated module** - `findExcalidrawFiles()` is a pure async function
2. **No rendering dependencies** - Uses only Bun's Glob API
3. **Targeted tests** - Each test verifies one specific behavior

```typescript
// Unit test for scanner
async function testScannerFindsFiles() {
  const testName = "scanner: finds .excalidraw files recursively";
  try {
    const files = await findExcalidrawFiles(testDir);
    if (files.length !== 2) {
      fail(testName, `Expected 2 files, got ${files.length}`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}
```

## CI Integration

Tests run automatically on PR via GitHub Actions:

- `typecheck` - TypeScript compilation check
- `lint` - Biome linter
- `visual-tests` - Visual regression tests
- `docker-build` - Docker image builds successfully
- `native-build` - Native Linux binary builds successfully

Add new test scripts to CI by updating `.github/workflows/ci.yml`.
