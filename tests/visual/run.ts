/**
 * Visual regression test runner for excalirender.
 *
 * Usage:
 *   bun run tests/visual/run.ts              # Run tests (compare against baselines)
 *   bun run tests/visual/run.ts --update     # Update baseline images
 *   bun run tests/visual/run.ts --png-only   # Only run PNG tests
 *   bun run tests/visual/run.ts --svg-only   # Only run SVG tests
 *
 * Uses Docker to run the CLI (requires Cairo/Pango native libraries).
 * Each .excalidraw fixture in tests/visual/fixtures/ is converted to PNG and SVG.
 * PNG outputs are compared pixel-by-pixel against baselines in tests/visual/baselines/.
 * SVG outputs are rendered to PNG via resvg-js and compared against separate baselines.
 * Diff images are written to tests/visual/diffs/ on failure.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join, parse, relative } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const PROJECT_ROOT = join(import.meta.dir, "..", "..");
const TESTS_DIR = join(import.meta.dir);
const FIXTURES_DIR = join(TESTS_DIR, "fixtures");
const BASELINES_DIR = join(TESTS_DIR, "baselines");
const OUTPUT_DIR = join(TESTS_DIR, "output");
const DIFFS_DIR = join(TESTS_DIR, "diffs");

// Pixel diff threshold (0 = exact, 0.1 = small tolerance for anti-aliasing)
const PIXEL_THRESHOLD = 0.1;
// Maximum percentage of different pixels allowed (text anti-aliasing can vary between runs)
const MAX_DIFF_PERCENT = 1.0;
// SVG rendered via resvg may differ more from PNG baselines due to different rendering engines
const MAX_SVG_DIFF_PERCENT = 1.0;

type TestFormat = "png" | "svg";

interface TestCase {
  name: string;
  fixture: string;
  outputName: string;
  baselineName: string;
  darkMode: boolean;
  scale: number;
  format: TestFormat;
}

function discoverTests(): TestCase[] {
  const fixtures = readdirSync(FIXTURES_DIR).filter((f) =>
    f.endsWith(".excalidraw"),
  );
  const tests: TestCase[] = [];

  for (const fixture of fixtures) {
    const name = parse(fixture).name;

    // PNG test
    tests.push({
      name,
      fixture: join(FIXTURES_DIR, fixture),
      outputName: `${name}.png`,
      baselineName: `${name}.png`,
      darkMode: false,
      scale: 1,
      format: "png",
    });

    // SVG test (rendered to PNG via resvg for comparison)
    tests.push({
      name: `${name}--svg`,
      fixture: join(FIXTURES_DIR, fixture),
      outputName: `${name}.svg`,
      baselineName: `${name}--svg.png`,
      darkMode: false,
      scale: 1,
      format: "svg",
    });

    // Add dark mode variants for fixtures that test dark mode behavior
    if (name === "dark-mode" || name === "image-elements") {
      tests.push({
        name: `${name}--dark`,
        fixture: join(FIXTURES_DIR, fixture),
        outputName: `${name}--dark.png`,
        baselineName: `${name}--dark.png`,
        darkMode: true,
        scale: 1,
        format: "png",
      });

      tests.push({
        name: `${name}--dark--svg`,
        fixture: join(FIXTURES_DIR, fixture),
        outputName: `${name}--dark.svg`,
        baselineName: `${name}--dark--svg.png`,
        darkMode: true,
        scale: 1,
        format: "svg",
      });
    }
  }

  return tests;
}

async function buildDockerImage(): Promise<boolean> {
  console.log("Building Docker image...");
  const proc = Bun.spawn(["docker", "compose", "build", "cli"], {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    console.error("Docker build failed:", stderr);
    return false;
  }
  console.log("Docker image built successfully.\n");
  return true;
}

async function runCli(
  inputPath: string,
  outputPath: string,
  options: { darkMode?: boolean; scale?: number } = {},
): Promise<{ success: boolean; stderr: string }> {
  // Convert paths to be relative to project root (Docker mounts project root as /data)
  const relInput = relative(PROJECT_ROOT, inputPath);
  const relOutput = relative(PROJECT_ROOT, outputPath);

  const args = [
    "docker",
    "compose",
    "run",
    "--rm",
    "cli",
    relInput,
    "-o",
    relOutput,
  ];
  if (options.darkMode) args.push("--dark");
  if (options.scale && options.scale !== 1)
    args.push("-s", String(options.scale));

  const proc = Bun.spawn(args, {
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stderr = await new Response(proc.stderr).text();

  return { success: exitCode === 0, stderr };
}

/**
 * Render an SVG file to a PNG buffer using resvg-js.
 */
