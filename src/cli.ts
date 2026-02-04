import { basename } from "node:path";
import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import type { ExportOptions } from "./types.js";

export interface CLIArgs {
  inputPath: string;
  recursive: boolean;
  outputDir: string | null; // For recursive mode: output directory
  options: ExportOptions;
}

export function parseArgs(): CLIArgs {
  const program = new Command();

  program
    .name("excalirender")
    .description("Convert .excalidraw files to PNG or SVG")
    .version(packageJson.version)
    .argument("<input>", "Input .excalidraw file or directory (with -r)")
    .option(
      "-r, --recursive",
      "Recursively convert all .excalidraw files in directory",
      false,
    )
    .option(
      "-o, --output <path>",
      "Output file path, or output directory (with -r)",
    )
    .option("-s, --scale <number>", "Export scale factor", "1")
    .option("-b, --background <color>", "Background color (e.g., #ffffff)")
    .option("-d, --dark", "Enable dark mode export", false)
    .option(
      "-f, --frame <name>",
      "Export only the specified frame (by name or ID)",
    )
    .parse();

  const args = program.args;
  const opts = program.opts();

  if (args.length === 0) {
    console.error("Error: Input path is required");
    process.exit(1);
  }

  const inputPath = args[0];
  const recursive = opts.recursive || false;

  // In recursive mode, -o is treated as output directory
  // In single file mode, -o is the output file path
  let outputPath: string;
  let outputDir: string | null = null;

  if (recursive) {
    outputDir = opts.output || null;
    // For recursive mode, outputPath is a placeholder (computed per-file later)
    outputPath = "";
  } else {
    outputPath =
      opts.output ||
      inputPath.replace(/\.excalidraw$/, ".png") ||
      `${basename(inputPath, ".excalidraw")}.png`;
  }

  return {
    inputPath,
    recursive,
    outputDir,
    options: {
      outputPath,
      scale: parseFloat(opts.scale) || 1,
      background: opts.background || null,
      darkMode: opts.dark || false,
      frameId: opts.frame || undefined,
    },
  };
}
