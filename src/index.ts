#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { parseArgs } from "./cli.js";
import { exportCombined } from "./combine.js";
import {
  exportDiffToExcalidraw,
  exportDiffToGif,
  exportDiffToPng,
  exportDiffToSvg,
} from "./diff.js";
import { exportToPng } from "./export.js";
import { exportToSvg } from "./export-svg/index.js";
import { runInfo } from "./info.js";
import { findExcalidrawFiles } from "./scanner.js";
import type { ExportOptions } from "./types.js";

/**
 * Read content from stdin (synchronous).
 */
function readStdin(): string {
  return readFileSync("/dev/stdin", "utf-8");
}

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
    } else if (options.outputPath.endsWith(".pdf")) {
      await exportToPng(inputFile, options, undefined, "pdf");
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
    : baseOptions.outputPath.endsWith(".pdf")
      ? ".pdf"
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
    const args = parseArgs();

    if (args.command === "info") {
      const { inputPath, json } = args;
      const content = inputPath === "-" ? readStdin() : undefined;
      runInfo(inputPath, { json }, content);
    } else if (args.command === "combine") {
      const { inputPaths, format, options } = args;

      // Validate: at least 2 files
      if (inputPaths.length < 2) {
        console.error("Error: At least 2 input files required");
        process.exit(1);
      }

      // Validate: stdin not supported
      if (inputPaths.some((p) => p === "-")) {
        console.error("Error: Stdin (-) not supported for combine");
        process.exit(1);
      }

      // Validate: unsupported output formats
      const outputPath = options.outputPath === "-" ? "-" : options.outputPath;
      const ext = outputPath === "-" ? format || "png" : outputPath;
      if (ext.endsWith(".svg")) {
        console.error("Error: SVG output not supported for combine");
        process.exit(1);
      }
      if (ext.endsWith(".gif")) {
        console.error("Error: GIF output not supported for combine");
        process.exit(1);
      }
      if (ext.endsWith(".excalidraw")) {
        console.error("Error: .excalidraw output not supported for combine");
        process.exit(1);
      }

      await exportCombined(inputPaths, options);
    } else if (args.command === "diff") {
      const { oldPath, newPath, format, options } = args;

      // Validate: both diff inputs cannot be stdin
      if (oldPath === "-" && newPath === "-") {
        console.error("Error: Only one diff input can be stdin (-)");
        process.exit(1);
      }

      // Read stdin content for whichever input is "-"
      const stdinContent =
        oldPath === "-" || newPath === "-" ? readStdin() : undefined;
      const oldContent = oldPath === "-" ? stdinContent : undefined;
      const newContent = newPath === "-" ? stdinContent : undefined;

      // Determine output format: use --format for stdout, or extension for files
      const outputFormat =
        options.outputPath === "-"
          ? format || "png"
          : options.outputPath.endsWith(".excalidraw")
            ? "excalidraw"
            : options.outputPath.endsWith(".gif")
              ? "gif"
              : options.outputPath.endsWith(".svg")
                ? "svg"
                : options.outputPath.endsWith(".pdf")
                  ? "pdf"
                  : "png";

      if (outputFormat === "excalidraw") {
        await exportDiffToExcalidraw(
          oldPath,
          newPath,
          options,
          oldContent,
          newContent,
        );
      } else if (outputFormat === "gif") {
        await exportDiffToGif(
          oldPath,
          newPath,
          options,
          oldContent,
          newContent,
        );
      } else if (outputFormat === "svg") {
        await exportDiffToSvg(
          oldPath,
          newPath,
          options,
          oldContent,
          newContent,
        );
      } else if (outputFormat === "pdf") {
        await exportDiffToPng(
          oldPath,
          newPath,
          options,
          "pdf",
          oldContent,
          newContent,
        );
      } else {
        await exportDiffToPng(
          oldPath,
          newPath,
          options,
          "png",
          oldContent,
          newContent,
        );
      }
    } else {
      const { inputPath, recursive, outputDir, format, options } = args;

      // Validate: stdin incompatible with recursive mode
      if (inputPath === "-" && recursive) {
        console.error("Error: Cannot read from stdin in recursive mode");
        process.exit(1);
      }

      // Validate: stdout incompatible with recursive mode
      if ((options.outputPath === "-" || outputDir === "-") && recursive) {
        console.error("Error: Cannot write to stdout in recursive mode");
        process.exit(1);
      }

      // Read stdin content if input is "-"
      const content = inputPath === "-" ? readStdin() : undefined;

      // Determine output format: use --format for stdout, or extension for files
      const outputFormat =
        options.outputPath === "-"
          ? format || "png"
          : options.outputPath.endsWith(".svg")
            ? "svg"
            : options.outputPath.endsWith(".pdf")
              ? "pdf"
              : "png";

      if (recursive) {
        await processRecursive(inputPath, outputDir, options);
      } else if (outputFormat === "svg") {
        await exportToSvg(inputPath, options, content);
      } else if (outputFormat === "pdf") {
        await exportToPng(inputPath, options, content, "pdf");
      } else {
        await exportToPng(inputPath, options, content);
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