function renderSvgToPng(svgPath: string): Buffer {
  const svgData = readFileSync(svgPath, "utf-8");
  const resvg = new Resvg(svgData, {
    fitTo: { mode: "original" },
  });
  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}

function comparePngs(
  actualPath: string,
  baselinePath: string,
  diffPath: string,
  maxDiffPercent: number = MAX_DIFF_PERCENT,
): {
  match: boolean;
  diffPixels: number;
  totalPixels: number;
  diffPercent: number;
} {
  const actualBuf = readFileSync(actualPath);
  const baselineBuf = readFileSync(baselinePath);

  const actual = PNG.sync.read(actualBuf);
  const baseline = PNG.sync.read(baselineBuf);

  // Size mismatch
  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    return {
      match: false,
      diffPixels: -1,
      totalPixels: actual.width * actual.height,
      diffPercent: 100,
    };
  }

  const { width, height } = actual;
  const diff = new PNG({ width, height });
  const totalPixels = width * height;

  const diffPixels = pixelmatch(
    actual.data,
    baseline.data,
    diff.data,
    width,
    height,
    {
      threshold: PIXEL_THRESHOLD,
    },
  );

  const diffPercent = (diffPixels / totalPixels) * 100;

  // Write diff image if there are differences
  if (diffPixels > 0) {
    const diffBuffer = PNG.sync.write(diff);
    Bun.write(diffPath, diffBuffer);
  }

  return {
    match: diffPercent <= maxDiffPercent,
    diffPixels,
    totalPixels,
    diffPercent,
  };
}

/**
 * Compare PNG buffers (used for SVG tests where the "actual" is a rendered buffer).
 */
function comparePngBuffers(
  actualBuf: Buffer,
  baselinePath: string,
  diffPath: string,
  maxDiffPercent: number = MAX_SVG_DIFF_PERCENT,
): {
  match: boolean;
  diffPixels: number;
  totalPixels: number;
  diffPercent: number;
} {
  const baselineBuf = readFileSync(baselinePath);

  const actual = PNG.sync.read(actualBuf);
  const baseline = PNG.sync.read(baselineBuf);

  // Size mismatch
  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    return {
      match: false,
      diffPixels: -1,
      totalPixels: actual.width * actual.height,
      diffPercent: 100,
    };
  }

  const { width, height } = actual;
  const diff = new PNG({ width, height });
  const totalPixels = width * height;

  const diffPixels = pixelmatch(
    actual.data,
    baseline.data,
    diff.data,
    width,
    height,
    {
      threshold: PIXEL_THRESHOLD,
    },
  );

  const diffPercent = (diffPixels / totalPixels) * 100;

  if (diffPixels > 0) {
    const diffBuffer = PNG.sync.write(diff);
    Bun.write(diffPath, diffBuffer);
  }

  return {
    match: diffPercent <= maxDiffPercent,
    diffPixels,
    totalPixels,
    diffPercent,
  };
}

