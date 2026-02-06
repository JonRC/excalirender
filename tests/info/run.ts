/**
 * Unit tests for info command (PR #10).
 *
 * Usage:
 *   bun run test:info
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const TEMP_DIR = join(PROJECT_ROOT, "tests", "info", "temp");

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

function createExcalidrawFile(elements: object[], extra?: object): string {
  return JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "test",
    elements,
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
    ...extra,
  });
}

function createElement(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: `el-${Math.random().toString(36).slice(2, 8)}`,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    roughness: 1,
    opacity: 100,
    seed: 1,
    ...overrides,
  };
}

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

// ==== runInfo unit tests (via CLI) ====

async function testBasicInfo() {
  const testName = "info: basic element counts and canvas dimensions";
  try {
    const content = createExcalidrawFile([
      createElement({
        id: "r1",
        type: "rectangle",
        x: 10,
        y: 20,
        width: 100,
        height: 50,
      }),
      createElement({
        id: "r2",
        type: "rectangle",
        x: 200,
        y: 20,
        width: 80,
        height: 60,
      }),
      createElement({
        id: "e1",
        type: "ellipse",
        x: 50,
        y: 100,
        width: 40,
        height: 40,
      }),
    ]);
    const filePath = join(TEMP_DIR, "basic.excalidraw");
    writeFileSync(filePath, content);

    const { stdout, exitCode } = await runCli(["info", filePath]);
    if (exitCode !== 0) {
      fail(testName, `Exit code ${exitCode}`);
      return;
    }
    if (!stdout.includes("Elements: 3")) {
      fail(testName, `Expected "Elements: 3", got: ${stdout}`);
      return;
    }
    if (!stdout.includes("rectangle: 2")) {
      fail(testName, `Expected "rectangle: 2", got: ${stdout}`);
      return;
    }
    if (!stdout.includes("ellipse: 1")) {
      fail(testName, `Expected "ellipse: 1", got: ${stdout}`);
      return;
    }
    if (!stdout.includes("Canvas:")) {
      fail(testName, `Expected "Canvas:" in output`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testFonts() {
  const testName = "info: detects fonts from text elements";
  try {
    const content = createExcalidrawFile([
      createElement({
        id: "t1",
        type: "text",
        text: "Hello",
        fontFamily: 5,
        fontSize: 20,
      }),
      createElement({
        id: "t2",
        type: "text",
        text: "World",
        fontFamily: 6,
        fontSize: 16,
      }),
    ]);
    const filePath = join(TEMP_DIR, "fonts.excalidraw");
    writeFileSync(filePath, content);

    const { stdout, exitCode } = await runCli(["info", filePath]);
    if (exitCode !== 0) {
      fail(testName, `Exit code ${exitCode}`);
      return;
    }
    if (!stdout.includes("Excalifont")) {
      fail(testName, `Expected "Excalifont" in output`);
      return;
    }
    if (!stdout.includes("Nunito")) {
      fail(testName, `Expected "Nunito" in output`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testColors() {
  const testName = "info: collects stroke and fill colors";
  try {
    const content = createExcalidrawFile([
      createElement({
        id: "c1",
        strokeColor: "#e03131",
        backgroundColor: "#a5d8ff",
      }),
      createElement({
        id: "c2",
        strokeColor: "#2f9e44",
        backgroundColor: "transparent",
      }),
    ]);
    const filePath = join(TEMP_DIR, "colors.excalidraw");
    writeFileSync(filePath, content);

    const { stdout, exitCode } = await runCli(["info", filePath]);
    if (exitCode !== 0) {
      fail(testName, `Exit code ${exitCode}`);
      return;
    }
    if (!stdout.includes("#e03131")) {
      fail(testName, `Expected "#e03131" in stroke colors`);
      return;
    }
    if (!stdout.includes("#a5d8ff")) {
      fail(testName, `Expected "#a5d8ff" in fill colors`);
      return;
    }
    // "transparent" should NOT appear as a fill color
    if (stdout.includes("Fill:") && stdout.includes("transparent")) {
      fail(testName, `"transparent" should be excluded from fill colors`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testFrames() {
  const testName = "info: lists frame names";
  try {
    const content = createExcalidrawFile([
      createElement({
        id: "f1",
        type: "frame",
        name: "My Frame",
        width: 200,
        height: 200,
      }),
      createElement({
        id: "f2",
        type: "frame",
        name: "Second",
        width: 150,
        height: 100,
      }),
      createElement({ id: "r1", type: "rectangle" }),
    ]);
    const filePath = join(TEMP_DIR, "frames.excalidraw");
    writeFileSync(filePath, content);

    const { stdout, exitCode } = await runCli(["info", filePath]);
    if (exitCode !== 0) {
      fail(testName, `Exit code ${exitCode}`);
      return;
    }
    if (!stdout.includes("My Frame")) {
      fail(testName, `Expected "My Frame" in frames`);
      return;
    }
    if (!stdout.includes("Second")) {
      fail(testName, `Expected "Second" in frames`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testEmptyFile() {
  const testName = "info: empty file shows 0 elements and 0x0 canvas";
  try {
    const content = createExcalidrawFile([]);
    const filePath = join(TEMP_DIR, "empty.excalidraw");
    writeFileSync(filePath, content);

    const { stdout, exitCode } = await runCli(["info", filePath]);
    if (exitCode !== 0) {
      fail(testName, `Exit code ${exitCode}`);
      return;
    }
    if (!stdout.includes("Elements: 0")) {
      fail(testName, `Expected "Elements: 0"`);
      return;
    }
    if (!stdout.includes("Canvas: 0 x 0 px")) {
      fail(testName, `Expected "Canvas: 0 x 0 px"`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testDeletedElementsIgnored() {
  const testName = "info: deleted elements are ignored";
  try {
    const content = createExcalidrawFile([
      createElement({ id: "r1", type: "rectangle" }),
      createElement({ id: "r2", type: "rectangle", isDeleted: true }),
    ]);
    const filePath = join(TEMP_DIR, "deleted.excalidraw");
    writeFileSync(filePath, content);

    const { stdout, exitCode } = await runCli(["info", filePath]);
    if (exitCode !== 0) {
      fail(testName, `Exit code ${exitCode}`);
      return;
    }
    if (!stdout.includes("Elements: 1")) {
      fail(
        testName,
        `Expected "Elements: 1" (deleted ignored), got: ${stdout}`,
      );
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testJsonMode() {
  const testName = "info: --json produces valid JSON with correct structure";
  try {
    const content = createExcalidrawFile([
      createElement({ id: "r1", type: "rectangle", strokeColor: "#1e1e1e" }),
    ]);
    const filePath = join(TEMP_DIR, "json.excalidraw");
    writeFileSync(filePath, content);

    const { stdout, exitCode } = await runCli(["info", filePath, "--json"]);
    if (exitCode !== 0) {
      fail(testName, `Exit code ${exitCode}`);
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      fail(testName, "stdout is not valid JSON");
      return;
    }

    // Check required top-level fields
    const requiredFields = [
      "file",
      "size",
      "version",
      "source",
      "elements",
      "canvas",
      "background",
      "fonts",
      "colors",
      "frames",
      "embeddedFiles",
    ];
    for (const field of requiredFields) {
      if (!(field in parsed)) {
        fail(testName, `Missing field "${field}" in JSON output`);
        return;
      }
    }

    const elements = parsed.elements as {
      total: number;
      byType: Record<string, number>;
    };
    if (elements.total !== 1) {
      fail(testName, `Expected elements.total=1, got ${elements.total}`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testStdinInput() {
  const testName = "info: stdin input works and shows 'stdin' as file";
  try {
    const content = createExcalidrawFile([
      createElement({ id: "r1", type: "rectangle" }),
    ]);

    const { stdout, exitCode } = await runCli(["info", "-"], content);
    if (exitCode !== 0) {
      fail(testName, `Exit code ${exitCode}`);
      return;
    }
    if (!stdout.includes("File: stdin")) {
      fail(testName, `Expected "File: stdin", got: ${stdout}`);
      return;
    }
    if (!stdout.includes("Elements: 1")) {
      fail(testName, `Expected "Elements: 1"`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testStdinJsonSizeNull() {
  const testName = "info: stdin --json shows size as null";
  try {
    const content = createExcalidrawFile([
      createElement({ id: "r1", type: "rectangle" }),
    ]);

    const { stdout, exitCode } = await runCli(["info", "-", "--json"], content);
    if (exitCode !== 0) {
      fail(testName, `Exit code ${exitCode}`);
      return;
    }

    const parsed = JSON.parse(stdout);
    if (parsed.size !== null) {
      fail(testName, `Expected size=null for stdin, got ${parsed.size}`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ==== CLI error cases ====

async function testInvalidJson() {
  const testName = "CLI error: invalid JSON exits with error";
  try {
    const filePath = join(TEMP_DIR, "invalid.excalidraw");
    writeFileSync(filePath, "not json at all");

    const { exitCode, stderr } = await runCli(["info", filePath]);
    if (exitCode !== 1) {
      fail(testName, `Expected exit code 1, got ${exitCode}`);
      return;
    }
    if (!stderr.includes("Error")) {
      fail(testName, `Expected error message on stderr`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testWrongType() {
  const testName = "CLI error: wrong file type exits with error";
  try {
    const filePath = join(TEMP_DIR, "wrong-type.excalidraw");
    writeFileSync(
      filePath,
      JSON.stringify({ type: "not-excalidraw", elements: [] }),
    );

    const { exitCode, stderr } = await runCli(["info", filePath]);
    if (exitCode !== 1) {
      fail(testName, `Expected exit code 1, got ${exitCode}`);
      return;
    }
    if (!stderr.includes("excalidraw")) {
      fail(testName, `Expected error mentioning "excalidraw"`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testNonexistentFile() {
  const testName = "CLI error: nonexistent file exits with error";
  try {
    const { exitCode } = await runCli([
      "info",
      "/tmp/does-not-exist.excalidraw",
    ]);
    if (exitCode !== 1) {
      fail(testName, `Expected exit code 1, got ${exitCode}`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testMissingArg() {
  const testName = "CLI error: missing argument exits with error";
  try {
    const { exitCode } = await runCli(["info"]);
    if (exitCode !== 1) {
      fail(testName, `Expected exit code 1, got ${exitCode}`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ==== Main ====

async function main() {
  console.log("Info Command Unit Tests");
  console.log("==================================================");

  setupTempDir();

  console.log("\nUnit Tests (runInfo via CLI):");
  await testBasicInfo();
  await testFonts();
  await testColors();
  await testFrames();
  await testEmptyFile();
  await testDeletedElementsIgnored();
  await testJsonMode();
  await testStdinInput();
  await testStdinJsonSizeNull();

  console.log("\nCLI error cases:");
  await testInvalidJson();
  await testWrongType();
  await testNonexistentFile();
  await testMissingArg();

  cleanup();

  // Summary
  console.log("\n==================================================");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
