#!/usr/bin/env node

import { basename, dirname, join, relative } from "node:path";
import { parseArgs } from "./cli.js";
import { exportToPng } from "./export.js";
import { exportToSvg } from "./export-svg.js";
import { findExcalidrawFiles } from "./scanner.js";
import type { ExportOptions } from "./types.js";

interface ConversionResult {
  file: string;
  success: boolean;
  error?: string;
}

/**
 * Compute output path for a file in recursive mode.
 * If outputDir is set, preserves relative structure from inputDir.
 * Otherwise, outputs alongside input file.
 */
function computeOutputPath(
  inputFile: string,
  inputDir: string,
  outputDir: string | null,
  outputExtension: string,
): string {
  const relativePath = relative(inputDir, inputFile);
  const outputFileName = relativePath.replace(/\.excalidraw$/, outputExtension);

  if (outputDir) {
    return join(outputDir, outputFileName);
  }
  return join(dirname(inputFile), basename(outputFileName));
}

/**
 * Convert a single file and return the result.
 */
async function convertFile(
  inputFile: string,
  options: ExportOptions,
): Promise<ConversionResult> {
  try {
    if (options.outputPath.endsWith(".svg")) {
      await exportToSvg(inputFile, options);
    } else {
      await exportToPng(inputFile, options);
    }
    return { file: inputFile, success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return { file: inputFile, success: false, error: errorMessage };
  }
}

/**
 * Process multiple files recursively with progress reporting.
 */
async function processRecursive(
  inputDir: string,
  outputDir: string | null,
  baseOptions: ExportOptions,
): Promise<void> {
  const files = await findExcalidrawFiles(inputDir);

  if (files.length === 0) {
    console.log(`No .excalidraw files found in ${inputDir}`);
    return;
  }

  // Determine output extension from baseOptions or default to .png
  const outputExtension = baseOptions.outputPath.endsWith(".svg")
    ? ".svg"
    : ".png";

  const results: ConversionResult[] = [];
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const outputPath = computeOutputPath(
      file,
      inputDir,
      outputDir,
      outputExtension,
    );

    console.log(`[${i + 1}/${total}] Converting: ${file}`);

    const options: ExportOptions = {
      ...baseOptions,
      outputPath,
    };

    const result = await convertFile(file, options);
    results.push(result);

    if (!result.success) {
      console.error(`  Error: ${result.error}`);
    }
  }

  // Summary
  const successes = results.filter((r) => r.success).length;
  const failures = results.filter((r) => !r.success);

  console.log("");
  console.log(`Converted ${successes}/${total} files successfully`);

  if (failures.length > 0) {
    console.error(`Failed: ${failures.length} file(s)`);
    for (const f of failures) {
      console.error(`  - ${f.file}: ${f.error}`);
    }
    process.exit(1);
  }
}

async function main() {
  try {
    const { inputPath, recursive, outputDir, options } = parseArgs();

    if (recursive) {
      await processRecursive(inputPath, outputDir, options);
    } else {
      if (options.outputPath.endsWith(".svg")) {
        await exportToSvg(inputPath, options);
      } else {
        await exportToPng(inputPath, options);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("An unexpected error occurred");
    }
    process.exit(1);
  }
}

main();