async function main() {
  const updateMode = process.argv.includes("--update");
  const pngOnly = process.argv.includes("--png-only");
  const svgOnly = process.argv.includes("--svg-only");

  // Ensure directories exist
  for (const dir of [BASELINES_DIR, OUTPUT_DIR, DIFFS_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  // Build Docker image first
  const built = await buildDockerImage();
  if (!built) {
    console.error("Cannot run tests without Docker image.");
    process.exit(1);
  }

  let tests = discoverTests();

  // Filter by format if requested
  if (pngOnly) {
    tests = tests.filter((t) => t.format === "png");
  } else if (svgOnly) {
    tests = tests.filter((t) => t.format === "svg");
  }

  console.log(`Visual Regression Tests`);
  console.log(`${"=".repeat(50)}`);
  console.log(`Mode: ${updateMode ? "UPDATE BASELINES" : "COMPARE"}`);
  const pngCount = tests.filter((t) => t.format === "png").length;
  const svgCount = tests.filter((t) => t.format === "svg").length;
  console.log(
    `Found ${tests.length} test case(s) (${pngCount} PNG, ${svgCount} SVG)\n`,
  );

  let passed = 0;
  let failed = 0;
  let updated = 0;
  let errors = 0;

  for (const test of tests) {
    const outputPath = join(OUTPUT_DIR, test.outputName);
    const baselinePath = join(BASELINES_DIR, test.baselineName);
    const diffPath = join(DIFFS_DIR, test.baselineName);

    // Generate output via Docker
    const result = await runCli(test.fixture, outputPath, {
      darkMode: test.darkMode,
      scale: test.scale,
    });

    if (!result.success) {
      console.log(`  FAIL  ${test.name} — CLI error: ${result.stderr.trim()}`);
      errors++;
      continue;
    }

    if (!existsSync(outputPath)) {
      console.log(`  FAIL  ${test.name} — output file not created`);
      errors++;
      continue;
    }

    // For SVG tests, render SVG to PNG via resvg
    let renderedPngBuf: Buffer | null = null;
    if (test.format === "svg") {
      try {
        renderedPngBuf = renderSvgToPng(outputPath);
      } catch (err) {
        console.log(`  FAIL  ${test.name} — SVG render error: ${err}`);
        errors++;
        continue;
      }
    }

    if (updateMode) {
      if (test.format === "svg" && renderedPngBuf) {
        // Write rendered PNG as baseline
        Bun.write(baselinePath, renderedPngBuf);
      } else {
        copyFileSync(outputPath, baselinePath);
      }
      console.log(`  UPDATED  ${test.name}`);
      updated++;
      continue;
    }

    // Compare mode
    if (!existsSync(baselinePath)) {
      console.log(`  MISSING  ${test.name} — no baseline (run with --update)`);
      failed++;
      continue;
    }

    let comparison: {
      match: boolean;
      diffPixels: number;
      totalPixels: number;
      diffPercent: number;
    };
    if (test.format === "svg" && renderedPngBuf) {
      comparison = comparePngBuffers(
        renderedPngBuf,
        baselinePath,
        diffPath,
        MAX_SVG_DIFF_PERCENT,
      );
    } else {
      comparison = comparePngs(
        outputPath,
        baselinePath,
        diffPath,
        MAX_DIFF_PERCENT,
      );
    }

    if (comparison.diffPixels === -1) {
      console.log(`  FAIL  ${test.name} — size mismatch`);
      failed++;
    } else if (comparison.match) {
      console.log(
        `  PASS  ${test.name} (${comparison.diffPercent.toFixed(2)}% diff)`,
      );
      passed++;
    } else {
      console.log(
        `  FAIL  ${test.name} — ${comparison.diffPixels} pixels differ (${comparison.diffPercent.toFixed(2)}%) — diff: ${diffPath}`,
      );
      failed++;
    }
  }

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  if (updateMode) {
    console.log(`Updated ${updated} baseline(s), ${errors} error(s)`);
  } else {
    console.log(`${passed} passed, ${failed} failed, ${errors} error(s)`);
  }

  if (failed > 0 || errors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
