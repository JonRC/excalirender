import { basename } from "node:path";
import { Command } from "commander";
import type { ExportOptions } from "./types.js";

export interface CLIArgs {
  inputFile: string;
  options: ExportOptions;
}

export function parseArgs(): CLIArgs {
  const program = new Command();

  program
    .name("excalirender")
    .description("Convert .excalidraw files to PNG or SVG")
    .version("1.0.0")
    .argument("<input>", "Input .excalidraw file")
    .option(
      "-o, --output <path>",
      "Output file path (PNG or SVG, detected from extension)",
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
    console.error("Error: Input file is required");
    process.exit(1);
  }

  const inputFile = args[0];
  const outputPath =
    opts.output ||
    inputFile.replace(/\.excalidraw$/, ".png") ||
    `${basename(inputFile, ".excalidraw")}.png`;

  return {
    inputFile,
    options: {
      outputPath,
      scale: parseFloat(opts.scale) || 1,
      background: opts.background || null,
      darkMode: opts.dark || false,
      frameId: opts.frame || undefined,
    },
  };
}
