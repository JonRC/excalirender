/**
 * Automated tests for GIF diff export (src/diff-gif.ts).
 * Validates GIF structure using omggif: frame count, dimensions, delay, loop.
 *
 * Usage:
 *   bun run test:gif
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
// @ts-expect-error -- omggif has no type definitions
import { GifReader } from "omggif";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const TEMP_DIR = join(PROJECT_ROOT, "tests", "gif", "temp");
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

function createRectElement(
  id: string,
  x = 0,
  y = 0,
  width = 100,
  height = 100,
): object {
  return {
    id,
    type: "rectangle",
    x,
    y,
    width,
    height,
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
 * Write fixture files to temp dir and return their paths.
 */
function writeFixtures(
  oldElements: object[],
  newElements: object[],
): { oldPath: string; newPath: string } {
  const oldPath = join(TEMP_DIR, "old.excalidraw");
  const newPath = join(TEMP_DIR, "new.excalidraw");
  writeFileSync(oldPath, createExcalidrawFile(oldElements));
  writeFileSync(newPath, createExcalidrawFile(newElements));
  return { oldPath, newPath };
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

/**
 * Parse a GIF file and return a GifReader instance.
 */
function parseGif(filePath: string) {
  const buffer = readFileSync(filePath);
  return new GifReader(new Uint8Array(buffer));
}

// ============================================================================
// Group 1: Basic GIF Structure
// ============================================================================

async function testBasicDiffProducesValidGif() {
  const testName = "Basic diff produces valid GIF with 2 frames";
  try {
    const { oldPath, newPath } = writeFixtures(
      [createRectElement("a", 0, 0)],
      [createRectElement("b", 50, 50)],
    );
    const outputPath = join(TEMP_DIR, "basic.gif");

    const { exitCode, stderr } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      outputPath,
    ]);

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}. stderr: ${stderr}`);
      return;
    }

    if (!existsSync(outputPath)) {
      fail(testName, "Output GIF file was not created");
      return;
    }

    const gif = parseGif(outputPath);

    if (gif.numFrames() !== 2) {
      fail(testName, `Expected 2 frames, got ${gif.numFrames()}`);
      return;
    }
    if (gif.width <= 0) {
      fail(testName, `Expected width > 0, got ${gif.width}`);
      return;
    }
    if (gif.height <= 0) {
      fail(testName, `Expected height > 0, got ${gif.height}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testDefaultFrameDelay() {
  const testName = "Default frame delay is 100cs (1000ms)";
  try {
    const { oldPath, newPath } = writeFixtures(
      [createRectElement("a", 0, 0)],
      [createRectElement("b", 50, 50)],
    );
    const outputPath = join(TEMP_DIR, "default-delay.gif");

    const { exitCode } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      outputPath,
    ]);

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}`);
      return;
    }

    const gif = parseGif(outputPath);
    const frame0Delay = gif.frameInfo(0).delay;
    const frame1Delay = gif.frameInfo(1).delay;

    if (frame0Delay !== 100) {
      fail(testName, `Frame 0 delay: expected 100, got ${frame0Delay}`);
      return;
    }
    if (frame1Delay !== 100) {
      fail(testName, `Frame 1 delay: expected 100, got ${frame1Delay}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testCustomFrameDelay() {
  const testName = "Custom frame delay --delay 2000 produces 200cs";
  try {
    const { oldPath, newPath } = writeFixtures(
      [createRectElement("a", 0, 0)],
      [createRectElement("b", 50, 50)],
    );
    const outputPath = join(TEMP_DIR, "custom-delay.gif");

    const { exitCode } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      outputPath,
      "--delay",
      "2000",
    ]);

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}`);
      return;
    }

    const gif = parseGif(outputPath);
    const frame0Delay = gif.frameInfo(0).delay;

    if (frame0Delay !== 200) {
      fail(testName, `Frame 0 delay: expected 200, got ${frame0Delay}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testInfiniteLoop() {
  const testName = "GIF has infinite loop (loopCount = 0)";
  try {
    const { oldPath, newPath } = writeFixtures(
      [createRectElement("a", 0, 0)],
      [createRectElement("b", 50, 50)],
    );
    const outputPath = join(TEMP_DIR, "loop.gif");

    const { exitCode } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      outputPath,
    ]);

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}`);
      return;
    }

    const gif = parseGif(outputPath);
    const loopCount = gif.loopCount();

    if (loopCount !== 0) {
      fail(testName, `Expected loopCount 0, got ${loopCount}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ============================================================================
