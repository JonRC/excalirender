/**
 * Unit tests for combine command.
 *
 * Usage:
 *   bun run test:combine
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { imageSize } from "image-size";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const TEMP_DIR = join(PROJECT_ROOT, "tests", "combine", "temp");
const FIXTURES_DIR = join(PROJECT_ROOT, "tests", "visual", "fixtures");

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
    isDeleted: false,
    ...overrides,
  };
}

async function runCli(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "run", "src/index.ts", ...args], {
    cwd: PROJECT_ROOT,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { stdout, stderr, exitCode };
}

// ==== Layout dimension tests ====

async function testHorizontalLayout() {
  const testName = "combine: horizontal layout dimensions correct";
  try {
    const file1 = join(TEMP_DIR, "a.excalidraw");
    const file2 = join(TEMP_DIR, "b.excalidraw");
    writeFileSync(
      file1,
      createExcalidrawFile([
        createElement({ id: "r1", width: 100, height: 50 }),
      ]),
    );
    writeFileSync(
      file2,
      createExcalidrawFile([
        createElement({ id: "r2", width: 80, height: 100 }),
      ]),
    );
    const output = join(TEMP_DIR, "horizontal.png");
    const { exitCode, stderr } = await runCli([
      "combine",
      file1,
      file2,
      "-o",
      output,
    ]);
    if (exitCode !== 0) {
      fail(testName, `Exit code ${exitCode}: ${stderr}`);
      return;
    }
    if (!existsSync(output)) {
      fail(testName, "Output file not created");
      return;
    }
    const dims = imageSize(readFileSync(output));
    if (!dims.width || !dims.height) {
      fail(testName, "Could not read image dimensions");
      return;
    }
    // Horizontal: width = panel1 + gap(40) + panel2, height = max(panel1, panel2)
    // Exact dims depend on padding, but width should be > 100+40+80=220
    if (dims.width < 220) {
      fail(testName, `Width ${dims.width} too small (expected > 220)`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testVerticalLayout() {
  const testName = "combine: vertical layout dimensions correct";
  try {
    const file1 = join(TEMP_DIR, "a2.excalidraw");
    const file2 = join(TEMP_DIR, "b2.excalidraw");
    writeFileSync(
      file1,
      createExcalidrawFile([
        createElement({ id: "r1", width: 100, height: 50 }),
      ]),
    );
    writeFileSync(
      file2,
      createExcalidrawFile([
        createElement({ id: "r2", width: 80, height: 100 }),
      ]),
    );
    const output = join(TEMP_DIR, "vertical.png");
    const { exitCode, stderr } = await runCli([
      "combine",
      file1,
      file2,
      "-o",
      output,
      "--layout",
      "vertical",
    ]);
    if (exitCode !== 0) {
      fail(testName, `Exit code ${exitCode}: ${stderr}`);
      return;
    }
    const dims = imageSize(readFileSync(output));
    if (!dims.width || !dims.height) {
      fail(testName, "Could not read image dimensions");
      return;
    }
    // Vertical: height = panel1 + gap(40) + panel2, width = max(panel1, panel2)
    if (dims.height < 50 + 40 + 100) {
      fail(testName, `Height ${dims.height} too small (expected > 190)`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ==== Gap option tests ====

async function testGapZero() {
  const testName = "combine: --gap 0 produces no gap";
  try {
    const file1 = join(TEMP_DIR, "g1.excalidraw");
    const file2 = join(TEMP_DIR, "g2.excalidraw");
    writeFileSync(
      file1,
      createExcalidrawFile([
        createElement({ id: "r1", width: 100, height: 50 }),
      ]),
    );
    writeFileSync(
      file2,
      createExcalidrawFile([
        createElement({ id: "r2", width: 100, height: 50 }),
      ]),
    );
    const outputGap0 = join(TEMP_DIR, "gap0.png");
    const outputGap40 = join(TEMP_DIR, "gap40.png");
    await runCli(["combine", file1, file2, "-o", outputGap0, "--gap", "0"]);
    await runCli(["combine", file1, file2, "-o", outputGap40]);
    const dims0 = imageSize(readFileSync(outputGap0));
    const dims40 = imageSize(readFileSync(outputGap40));
    if (!dims0.width || !dims40.width) {
      fail(testName, "Could not read image dimensions");
      return;
    }
    // gap 0 should produce narrower image than gap 40
    if (dims0.width >= dims40.width) {
      fail(
        testName,
        `Gap 0 width (${dims0.width}) should be less than gap 40 width (${dims40.width})`,
      );
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testCustomGap() {
  const testName = "combine: --gap 100 produces larger gap";
  try {
    const file1 = join(TEMP_DIR, "cg1.excalidraw");
    const file2 = join(TEMP_DIR, "cg2.excalidraw");
    writeFileSync(
      file1,
      createExcalidrawFile([
        createElement({ id: "r1", width: 100, height: 50 }),
      ]),
    );
    writeFileSync(
      file2,
      createExcalidrawFile([
        createElement({ id: "r2", width: 100, height: 50 }),
      ]),
    );
    const outputDefault = join(TEMP_DIR, "gapDefault.png");
    const outputBig = join(TEMP_DIR, "gap100.png");
    await runCli(["combine", file1, file2, "-o", outputDefault]);
    await runCli(["combine", file1, file2, "-o", outputBig, "--gap", "100"]);
    const dimsDefault = imageSize(readFileSync(outputDefault));
    const dimsBig = imageSize(readFileSync(outputBig));
    if (!dimsDefault.width || !dimsBig.width) {
      fail(testName, "Could not read image dimensions");
      return;
    }
    if (dimsBig.width <= dimsDefault.width) {
      fail(
        testName,
        `Gap 100 width (${dimsBig.width}) should be greater than default (${dimsDefault.width})`,
      );
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ==== Labels test ====

async function testLabels() {
  const testName = "combine: --labels adds height for labels";
  try {
    const file1 = join(TEMP_DIR, "l1.excalidraw");
    const file2 = join(TEMP_DIR, "l2.excalidraw");
    writeFileSync(
      file1,
      createExcalidrawFile([
        createElement({ id: "r1", width: 100, height: 50 }),
      ]),
    );
    writeFileSync(
      file2,
      createExcalidrawFile([
        createElement({ id: "r2", width: 100, height: 50 }),
      ]),
    );
    const outputNoLabels = join(TEMP_DIR, "noLabels.png");
    const outputLabels = join(TEMP_DIR, "withLabels.png");
    await runCli(["combine", file1, file2, "-o", outputNoLabels]);
    await runCli(["combine", file1, file2, "-o", outputLabels, "--labels"]);
    const dimsNo = imageSize(readFileSync(outputNoLabels));
    const dimsYes = imageSize(readFileSync(outputLabels));
    if (!dimsNo.height || !dimsYes.height) {
      fail(testName, "Could not read image dimensions");
      return;
    }
    if (dimsYes.height <= dimsNo.height) {
      fail(
        testName,
        `Labels height (${dimsYes.height}) should be greater than no-labels (${dimsNo.height})`,
      );
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ==== Output validation ====

async function testValidPng() {
  const testName = "combine: output is valid PNG";
  try {
    const file1 = join(FIXTURES_DIR, "basic-shapes.excalidraw");
    const file2 = join(FIXTURES_DIR, "arrows-lines.excalidraw");
    const output = join(TEMP_DIR, "valid.png");
    const { exitCode, stderr } = await runCli([
      "combine",
      file1,
      file2,
      "-o",
      output,
    ]);
    if (exitCode !== 0) {
      fail(testName, `Exit code ${exitCode}: ${stderr}`);
      return;
    }
    const buf = await Bun.file(output).arrayBuffer();
    const header = new Uint8Array(buf.slice(0, 8));
    // PNG magic bytes
    if (
      header[0] !== 0x89 ||
      header[1] !== 0x50 ||
      header[2] !== 0x4e ||
      header[3] !== 0x47
    ) {
      fail(testName, "File does not have PNG magic bytes");
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testThreeFiles() {
  const testName = "combine: supports 3+ input files";
  try {
    const file1 = join(TEMP_DIR, "t1.excalidraw");
    const file2 = join(TEMP_DIR, "t2.excalidraw");
    const file3 = join(TEMP_DIR, "t3.excalidraw");
    writeFileSync(
      file1,
      createExcalidrawFile([
        createElement({ id: "r1", width: 100, height: 50 }),
      ]),
    );
    writeFileSync(
      file2,
      createExcalidrawFile([
        createElement({ id: "r2", width: 100, height: 50 }),
      ]),
    );
    writeFileSync(
      file3,
      createExcalidrawFile([
        createElement({ id: "r3", width: 100, height: 50 }),
      ]),
    );
    const output = join(TEMP_DIR, "three.png");
    const { exitCode } = await runCli([
      "combine",
      file1,
      file2,
      file3,
      "-o",
      output,
    ]);
    if (exitCode !== 0) {
      fail(testName, `Exit code ${exitCode}`);
      return;
    }
    if (!existsSync(output)) {
      fail(testName, "Output file not created");
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ==== Error cases ====

async function testErrorLessThanTwoFiles() {
  const testName = "CLI error: combine with < 2 files exits with error";
  try {
    const file1 = join(TEMP_DIR, "e1.excalidraw");
    writeFileSync(file1, createExcalidrawFile([createElement({ id: "r1" })]));
    const { exitCode, stderr } = await runCli(["combine", file1]);
    if (exitCode === 0) {
      fail(testName, "Expected non-zero exit code");
      return;
    }
    if (!stderr.includes("At least 2 input files")) {
      fail(testName, `Expected error message about 2 files, got: ${stderr}`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testErrorSvgFormat() {
  const testName = "CLI error: combine to SVG exits with error";
  try {
    const file1 = join(TEMP_DIR, "es1.excalidraw");
    const file2 = join(TEMP_DIR, "es2.excalidraw");
    writeFileSync(file1, createExcalidrawFile([createElement({ id: "r1" })]));
    writeFileSync(file2, createExcalidrawFile([createElement({ id: "r2" })]));
    const { exitCode, stderr } = await runCli([
      "combine",
      file1,
      file2,
      "-o",
      "out.svg",
    ]);
    if (exitCode === 0) {
      fail(testName, "Expected non-zero exit code");
      return;
    }
    if (!stderr.includes("SVG output not supported")) {
      fail(testName, `Expected SVG error, got: ${stderr}`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testErrorGifFormat() {
  const testName = "CLI error: combine to GIF exits with error";
  try {
    const file1 = join(TEMP_DIR, "eg1.excalidraw");
    const file2 = join(TEMP_DIR, "eg2.excalidraw");
    writeFileSync(file1, createExcalidrawFile([createElement({ id: "r1" })]));
    writeFileSync(file2, createExcalidrawFile([createElement({ id: "r2" })]));
    const { exitCode, stderr } = await runCli([
      "combine",
      file1,
      file2,
      "-o",
      "out.gif",
    ]);
    if (exitCode === 0) {
      fail(testName, "Expected non-zero exit code");
      return;
    }
    if (!stderr.includes("GIF output not supported")) {
      fail(testName, `Expected GIF error, got: ${stderr}`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testErrorExcalidrawFormat() {
  const testName = "CLI error: combine to .excalidraw exits with error";
  try {
    const file1 = join(TEMP_DIR, "ex1.excalidraw");
    const file2 = join(TEMP_DIR, "ex2.excalidraw");
    writeFileSync(file1, createExcalidrawFile([createElement({ id: "r1" })]));
    writeFileSync(file2, createExcalidrawFile([createElement({ id: "r2" })]));
    const { exitCode, stderr } = await runCli([
      "combine",
      file1,
      file2,
      "-o",
      "out.excalidraw",
    ]);
    if (exitCode === 0) {
      fail(testName, "Expected non-zero exit code");
      return;
    }
    if (!stderr.includes(".excalidraw output not supported")) {
      fail(testName, `Expected .excalidraw error, got: ${stderr}`);
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

async function testNaNGapFallback() {
  const testName = "combine: --gap with invalid value falls back to 40";
  try {
    const file1 = join(TEMP_DIR, "nan1.excalidraw");
    const file2 = join(TEMP_DIR, "nan2.excalidraw");
    writeFileSync(
      file1,
      createExcalidrawFile([
        createElement({ id: "r1", width: 100, height: 50 }),
      ]),
    );
    writeFileSync(
      file2,
      createExcalidrawFile([
        createElement({ id: "r2", width: 100, height: 50 }),
      ]),
    );
    const outputNaN = join(TEMP_DIR, "gapNaN.png");
    const outputDefault = join(TEMP_DIR, "gapDef.png");
    await runCli(["combine", file1, file2, "-o", outputNaN, "--gap", "abc"]);
    await runCli(["combine", file1, file2, "-o", outputDefault]);
    const dimsNaN = imageSize(readFileSync(outputNaN));
    const dimsDefault = imageSize(readFileSync(outputDefault));
    if (!dimsNaN.width || !dimsDefault.width) {
      fail(testName, "Could not read image dimensions");
      return;
    }
    // Both should have the same width (gap 40 fallback)
    if (dimsNaN.width !== dimsDefault.width) {
      fail(
        testName,
        `NaN gap width (${dimsNaN.width}) should equal default width (${dimsDefault.width})`,
      );
      return;
    }
    pass(testName);
  } catch (e) {
    fail(testName, String(e));
  }
}

// ==== Run all tests ====

console.log("Combine Command Unit Tests");
console.log("==================================================\n");

setupTempDir();

console.log("Layout tests:");
await testHorizontalLayout();
await testVerticalLayout();

console.log("\nGap option tests:");
await testGapZero();
await testCustomGap();

console.log("\nLabels test:");
await testLabels();

console.log("\nOutput validation:");
await testValidPng();
await testThreeFiles();

console.log("\nError cases:");
await testErrorLessThanTwoFiles();
await testErrorSvgFormat();
await testErrorGifFormat();
await testErrorExcalidrawFormat();
await testNaNGapFallback();

cleanup();

console.log(`\n==================================================`);
const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
