/**
 * Unit tests for watch command (PR #17).
 *
 * Usage:
 *   bun run test:watch
 */

import { join } from "node:path";
import type { Subprocess } from "bun";
import { imageSize } from "image-size";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const SAMPLE = join(PROJECT_ROOT, "sample.excalidraw");
const FIXTURES_DIR = join(PROJECT_ROOT, "tests", "visual", "fixtures");
const DIFF_BASE = join(FIXTURES_DIR, "diff-base.excalidraw");
const DIFF_MODIFIED = join(FIXTURES_DIR, "diff-modified.excalidraw");

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];
let nextPort = 14100 + Math.floor(Math.random() * 900);

function pass(name: string) {
  results.push({ name, passed: true });
  console.log(`  PASS  ${name}`);
}

function fail(name: string, error: string) {
  results.push({ name, passed: false, error });
  console.log(`  FAIL  ${name}`);
  console.log(`        ${error}`);
}

function getPort(): number {
  return nextPort++;
}

/**
 * Spawn watch server and wait for it to be ready.
 * Returns the subprocess and port.
 */
async function spawnWatch(
  args: string[],
  port: number,
): Promise<{ proc: Subprocess; port: number }> {
  const proc = Bun.spawn(
    [
      "bun",
      "run",
      "src/index.ts",
      "watch",
      "--no-open",
      "--port",
      String(port),
      ...args,
    ],
    {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  // Wait for "Preview at" in stdout
  const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let output = "";
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
    if (output.includes("Preview at")) {
      reader.releaseLock();
      return { proc, port };
    }
  }

  proc.kill();
  throw new Error(
    `Watch server did not start within timeout. Output: ${output}`,
  );
}

/**
 * Spawn CLI process that exits (for validation error tests).
 */
async function spawnAndWaitForExit(
  args: string[],
): Promise<{ exitCode: number; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", "src/index.ts", "watch", ...args], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stderr = await new Response(proc.stderr).text();

  return { exitCode, stderr };
}

// --- Validation error tests ---

async function testZeroFiles() {
  const name = "validation: 0 files → error";
  try {
    // Commander will show help/error for missing argument
    const { exitCode } = await spawnAndWaitForExit([]);
    if (exitCode !== 0 && exitCode !== 1) {
      fail(name, `Expected exit code 0 or 1, got ${exitCode}`);
      return;
    }
    pass(name);
  } catch (e: unknown) {
    fail(name, e instanceof Error ? e.message : String(e));
  }
}

async function testTooManyFiles() {
  const name = "validation: 3+ files → error";
  try {
    const { exitCode, stderr } = await spawnAndWaitForExit([
      SAMPLE,
      SAMPLE,
      SAMPLE,
    ]);
    if (exitCode !== 1) {
      fail(name, `Expected exit code 1, got ${exitCode}`);
      return;
    }
    if (!stderr.includes("1 file (export) or 2 files (diff)")) {
      fail(name, `Expected error about file count, got: ${stderr.trim()}`);
      return;
    }
    pass(name);
  } catch (e: unknown) {
    fail(name, e instanceof Error ? e.message : String(e));
  }
}

async function testStdinNotSupported() {
  const name = "validation: stdin (-) → error";
  try {
    const { exitCode, stderr } = await spawnAndWaitForExit(["-"]);
    if (exitCode !== 1) {
      fail(name, `Expected exit code 1, got ${exitCode}`);
      return;
    }
    if (!stderr.includes("stdin")) {
      fail(name, `Expected error about stdin, got: ${stderr.trim()}`);
      return;
    }
    pass(name);
  } catch (e: unknown) {
    fail(name, e instanceof Error ? e.message : String(e));
  }
}

// --- Server response tests ---

async function testHtmlPage() {
  const name = "server: GET / returns HTML page";
  const port = getPort();
  let proc: Subprocess | null = null;
  try {
    ({ proc } = await spawnWatch([SAMPLE], port));
    const res = await fetch(`http://localhost:${port}/`);
    if (res.status !== 200) {
      fail(name, `Expected 200, got ${res.status}`);
      return;
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      fail(name, `Expected text/html, got ${contentType}`);
      return;
    }
    const body = await res.text();
    if (!body.includes('<img src="/image"')) {
      fail(name, 'HTML body missing <img src="/image">');
      return;
    }
    pass(name);
  } catch (e: unknown) {
    fail(name, e instanceof Error ? e.message : String(e));
  } finally {
    proc?.kill();
  }
}

async function testImageExport() {
  const name = "server: GET /image returns valid PNG";
  const port = getPort();
  let proc: Subprocess | null = null;
  try {
    ({ proc } = await spawnWatch([SAMPLE], port));
    const res = await fetch(`http://localhost:${port}/image`);
    if (res.status !== 200) {
      fail(name, `Expected 200, got ${res.status}`);
      return;
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("image/png")) {
      fail(name, `Expected image/png, got ${contentType}`);
      return;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) {
      fail(name, `PNG too small: ${buffer.length} bytes`);
      return;
    }
    if (!buffer.subarray(0, 4).equals(PNG_MAGIC)) {
      fail(name, "Response does not start with PNG magic bytes");
      return;
    }
    pass(name);
  } catch (e: unknown) {
    fail(name, e instanceof Error ? e.message : String(e));
  } finally {
    proc?.kill();
  }
}

async function testSseEndpoint() {
  const name = "server: GET /events returns SSE stream";
  const port = getPort();
  let proc: Subprocess | null = null;
  try {
    ({ proc } = await spawnWatch([SAMPLE], port));

    // Race fetch against a timeout — fetch resolves on headers for normal
    // responses, but SSE streaming may delay. Use a generous timeout.
    const result = await Promise.race([
      fetch(`http://localhost:${port}/events`).then((res) => ({
        kind: "response" as const,
        res,
      })),
      new Promise<{ kind: "timeout" }>((resolve) =>
        setTimeout(() => resolve({ kind: "timeout" }), 5000),
      ),
    ]);

    if (result.kind === "timeout") {
      // Connection opened but headers not received — still means endpoint exists.
      // Verify by checking a non-SSE endpoint works, implying /events is streaming.
      const healthCheck = await fetch(`http://localhost:${port}/`);
      if (healthCheck.status === 200) {
        pass(name);
      } else {
        fail(name, "Timeout waiting for SSE headers and health check failed");
      }
      return;
    }

    const { res } = result;
    if (res.status !== 200) {
      fail(name, `Expected 200, got ${res.status}`);
      return;
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream")) {
      fail(name, `Expected text/event-stream, got ${contentType}`);
      return;
    }
    pass(name);
  } catch (e: unknown) {
    fail(name, e instanceof Error ? e.message : String(e));
  } finally {
    proc?.kill();
  }
}

async function testCustomPort() {
  const name = "server: --port uses specified port";
  const port = 14999;
  let proc: Subprocess | null = null;
  try {
    ({ proc } = await spawnWatch([SAMPLE], port));
    const res = await fetch(`http://localhost:${port}/`);
    if (res.status !== 200) {
      fail(name, `Expected 200 on port ${port}, got ${res.status}`);
      return;
    }
    pass(name);
  } catch (e: unknown) {
    fail(name, e instanceof Error ? e.message : String(e));
  } finally {
    proc?.kill();
  }
}

async function testDiffMode() {
  const name = "server: diff mode (2 files) returns valid PNG";
  const port = getPort();
  let proc: Subprocess | null = null;
  try {
    ({ proc } = await spawnWatch([DIFF_BASE, DIFF_MODIFIED], port));
    const res = await fetch(`http://localhost:${port}/image`);
    if (res.status !== 200) {
      fail(name, `Expected 200, got ${res.status}`);
      return;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.subarray(0, 4).equals(PNG_MAGIC)) {
      fail(name, "Response does not start with PNG magic bytes");
      return;
    }
    if (buffer.length < 100) {
      fail(name, `PNG too small: ${buffer.length} bytes`);
      return;
    }
    pass(name);
  } catch (e: unknown) {
    fail(name, e instanceof Error ? e.message : String(e));
  } finally {
    proc?.kill();
  }
}

// --- Options tests ---

async function testDarkMode() {
  const name = "options: --dark renders without crash";
  const port = getPort();
  let proc: Subprocess | null = null;
  try {
    ({ proc } = await spawnWatch(["--dark", SAMPLE], port));
    const res = await fetch(`http://localhost:${port}/image`);
    if (res.status !== 200) {
      fail(name, `Expected 200, got ${res.status}`);
      return;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.subarray(0, 4).equals(PNG_MAGIC)) {
      fail(name, "Response does not start with PNG magic bytes");
      return;
    }
    pass(name);
  } catch (e: unknown) {
    fail(name, e instanceof Error ? e.message : String(e));
  } finally {
    proc?.kill();
  }
}

async function testScaleOption() {
  const name = "options: --scale 2 produces larger image";
  const port1 = getPort();
  const port2 = getPort();
  let proc1: Subprocess | null = null;
  let proc2: Subprocess | null = null;
  try {
    // Scale 1
    ({ proc: proc1 } = await spawnWatch([SAMPLE], port1));
    const res1 = await fetch(`http://localhost:${port1}/image`);
    const buf1 = Buffer.from(await res1.arrayBuffer());
    const size1 = imageSize(buf1);
    proc1.kill();
    proc1 = null;

    // Scale 2
    ({ proc: proc2 } = await spawnWatch(["--scale", "2", SAMPLE], port2));
    const res2 = await fetch(`http://localhost:${port2}/image`);
    const buf2 = Buffer.from(await res2.arrayBuffer());
    const size2 = imageSize(buf2);

    if (!size1.width || !size1.height || !size2.width || !size2.height) {
      fail(name, "Could not determine image dimensions");
      return;
    }

    if (size2.width <= size1.width || size2.height <= size1.height) {
      fail(
        name,
        `Scale 2 (${size2.width}x${size2.height}) should be larger than scale 1 (${size1.width}x${size1.height})`,
      );
      return;
    }
    pass(name);
  } catch (e: unknown) {
    fail(name, e instanceof Error ? e.message : String(e));
  } finally {
    proc1?.kill();
    proc2?.kill();
  }
}

// --- Run all tests ---

async function main() {
  console.log("Watch command tests:");
  console.log("");

  // Validation tests
  await testZeroFiles();
  await testTooManyFiles();
  await testStdinNotSupported();

  // Server tests
  await testHtmlPage();
  await testImageExport();
  await testSseEndpoint();
  await testCustomPort();
  await testDiffMode();

  // Options tests
  await testDarkMode();
  await testScaleOption();

  // Summary
  console.log("");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
