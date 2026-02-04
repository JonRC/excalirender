/**
 * Recursive feature tests — unit tests for scanner and integration tests for -r flag.
 *
 * Usage:
 *   bun run test:recursive
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findExcalidrawFiles } from "../../src/scanner.js";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const FIXTURES_DIR = join(PROJECT_ROOT, "tests", "visual", "fixtures");
const TEMP_DIR = join(PROJECT_ROOT, "tests", "recursive", "temp");

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

// Clean up temp directory
function cleanup() {
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true });
  }
}

// Create temp directory structure for tests
function setupTempDir() {
  cleanup();
  mkdirSync(TEMP_DIR, { recursive: true });
  mkdirSync(join(TEMP_DIR, "subdir"), { recursive: true });
  mkdirSync(join(TEMP_DIR, "empty"), { recursive: true });
  mkdirSync(join(TEMP_DIR, "valid-only"), { recursive: true });

  // Create test .excalidraw files with a minimal rectangle element
  const minimalExcalidraw = JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "test",
    elements: [
      {
        id: "test-rect",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        strokeColor: "#000000",
        backgroundColor: "transparent",
        fillStyle: "hachure",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        seed: 1,
        angle: 0,
        groupIds: [],
        boundElements: null,
        isDeleted: false,
      },
    ],
    appState: { viewBackgroundColor: "#ffffff" },
  });

  writeFileSync(join(TEMP_DIR, "test1.excalidraw"), minimalExcalidraw);
  writeFileSync(join(TEMP_DIR, "test2.excalidraw"), minimalExcalidraw);
  writeFileSync(
    join(TEMP_DIR, "subdir", "nested.excalidraw"),
    minimalExcalidraw,
  );
  writeFileSync(join(TEMP_DIR, "other.txt"), "not an excalidraw file");
  writeFileSync(join(TEMP_DIR, "invalid.excalidraw"), "invalid json content");

  // Valid-only directory for tests that expect success
  writeFileSync(
    join(TEMP_DIR, "valid-only", "file1.excalidraw"),
    minimalExcalidraw,
  );
  writeFileSync(
    join(TEMP_DIR, "valid-only", "file2.excalidraw"),
    minimalExcalidraw,
  );
}

// ============================================================================
// Unit Tests for Scanner
// ============================================================================

async function testScannerFindsFiles() {
  const testName = "scanner: finds .excalidraw files recursively";
  try {
    // Test against valid-only dir which has exactly 2 files
    const files = await findExcalidrawFiles(join(TEMP_DIR, "valid-only"));
    if (files.length !== 2) {
      fail(testName, `Expected 2 files, got ${files.length}`);
      return;
    }
    if (!files.some((f) => f.endsWith("file1.excalidraw"))) {
      fail(testName, "Missing file1.excalidraw");
      return;
    }
    if (!files.some((f) => f.endsWith("file2.excalidraw"))) {
      fail(testName, "Missing file2.excalidraw");
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testScannerSortsFiles() {
  const testName = "scanner: returns sorted file paths";
  try {
    const files = await findExcalidrawFiles(join(TEMP_DIR, "valid-only"));
    const sorted = [...files].sort();
    if (JSON.stringify(files) !== JSON.stringify(sorted)) {
      fail(testName, "Files are not sorted");
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testScannerEmptyDir() {
  const testName = "scanner: returns empty array for empty directory";
  try {
    const files = await findExcalidrawFiles(join(TEMP_DIR, "empty"));
    if (files.length !== 0) {
      fail(testName, `Expected 0 files, got ${files.length}`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testScannerNonexistentDir() {
  const testName = "scanner: throws for nonexistent directory";
  try {
    await findExcalidrawFiles("/nonexistent/path");
    fail(testName, "Expected error to be thrown");
  } catch (e) {
    if (String(e).includes("Directory not found")) {
      pass(testName);
    } else {
      fail(testName, `Wrong error: ${e}`);
    }
  }
}

async function testScannerFileNotDir() {
  const testName = "scanner: throws when path is a file, not directory";
  try {
    await findExcalidrawFiles(join(TEMP_DIR, "test1.excalidraw"));
    fail(testName, "Expected error to be thrown");
  } catch (e) {
    if (String(e).includes("Not a directory")) {
      pass(testName);
    } else {
      fail(testName, `Wrong error: ${e}`);
    }
  }
}

async function testScannerWithFixtures() {
  const testName = "scanner: finds all fixtures in visual tests";
  try {
    const files = await findExcalidrawFiles(FIXTURES_DIR);
    if (files.length < 10) {
      fail(testName, `Expected at least 10 fixtures, got ${files.length}`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ============================================================================
// Integration Tests for Recursive Mode (via Docker)
// ============================================================================

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

async function testRecursiveBasic() {
  const testName = "recursive: converts all files in directory";
  const outputDir = join(TEMP_DIR, "output-basic");
  mkdirSync(outputDir, { recursive: true });

  try {
    const { stdout } = await runDockerCli(
      ["-r", "/input", "-o", "/output"],
      [
        { host: join(TEMP_DIR, "valid-only"), container: "/input" },
        { host: outputDir, container: "/output" },
      ],
    );

    if (!stdout.includes("Converting:")) {
      fail(testName, `Missing progress output. Got: ${stdout}`);
      return;
    }

    if (!stdout.includes("Converted 2/2")) {
      fail(testName, `Expected 2/2 converted. Got: ${stdout}`);
      return;
    }

    // Check that files were created on host
    if (!existsSync(join(outputDir, "file1.png"))) {
      fail(testName, "file1.png not created");
      return;
    }
    if (!existsSync(join(outputDir, "file2.png"))) {
      fail(testName, "file2.png not created");
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testRecursiveInPlace() {
  const testName = "recursive: outputs alongside input files without -o";
  const testDir = join(TEMP_DIR, "inplace-test");
  mkdirSync(testDir, { recursive: true });

  const minimalExcalidraw = JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "test",
    elements: [
      {
        id: "test-rect",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        strokeColor: "#000000",
        backgroundColor: "transparent",
        fillStyle: "hachure",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        seed: 1,
        angle: 0,
        groupIds: [],
        boundElements: null,
        isDeleted: false,
      },
    ],
    appState: { viewBackgroundColor: "#ffffff" },
  });
  writeFileSync(join(testDir, "inplace.excalidraw"), minimalExcalidraw);

  try {
    const { exitCode, stdout } = await runDockerCli(
      ["-r", "/data"],
      [{ host: testDir, container: "/data" }],
    );

    if (exitCode !== 0) {
      fail(
        testName,
        `Expected exit code 0, got ${exitCode}. Output: ${stdout}`,
      );
      return;
    }

    if (!existsSync(join(testDir, "inplace.png"))) {
      fail(testName, "inplace.png not created alongside input");
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testRecursiveWithOptions() {
  const testName = "recursive: applies --dark and -s options";
  const outputDir = join(TEMP_DIR, "output-options");
  mkdirSync(outputDir, { recursive: true });

  try {
    const { stdout } = await runDockerCli(
      ["-r", "/input", "-o", "/output", "--dark", "-s", "2"],
      [
        { host: join(TEMP_DIR, "valid-only"), container: "/input" },
        { host: outputDir, container: "/output" },
      ],
    );

    if (!stdout.includes("[1/")) {
      fail(testName, `Missing progress output. Got: ${stdout}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testRecursiveErrorHandling() {
  const testName = "recursive: continues on error and reports failures";
  const outputDir = join(TEMP_DIR, "output-errors");
  mkdirSync(outputDir, { recursive: true });

  // Create a directory with both valid and invalid files
  const mixedDir = join(TEMP_DIR, "mixed");
  mkdirSync(mixedDir, { recursive: true });
  writeFileSync(
    join(mixedDir, "valid.excalidraw"),
    JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "test",
      elements: [
        {
          id: "test-rect",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          strokeColor: "#000000",
          backgroundColor: "transparent",
          fillStyle: "hachure",
          strokeWidth: 1,
          strokeStyle: "solid",
          roughness: 1,
          opacity: 100,
          seed: 1,
          angle: 0,
          groupIds: [],
          boundElements: null,
          isDeleted: false,
        },
      ],
      appState: { viewBackgroundColor: "#ffffff" },
    }),
  );
  writeFileSync(join(mixedDir, "invalid.excalidraw"), "not valid json");

  try {
    const { stdout, stderr, exitCode } = await runDockerCli(
      ["-r", "/input", "-o", "/output"],
      [
        { host: mixedDir, container: "/input" },
        { host: outputDir, container: "/output" },
      ],
    );

    // Combine stdout and stderr for checking (errors go to stderr)
    const output = stdout + stderr;

    if (exitCode !== 1) {
      fail(
        testName,
        `Expected exit code 1 due to invalid file, got ${exitCode}`,
      );
      return;
    }

    if (!output.includes("Failed:")) {
      fail(testName, `Missing failure summary. Got: ${output}`);
      return;
    }

    if (!output.includes("Converted 1/2")) {
      fail(testName, `Expected partial success. Got: ${output}`);
      return;
    }

    // Valid file should still be converted
    if (!existsSync(join(outputDir, "valid.png"))) {
      fail(
        testName,
        "valid.png should have been created despite other failure",
      );
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testRecursiveEmptyDir() {
  const testName = "recursive: handles empty directory gracefully";
  const emptyDir = join(TEMP_DIR, "empty-test");
  mkdirSync(emptyDir, { recursive: true });

  try {
    const { stdout, exitCode } = await runDockerCli(
      ["-r", "/data"],
      [{ host: emptyDir, container: "/data" }],
    );

    if (exitCode !== 0) {
      fail(testName, `Expected exit code 0, got ${exitCode}`);
      return;
    }

    if (!stdout.includes("No .excalidraw files found")) {
      fail(testName, `Missing 'no files found' message. Got: ${stdout}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const unitOnly = process.argv.includes("--unit-only");

  console.log("Recursive Feature Tests");
  console.log("=".repeat(50));

  setupTempDir();

  console.log("\nUnit Tests (Scanner):");
  await testScannerFindsFiles();
  await testScannerSortsFiles();
  await testScannerEmptyDir();
  await testScannerNonexistentDir();
  await testScannerFileNotDir();
  await testScannerWithFixtures();

  if (!unitOnly) {
    console.log("\nIntegration Tests (Recursive Mode via Docker):");
    await testRecursiveBasic();
    await testRecursiveInPlace();
    await testRecursiveWithOptions();
    await testRecursiveErrorHandling();
    await testRecursiveEmptyDir();
  }

  cleanup();

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n${"=".repeat(50)}`);
  console.log(`${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