// Group 2: Options
// ============================================================================

async function testScaleDoublesDimensions() {
  const testName = "Scale 2 doubles dimensions vs scale 1";
  try {
    const { oldPath, newPath } = writeFixtures(
      [createRectElement("a", 0, 0)],
      [createRectElement("b", 50, 50)],
    );
    const outputPath1 = join(TEMP_DIR, "scale1.gif");
    const outputPath2 = join(TEMP_DIR, "scale2.gif");

    const { exitCode: ec1 } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      outputPath1,
      "-s",
      "1",
    ]);
    const { exitCode: ec2 } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      outputPath2,
      "-s",
      "2",
    ]);

    if (ec1 !== 0 || ec2 !== 0) {
      fail(testName, `CLI exited with codes ${ec1}, ${ec2}`);
      return;
    }

    const gif1 = parseGif(outputPath1);
    const gif2 = parseGif(outputPath2);

    if (gif2.width !== gif1.width * 2) {
      fail(testName, `Width: expected ${gif1.width * 2}, got ${gif2.width}`);
      return;
    }
    if (gif2.height !== gif1.height * 2) {
      fail(testName, `Height: expected ${gif1.height * 2}, got ${gif2.height}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testDarkMode() {
  const testName = "Dark mode produces valid 2-frame GIF";
  try {
    const { oldPath, newPath } = writeFixtures(
      [createRectElement("a", 0, 0)],
      [createRectElement("b", 50, 50)],
    );
    const outputPath = join(TEMP_DIR, "dark.gif");

    const { exitCode } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      outputPath,
      "--dark",
    ]);

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}`);
      return;
    }

    const gif = parseGif(outputPath);
    if (gif.numFrames() !== 2) {
      fail(testName, `Expected 2 frames, got ${gif.numFrames()}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testTransparent() {
  const testName = "Transparent produces valid 2-frame GIF";
  try {
    const { oldPath, newPath } = writeFixtures(
      [createRectElement("a", 0, 0)],
      [createRectElement("b", 50, 50)],
    );
    const outputPath = join(TEMP_DIR, "transparent.gif");

    const { exitCode } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      outputPath,
      "--transparent",
    ]);

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}`);
      return;
    }

    const gif = parseGif(outputPath);
    if (gif.numFrames() !== 2) {
      fail(testName, `Expected 2 frames, got ${gif.numFrames()}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testHideUnchanged() {
  const testName = "Hide unchanged produces valid 2-frame GIF";
  try {
    const { oldPath, newPath } = writeFixtures(
      [createRectElement("a", 0, 0), createRectElement("shared", 200, 200)],
      [createRectElement("b", 50, 50), createRectElement("shared", 200, 200)],
    );
    const outputPath = join(TEMP_DIR, "hide-unchanged.gif");

    const { exitCode } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      outputPath,
      "--hide-unchanged",
    ]);

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}`);
      return;
    }

    const gif = parseGif(outputPath);
    if (gif.numFrames() !== 2) {
      fail(testName, `Expected 2 frames, got ${gif.numFrames()}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ============================================================================
// Group 3: Edge Cases
// ============================================================================

async function testIdenticalFiles() {
  const testName = "Identical files: valid GIF, stderr has 'No differences'";
  try {
    const { oldPath, newPath } = writeFixtures(
      [createRectElement("a", 0, 0)],
      [createRectElement("a", 0, 0)],
    );
    const outputPath = join(TEMP_DIR, "identical.gif");

    const { exitCode, stdout, stderr } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      outputPath,
    ]);

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}`);
      return;
    }

    if (!existsSync(outputPath)) {
      fail(testName, "Output GIF file was not created");
      return;
    }

    const gif = parseGif(outputPath);
    if (gif.numFrames() !== 2) {
      fail(testName, `Expected 2 frames, got ${gif.numFrames()}`);
      return;
    }

    const output = stdout + stderr;
    if (!output.includes("No differences")) {
      fail(
        testName,
        `Expected output to contain "No differences", got: ${output}`,
      );
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testEmptyOldFile() {
  const testName = "Empty old file: valid GIF with 2 frames";
  try {
    const { oldPath, newPath } = writeFixtures(
      [],
      [createRectElement("b", 50, 50)],
    );
    const outputPath = join(TEMP_DIR, "empty-old.gif");

    const { exitCode } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      outputPath,
    ]);

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}`);
      return;
    }

    const gif = parseGif(outputPath);
    if (gif.numFrames() !== 2) {
      fail(testName, `Expected 2 frames, got ${gif.numFrames()}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testEmptyNewFile() {
  const testName = "Empty new file: valid GIF with 2 frames";
  try {
    const { oldPath, newPath } = writeFixtures(
      [createRectElement("a", 0, 0)],
      [],
    );
    const outputPath = join(TEMP_DIR, "empty-new.gif");

    const { exitCode } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      outputPath,
    ]);

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}`);
      return;
    }

    const gif = parseGif(outputPath);
    if (gif.numFrames() !== 2) {
      fail(testName, `Expected 2 frames, got ${gif.numFrames()}`);
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testBothEmpty() {
  const testName = "Both empty: no GIF, stderr has 'No elements'";
  try {
    const { oldPath, newPath } = writeFixtures([], []);
    const outputPath = join(TEMP_DIR, "both-empty.gif");

    const { exitCode, stdout, stderr } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      outputPath,
    ]);

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}`);
      return;
    }

    if (existsSync(outputPath)) {
      fail(testName, "GIF file should not be created for empty inputs");
      return;
    }

    const output = stdout + stderr;
    if (!output.includes("No elements")) {
      fail(
        testName,
        `Expected output to contain "No elements", got: ${output}`,
      );
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testModifiedElements() {
  const testName = "Modified elements: valid GIF, stderr has 'Modified: 1'";
  try {
    const { oldPath, newPath } = writeFixtures(
      [createRectElement("a", 0, 0, 100, 100)],
      [createRectElement("a", 50, 50, 100, 100)],
    );
    const outputPath = join(TEMP_DIR, "modified.gif");

    const { exitCode, stdout, stderr } = await runCli([
      "diff",
      oldPath,
      newPath,
      "-o",
      outputPath,
    ]);

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}`);
      return;
    }

    const gif = parseGif(outputPath);
    if (gif.numFrames() !== 2) {
      fail(testName, `Expected 2 frames, got ${gif.numFrames()}`);
      return;
    }

    const output = stdout + stderr;
    if (!output.includes("Modified: 1")) {
      fail(
        testName,
        `Expected output to contain "Modified: 1", got: ${output}`,
      );
      return;
    }

    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ============================================================================
// Group 4: Integration
// ============================================================================

async function testStdinSupport() {
  const testName = "Stdin support: pipe old file, valid GIF output";
  try {
    const oldContent = readFileSync(DIFF_BASE, "utf-8");
    const outputPath = join(TEMP_DIR, "stdin.gif");

    const { exitCode, stderr } = await runCli(
      ["diff", "-", DIFF_MODIFIED, "-o", outputPath],
      oldContent,
    );

    if (exitCode !== 0) {
      fail(testName, `CLI exited with code ${exitCode}. stderr: ${stderr}`);
      return;
    }

    if (!existsSync(outputPath)) {
      fail(testName, "Output GIF file was not created");
      return;
    }

    const gif = parseGif(outputPath);
    if (gif.numFrames() !== 2) {
      fail(testName, `Expected 2 frames, got ${gif.numFrames()}`);
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
  console.log("GIF Diff Tests");
  console.log("=".repeat(50));

  setupTempDir();

  console.log("\nGroup 1: Basic GIF Structure");
  await testBasicDiffProducesValidGif();
  await testDefaultFrameDelay();
  await testCustomFrameDelay();
  await testInfiniteLoop();

  console.log("\nGroup 2: Options");
  await testScaleDoublesDimensions();
  await testDarkMode();
  await testTransparent();
  await testHideUnchanged();

  console.log("\nGroup 3: Edge Cases");
  await testIdenticalFiles();
  await testEmptyOldFile();
  await testEmptyNewFile();
  await testBothEmpty();
  await testModifiedElements();

  console.log("\nGroup 4: Integration");
  await testStdinSupport();

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
