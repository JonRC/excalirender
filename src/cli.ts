import { basename } from "node:path";
import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import type { DiffOptions } from "./diff.js";
import type { ExportOptions } from "./types.js";

export interface ExportCLIArgs {
  command: "export";
  inputPath: string;
  recursive: boolean;
  outputDir: string | null;
  format: string | undefined;
  options: ExportOptions;
}

export interface DiffCLIArgs {
  command: "diff";
  oldPath: string;
  newPath: string;
  format: string | undefined;
  options: DiffOptions;
}

export interface InfoCLIArgs {
  command: "info";
  inputPath: string;
  json: boolean;
}

export type CLIArgs = ExportCLIArgs | DiffCLIArgs | InfoCLIArgs;

/**
 * Generate default output filename for diff command.
 */
export function generateDefaultDiffOutput(
  oldPath: string,
  newPath: string,
): string {
  const oldBase = basename(oldPath, ".excalidraw");
  const newBase = basename(newPath, ".excalidraw");
  return `${oldBase}_vs_${newBase}.png`;
}

function parseDiffArgs(): DiffCLIArgs {
  const program = new Command();

  program
    .name("excalirender diff")
    .description("Create a visual diff between two .excalidraw files")
    .argument("<old>", "Path to the old/original .excalidraw file")
    .argument("<new>", "Path to the new/modified .excalidraw file")
    .option(
      "-o, --output <path>",
      "Output file path (.png, .svg, .pdf, or .excalidraw)",
    )
    .option("-s, --scale <number>", "Export scale factor", "1")
    .option("-d, --dark", "Enable dark mode export", false)
    .option("--transparent", "Transparent background (no fill)", false)
    .option("--hide-unchanged", "Don't render unchanged elements", false)
    .option("--no-tags", "Don't render status tags below elements")
    .option(
      "--format <type>",
      "Output format when using stdout (-o -): png, svg",
    )
    .parse(process.argv.slice(1)); // Skip 'diff' from argv

  const args = program.args;
  const opts = program.opts();

  if (args.length < 2) {
    console.error("Error: Both old and new file paths are required");
    process.exit(1);
  }

  // Generate default output name if not specified
  const outputPath = opts.output || generateDefaultDiffOutput(args[0], args[1]);

  return {
    command: "diff",
    oldPath: args[0],
    newPath: args[1],
    format: opts.format || undefined,
    options: {
      outputPath,
      scale: parseFloat(opts.scale) || 1,
      hideUnchanged: opts.hideUnchanged || false,
      showTags: opts.tags !== false, // --no-tags sets opts.tags to false
      darkMode: opts.dark || false,
      transparent: opts.transparent || false,
    },
  };
}

function parseExportArgs(): ExportCLIArgs {
  const program = new Command();

  program
    .name("excalirender")
    .description("Convert .excalidraw files to PNG, SVG, or PDF")
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
    .option("--transparent", "Transparent background (no fill)", false)
    .option(
      "-f, --frame <name>",
      "Export only the specified frame (by name or ID)",
    )
    .option(
      "--format <type>",
      "Output format when using stdout (-o -): png, svg",
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

  let outputPath: string;
  let outputDir: string | null = null;

  if (recursive) {
    outputDir = opts.output || null;
    outputPath = "";
  } else {
    outputPath =
      opts.output ||
      inputPath.replace(/\.excalidraw$/, ".png") ||
      `${basename(inputPath, ".excalidraw")}.png`;
  }

  return {
    command: "export",
    inputPath,
    recursive,
    outputDir,
    format: opts.format || undefined,
    options: {
      outputPath,
      scale: parseFloat(opts.scale) || 1,
      background: opts.transparent ? "transparent" : opts.background || null,
      darkMode: opts.dark || false,
      frameId: opts.frame || undefined,
    },
  };
}

function parseInfoArgs(): InfoCLIArgs {
  const program = new Command();

  program
    .name("excalirender info")
    .description("Show metadata about an .excalidraw file")
    .argument("<input>", "Input .excalidraw file (or - for stdin)")
    .option("--json", "Output metadata as JSON", false)
    .parse(process.argv.slice(1)); // Skip 'info' from argv

  const args = program.args;
  const opts = program.opts();

  if (args.length === 0) {
    console.error("Error: Input path is required");
    process.exit(1);
  }

  return {
    command: "info",
    inputPath: args[0],
    json: opts.json || false,
  };
}

function showHelp(): void {
  console.log(`Usage: excalirender [options] <input>
       excalirender diff [options] <old> <new>
       excalirender info [options] <input>

Convert .excalidraw files to PNG, SVG, or PDF

Commands:
  diff <old> <new>            Create a visual diff between two .excalidraw files
  info <input>                Show metadata about an .excalidraw file

Arguments:
  input                       Input .excalidraw file or directory (with -r)

Options:
  -V, --version               output the version number
  -r, --recursive             Recursively convert all .excalidraw files in
                              directory (default: false)
  -o, --output <path>         Output file path, or output directory (with -r)
  -s, --scale <number>        Export scale factor (default: "1")
  -b, --background <color>    Background color (e.g., #ffffff)
  -d, --dark                  Enable dark mode export (default: false)
  --transparent               Transparent background (no fill) (default: false)
  -f, --frame <name>          Export only the specified frame (by name or ID)
  --format <type>             Output format when using stdout (-o -): png, svg
  -h, --help                  display help for command

Run 'excalirender diff --help' for diff command options.
Run 'excalirender info --help' for info command options.`);
}

export function parseArgs(): CLIArgs {
  // Check if first non-option argument is 'diff'
  const firstArg = process.argv.find(
    (arg, index) => index >= 2 && !arg.startsWith("-"),
  );

  if (firstArg === "diff") {
    return parseDiffArgs();
  }

  if (firstArg === "info") {
    return parseInfoArgs();
  }

  // Check for --help or -h without other args
  if (
    process.argv.length === 3 &&
    (process.argv[2] === "--help" || process.argv[2] === "-h")
  ) {
    showHelp();
    process.exit(0);
  }

  // Check for --version or -V
  if (
    process.argv.length === 3 &&
    (process.argv[2] === "--version" || process.argv[2] === "-V")
  ) {
    console.log(packageJson.version);
    process.exit(0);
  }

  return parseExportArgs();
}
