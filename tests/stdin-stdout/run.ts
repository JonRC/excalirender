/**
 * Unit tests for stdin/stdout piping and content passthrough (PR #9).
 *
 * Usage:
 *   bun run test:stdin-stdout
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { computeDiff, loadExcalidrawFile } from "../../src/diff-core.js";
import { exportDiffToExcalidraw } from "../../src/diff-excalidraw.js";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const TEMP_DIR = join(PROJECT_ROOT, "tests", "stdin-stdout", "temp");
const FIXTURES_DIR = join(PROJECT_ROOT, "tests", "visual", "fixtures");

const DIFF_BASE = join(FIXTURES_DIR, "diff-base.excalidraw");
const DIFF_MODIFIED = join(FIXTURES_DIR, "diff-modified.excalidraw");

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

function setupTempDir() {
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true });
  }
  mkdirSync(TEMP_DIR, { recursive: true });
}

function cleanup() {
  if (existsSync(TEMP_DIR)) {
    rmSync(TEMP_DIR, { recursive: true });
  }
}

function createExcalidrawFile(elements: object[]): string {
  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "test",
    elements,
    appState: { viewBackgroundColor: "#ffffff" },
  });
}

function createRectElement(id: string, x = 0, y = 0): object {
  return {
    id,
    type: "rectangle",
    x,
    y,
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
  };
}

/**
 * Run a CLI command and capture stdout, stderr, and exit code.
 */
async function runCli(
  args: string[],
  stdinContent?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "run", "src/index.ts", ...args], {
    cwd: PROJECT_ROOT,
    stdin: stdinContent ? new Blob([stdinContent]) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  return { stdout, stderr, exitCode };
}

// ============================================================================
// Group 1: loadExcalidrawFile with content param
// ============================================================================

