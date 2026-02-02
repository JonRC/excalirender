/**
 * Native bundle smoke test — verifies the self-contained tarball works on a
 * clean Ubuntu container with no pre-installed Cairo/Pango/graphics libraries.
 *
 * Prerequisites:
 *   bun run build:native    # produces dist/excalirender-linux-x64.tar.gz
 *
 * Usage:
 *   bun run test:native
 */

import { existsSync, readdirSync } from "node:fs";
import { join, parse } from "node:path";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const TARBALL = join(PROJECT_ROOT, "dist", "excalirender-linux-x64.tar.gz");
const FIXTURES_DIR = join(PROJECT_ROOT, "tests", "visual", "fixtures");

if (!existsSync(TARBALL)) {
  console.error(`Tarball not found: ${TARBALL}`);
  console.error('Run "bun run build:native" first.');
  process.exit(1);
}

interface TestCase {
  name: string;
  fixture: string;
  outputExt: string;
  extraArgs: string[];
}

// Auto-discover all .excalidraw fixtures and generate test cases
const fixtures = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith(".excalidraw"))
  .sort();
const tests: TestCase[] = [];

for (const fixture of fixtures) {
  const name = parse(fixture).name;

  // PNG export for every fixture
  tests.push({
    name: `${name} (PNG)`,
    fixture,
    outputExt: "png",
    extraArgs: [],
  });

  // SVG export for every fixture
  tests.push({
    name: `${name} (SVG)`,
    fixture,
    outputExt: "svg",
    extraArgs: [],
  });

  // Dark mode variants for relevant fixtures
  if (name === "dark-mode" || name === "image-elements") {
    tests.push({
      name: `${name} (dark PNG)`,
      fixture,
      outputExt: "png",
      extraArgs: ["--dark"],
    });
    tests.push({
      name: `${name} (dark SVG)`,
      fixture,
      outputExt: "svg",
      extraArgs: ["--dark"],
    });
  }
}

// Build the shell commands to run inside the container
const setupCmd = "cd /opt && tar xzf /dist/excalirender-linux-x64.tar.gz";
const cliPath = "/opt/excalirender/bin/excalirender";

const testCommands = tests.map((t, i) => {
  const input = `/fixtures/${t.fixture}`;
  const output = `/tmp/test-${i}.${t.outputExt}`;
  const args = t.extraArgs.join(" ");
  return `${cliPath} ${input} -o ${output} ${args} 2>&1 && echo "PASS: ${t.name}" || echo "FAIL: ${t.name}"`;
});

const fullScript = [
  setupCmd,
  // Verify no graphics libs are installed
  'dpkg -l 2>/dev/null | grep -qi libcairo && echo "WARN: libcairo found on system" || true',
  ...testCommands,
].join("\n");

console.log("Native Bundle Smoke Tests");
console.log("=".repeat(50));
console.log(
  `Found ${tests.length} test case(s) from ${fixtures.length} fixture(s)`,
);
console.log("Running tests on clean Ubuntu 22.04 container...\n");

const proc = Bun.spawn(
  [
    "docker",
    "run",
    "--rm",
    "-v",
    `${PROJECT_ROOT}/dist:/dist:ro`,
    "-v",
    `${FIXTURES_DIR}:/fixtures:ro`,
    "ubuntu:22.04",
    "bash",
    "-c",
    fullScript,
  ],
  { cwd: PROJECT_ROOT, stdout: "pipe", stderr: "pipe" },
);

const stdout = await new Response(proc.stdout).text();
const stderr = await new Response(proc.stderr).text();
const _exitCode = await proc.exited;

// Parse results
const lines = stdout.trim().split("\n");
let passed = 0;
let failed = 0;

for (const line of lines) {
  if (line.startsWith("PASS:")) {
    console.log(`  PASS  ${line.slice(6)}`);
    passed++;
  } else if (line.startsWith("FAIL:")) {
    console.log(`  FAIL  ${line.slice(6)}`);
    failed++;
  } else if (line.startsWith("Exported to")) {
    // Normal CLI output, skip
  } else if (line.startsWith("WARN:")) {
    console.log(`  ${line}`);
  } else if (line.trim()) {
    // Unexpected output — might be an error
    console.log(`  [info] ${line}`);
  }
}

console.log(`\n${"=".repeat(50)}`);
console.log(`${passed} passed, ${failed} failed`);

if (failed > 0 || passed === 0) {
  if (stderr.trim()) {
    console.error(`\nContainer stderr:\n${stderr}`);
  }
  process.exit(1);
}