async function testLoadFileContentBypassesIO() {
  const testName = "loadExcalidrawFile: content param bypasses file I/O";
  try {
    const content = createExcalidrawFile([createRectElement("elem-a")]);

    // Pass a non-existent path — should work because content is provided
    const data = loadExcalidrawFile("/nonexistent/path.excalidraw", content);

    if (data.type !== "excalidraw") {
      fail(testName, `Expected type "excalidraw", got "${data.type}"`);
      return;
    }
    if (data.elements.length !== 1) {
      fail(testName, `Expected 1 element, got ${data.elements.length}`);
      return;
    }
    if (data.elements[0].id !== "elem-a") {
      fail(
        testName,
        `Expected element id "elem-a", got "${data.elements[0].id}"`,
      );
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testLoadFileContentInvalidJSON() {
  const testName =
    "loadExcalidrawFile: content param validation - invalid JSON";
  try {
    try {
      loadExcalidrawFile("/any/path.excalidraw", "not valid json{{{");
      fail(testName, "Expected error to be thrown");
    } catch (e) {
      if (String(e).includes("Failed to parse")) {
        pass(testName);
      } else {
        fail(testName, `Wrong error: ${e}`);
      }
    }
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testLoadFileContentWrongType() {
  const testName = "loadExcalidrawFile: content param validation - wrong type";
  try {
    const content = JSON.stringify({ type: "not-excalidraw", elements: [] });
    try {
      loadExcalidrawFile("/any/path.excalidraw", content);
      fail(testName, "Expected error to be thrown");
    } catch (e) {
      if (String(e).includes("Invalid file format")) {
        pass(testName);
      } else {
        fail(testName, `Wrong error: ${e}`);
      }
    }
  } catch (e) {
    fail(testName, String(e));
  }
}

// ============================================================================
// Group 2: computeDiff with content params
// ============================================================================

async function testComputeDiffBothContentParams() {
  const testName =
    "computeDiff: content params produce same result as file-based";
  try {
    const oldContent = readFileSync(DIFF_BASE, "utf-8");
    const newContent = readFileSync(DIFF_MODIFIED, "utf-8");

    // File-based
    const fileDiff = computeDiff(DIFF_BASE, DIFF_MODIFIED);

    // Content-based (paths are placeholders)
    const contentDiff = computeDiff(
      "old.excalidraw",
      "new.excalidraw",
      oldContent,
      newContent,
    );

    if (fileDiff.added.length !== contentDiff.added.length) {
      fail(
        testName,
        `Added mismatch: file=${fileDiff.added.length}, content=${contentDiff.added.length}`,
      );
      return;
    }
    if (fileDiff.removed.length !== contentDiff.removed.length) {
      fail(
        testName,
        `Removed mismatch: file=${fileDiff.removed.length}, content=${contentDiff.removed.length}`,
      );
      return;
    }
    if (fileDiff.modified.length !== contentDiff.modified.length) {
      fail(
        testName,
        `Modified mismatch: file=${fileDiff.modified.length}, content=${contentDiff.modified.length}`,
      );
      return;
    }
    if (fileDiff.unchanged.length !== contentDiff.unchanged.length) {
      fail(
        testName,
        `Unchanged mismatch: file=${fileDiff.unchanged.length}, content=${contentDiff.unchanged.length}`,
      );
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testComputeDiffOnlyOldContent() {
  const testName = "computeDiff: only oldContent param works";
  try {
    const oldContent = readFileSync(DIFF_BASE, "utf-8");

    // Pass oldContent, let newPath read from file
    const diff = computeDiff(
      "placeholder.excalidraw",
      DIFF_MODIFIED,
      oldContent,
    );

    // Should produce the same results as fully file-based
    const fileDiff = computeDiff(DIFF_BASE, DIFF_MODIFIED);

    if (diff.added.length !== fileDiff.added.length) {
      fail(
        testName,
        `Added mismatch: ${diff.added.length} vs ${fileDiff.added.length}`,
      );
      return;
    }
    if (diff.removed.length !== fileDiff.removed.length) {
      fail(
        testName,
        `Removed mismatch: ${diff.removed.length} vs ${fileDiff.removed.length}`,
      );
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testComputeDiffOnlyNewContent() {
  const testName = "computeDiff: only newContent param works";
  try {
    const newContent = readFileSync(DIFF_MODIFIED, "utf-8");

    // Pass newContent, let oldPath read from file
    const diff = computeDiff(
      DIFF_BASE,
      "placeholder.excalidraw",
      undefined,
      newContent,
    );

    // Should produce the same results as fully file-based
    const fileDiff = computeDiff(DIFF_BASE, DIFF_MODIFIED);

    if (diff.added.length !== fileDiff.added.length) {
      fail(
        testName,
        `Added mismatch: ${diff.added.length} vs ${fileDiff.added.length}`,
      );
      return;
    }
    if (diff.removed.length !== fileDiff.removed.length) {
      fail(
        testName,
        `Removed mismatch: ${diff.removed.length} vs ${fileDiff.removed.length}`,
      );
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ============================================================================
// Group 3: exportDiffToExcalidraw with content/stdout
// ============================================================================

async function testExportDiffWithContentParams() {
  const testName =
    "exportDiffToExcalidraw: content params produce correct output";
  try {
    const oldContent = createExcalidrawFile([
      createRectElement("elem-a", 0, 0),
    ]);
    const newContent = createExcalidrawFile([
      createRectElement("elem-a", 50, 50), // modified
      createRectElement("elem-b", 100, 0), // added
    ]);

    const outputPath = join(TEMP_DIR, "content-diff.excalidraw");

    await exportDiffToExcalidraw(
      "old.excalidraw",
      "new.excalidraw",
      {
        outputPath,
        scale: 1,
        hideUnchanged: false,
        showTags: true,
        darkMode: false,
        transparent: false,
      },
      oldContent,
      newContent,
    );

    if (!existsSync(outputPath)) {
      fail(testName, "Output file was not created");
      return;
    }

    const content = readFileSync(outputPath, "utf-8");
    const parsed = JSON.parse(content);

    if (parsed.type !== "excalidraw") {
      fail(testName, `Expected type "excalidraw", got "${parsed.type}"`);
      return;
    }
    if (!Array.isArray(parsed.elements)) {
      fail(testName, "Missing elements array");
      return;
    }

    // Should have: modified elem-a + tag, added elem-b + tag = 4 elements
    // (no removed, no unchanged since both were passed as content)
    const nonTagElements = parsed.elements.filter(
      (el: { id: string }) => !el.id.endsWith("-tag"),
    );
    if (nonTagElements.length !== 2) {
      fail(
        testName,
        `Expected 2 non-tag elements, got ${nonTagElements.length}`,
      );
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testExportDiffToStdout() {
  const testName = "exportDiffToExcalidraw: stdout output produces valid JSON";
  try {
    const oldContent = createExcalidrawFile([
      createRectElement("elem-a", 0, 0),
    ]);
    const newContent = createExcalidrawFile([
      createRectElement("elem-b", 100, 0),
    ]);

    const oldPath = join(TEMP_DIR, "stdout-old.excalidraw");
    const newPath = join(TEMP_DIR, "stdout-new.excalidraw");
    writeFileSync(oldPath, oldContent);
    writeFileSync(newPath, newContent);

    // Use CLI to test stdout: diff old new -o - --format excalidraw
    const { stdout, exitCode } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      "-",
      "--format",
      "excalidraw",
    ]);

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}`);
      return;
    }

    // stdout should be valid excalidraw JSON
    const parsed = JSON.parse(stdout);
    if (parsed.type !== "excalidraw") {
      fail(testName, `Expected type "excalidraw", got "${parsed.type}"`);
      return;
    }
    if (!Array.isArray(parsed.elements)) {
      fail(testName, "Missing elements array");
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testExportDiffStdoutLogsToStderr() {
  const testName =
    "exportDiffToExcalidraw: status messages go to stderr when stdout";
  try {
    const oldContent = createExcalidrawFile([
      createRectElement("elem-a", 0, 0),
    ]);
    const newContent = createExcalidrawFile([
      createRectElement("elem-b", 100, 0),
    ]);

    const oldPath = join(TEMP_DIR, "stderr-old.excalidraw");
    const newPath = join(TEMP_DIR, "stderr-new.excalidraw");
    writeFileSync(oldPath, oldContent);
    writeFileSync(newPath, newContent);

    const { stdout, stderr, exitCode } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      "-",
      "--format",
      "excalidraw",
    ]);

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}`);
      return;
    }

    // Status messages should be on stderr
    if (!stderr.includes("Exported diff to")) {
      fail(
        testName,
        `Expected stderr to contain "Exported diff to", got: ${stderr}`,
      );
      return;
    }

    // stdout should be clean JSON (no log contamination)
    try {
      JSON.parse(stdout);
    } catch {
      fail(
        testName,
        "stdout is not clean JSON — likely contaminated by log messages",
      );
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ============================================================================
// Group 4: CLI validation errors
// ============================================================================

async function testValidationBothDiffInputsStdin() {
  const testName = "CLI validation: both diff inputs stdin rejected";
  try {
    const { stderr, exitCode } = await runCli(["diff", "-", "-"]);

    if (exitCode !== 1) {
      fail(testName, `Expected exit code 1, got ${exitCode}`);
      return;
    }
    if (!stderr.includes("Only one diff input can be stdin")) {
      fail(testName, `Expected error about stdin, got: ${stderr}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testValidationRecursiveStdin() {
  const testName = "CLI validation: recursive + stdin rejected";
  try {
    const { stderr, exitCode } = await runCli(["-r", "-"]);

    if (exitCode !== 1) {
      fail(testName, `Expected exit code 1, got ${exitCode}`);
      return;
    }
    if (!stderr.includes("Cannot read from stdin in recursive mode")) {
      fail(testName, `Expected error about recursive+stdin, got: ${stderr}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testValidationRecursiveStdout() {
  const testName = "CLI validation: recursive + stdout rejected";
  try {
    const { stderr, exitCode } = await runCli(["-r", "./tests", "-o", "-"]);

    if (exitCode !== 1) {
      fail(testName, `Expected exit code 1, got ${exitCode}`);
      return;
    }
    if (!stderr.includes("Cannot write to stdout in recursive mode")) {
      fail(testName, `Expected error about recursive+stdout, got: ${stderr}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ============================================================================
// Group 5: CLI stdin + diff integration
// ============================================================================

async function testDiffStdinOldFile() {
  const testName = "CLI integration: diff with stdin as old file";
  try {
    const baseContent = readFileSync(DIFF_BASE, "utf-8");
    const outputPath = join(TEMP_DIR, "stdin-diff-output.excalidraw");

    const { exitCode, stderr } = await runCli(
      ["diff", "-", DIFF_MODIFIED, "-o", outputPath],
      baseContent,
    );

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}. stderr: ${stderr}`);
      return;
    }

    if (!existsSync(outputPath)) {
      fail(testName, "Output file was not created");
      return;
    }

    const content = readFileSync(outputPath, "utf-8");
    const parsed = JSON.parse(content);

    if (parsed.type !== "excalidraw") {
      fail(testName, `Expected type "excalidraw", got "${parsed.type}"`);
      return;
    }

    // Compare with file-based diff to verify correctness
    const fileDiff = computeDiff(DIFF_BASE, DIFF_MODIFIED);
    const stdinElements = parsed.elements.filter(
      (el: { id: string }) => !el.id.endsWith("-tag"),
    );
    const expectedCount =
      fileDiff.added.length +
      fileDiff.removed.length +
      fileDiff.modified.length +
      fileDiff.unchanged.length;

    if (stdinElements.length !== expectedCount) {
      fail(
        testName,
        `Expected ${expectedCount} non-tag elements, got ${stdinElements.length}`,
      );
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testDiffStdinToStdout() {
  const testName =
    "CLI integration: diff stdin to stdout with --format excalidraw";
  try {
    const baseContent = readFileSync(DIFF_BASE, "utf-8");

    const { stdout, exitCode, stderr } = await runCli(
      ["diff", "-", DIFF_MODIFIED, "-o", "-", "--format", "excalidraw"],
      baseContent,
    );

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}. stderr: ${stderr}`);
      return;
    }

    // stdout should be valid excalidraw JSON
    const parsed = JSON.parse(stdout);

    if (parsed.type !== "excalidraw") {
      fail(testName, `Expected type "excalidraw", got "${parsed.type}"`);
      return;
    }
    if (!Array.isArray(parsed.elements)) {
      fail(testName, "Missing elements array");
      return;
    }

    // Verify stderr has status messages (not stdout)
    if (!stderr.includes("Exported diff to")) {
      fail(testName, "Expected stderr to contain status messages");
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
  console.log("Stdin/Stdout Unit Tests");
  console.log("=".repeat(50));

  setupTempDir();

  console.log("\nUnit Tests (loadExcalidrawFile - content param):");
  await testLoadFileContentBypassesIO();
  await testLoadFileContentInvalidJSON();
  await testLoadFileContentWrongType();

  console.log("\nUnit Tests (computeDiff - content params):");
  await testComputeDiffBothContentParams();
  await testComputeDiffOnlyOldContent();
  await testComputeDiffOnlyNewContent();

  console.log("\nUnit Tests (exportDiffToExcalidraw - content/stdout):");
  await testExportDiffWithContentParams();
  await testExportDiffToStdout();
  await testExportDiffStdoutLogsToStderr();

  console.log("\nCLI validation errors:");
  await testValidationBothDiffInputsStdin();
  await testValidationRecursiveStdin();
  await testValidationRecursiveStdout();

  console.log("\nCLI integration (stdin + diff):");
  await testDiffStdinOldFile();
  await testDiffStdinToStdout();

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
