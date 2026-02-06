import { basename } from "node:path";
import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import type { CombineOptions } from "./combine.js";
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

export interface CombineCLIArgs {
  command: "combine";
  inputPaths: string[];
  format: string | undefined;
  options: CombineOptions;
}

export interface WatchCLIArgs {
  command: "watch";
  inputPaths: string[];
  mode: "export" | "diff";
  port: number;
  open: boolean;
  exportOptions: ExportOptions;
  diffOptions: DiffOptions;
}

export type CLIArgs =
  | ExportCLIArgs
  | DiffCLIArgs
  | InfoCLIArgs
  | CombineCLIArgs
  | WatchCLIArgs;

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

function buildExportArgs(
  input: string,
  opts: Record<string, unknown>,
): ExportCLIArgs {
  const inputPath = input;
  const recursive = (opts.recursive as boolean) || false;

  let outputPath: string;
  let outputDir: string | null = null;

  if (recursive) {
    outputDir = (opts.output as string) || null;
    outputPath = "";
  } else {
    outputPath =
      (opts.output as string) ||
      inputPath.replace(/\.excalidraw$/, ".png") ||
      `${basename(inputPath, ".excalidraw")}.png`;
  }

  return {
    command: "export",
    inputPath,
    recursive,
    outputDir,
    format: (opts.format as string) || undefined,
    options: {
      outputPath,
      scale: Number.parseFloat(opts.scale as string) || 1,
      background: opts.transparent
        ? "transparent"
        : (opts.background as string) || null,
      darkMode: (opts.dark as boolean) || false,
      frameId: (opts.frame as string) || undefined,
    },
  };
}

function buildDiffArgs(
  oldPath: string,
  newPath: string,
  opts: Record<string, unknown>,
): DiffCLIArgs {
  const outputPath =
    (opts.output as string) || generateDefaultDiffOutput(oldPath, newPath);

  return {
    command: "diff",
    oldPath,
    newPath,
    format: (opts.format as string) || undefined,
    options: {
      outputPath,
      scale: Number.parseFloat(opts.scale as string) || 1,
      hideUnchanged: (opts.hideUnchanged as boolean) || false,
      showTags: opts.tags !== false,
      darkMode: (opts.dark as boolean) || false,
      transparent: (opts.transparent as boolean) || false,
      gifDelay: Number.parseInt(opts.delay as string, 10) || 1000,
    },
  };
}

function buildInfoArgs(
  input: string,
  opts: Record<string, unknown>,
): InfoCLIArgs {
  return {
    command: "info",
    inputPath: input,
    json: (opts.json as boolean) || false,
  };
}

function buildCombineArgs(
  files: string[],
  opts: Record<string, unknown>,
): CombineCLIArgs {
  const outputPath = (opts.output as string) || "combined.png";

  return {
    command: "combine",
    inputPaths: files,
    format: (opts.format as string) || undefined,
    options: {
      outputPath,
      layout: ((opts.layout as string) || "horizontal") as
        | "horizontal"
        | "vertical",
      gap: Number.isNaN(Number.parseInt(opts.gap as string, 10))
        ? 40
        : Number.parseInt(opts.gap as string, 10),
      labels: (opts.labels as boolean) || false,
      scale: Number.parseFloat(opts.scale as string) || 1,
      darkMode: (opts.dark as boolean) || false,
      transparent: (opts.transparent as boolean) || false,
    },
  };
}

function buildWatchArgs(
  files: string[],
  opts: Record<string, unknown>,
): WatchCLIArgs {
  const mode = files.length === 2 ? "diff" : "export";
  const scale = Number.parseFloat(opts.scale as string) || 1;
  const darkMode = (opts.dark as boolean) || false;
  const transparent = (opts.transparent as boolean) || false;

  return {
    command: "watch",
    inputPaths: files,
    mode,
    port: Number.parseInt(opts.port as string, 10),
    open: opts.open !== false,
    exportOptions: {
      outputPath: "",
      scale,
      background: transparent
        ? "transparent"
        : (opts.background as string) || null,
      darkMode,
      frameId: (opts.frame as string) || undefined,
    },
    diffOptions: {
      outputPath: "",
      scale,
      hideUnchanged: (opts.hideUnchanged as boolean) || false,
      showTags: opts.tags !== false,
      darkMode,
      transparent,
    },
  };
}

export function parseArgs(): CLIArgs {
  let result: CLIArgs | null = null;

  const program = new Command();

  program
    .name("excalirender")
    .version(packageJson.version)
    .description("Convert .excalidraw files to PNG, SVG, or PDF")
    .enablePositionalOptions()
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
    .action((input: string, opts: Record<string, unknown>) => {
      result = buildExportArgs(input, opts);
    });

  program
    .command("diff")
    .description("Create a visual diff between two .excalidraw files")
    .argument("<old>", "Path to the old/original .excalidraw file")
    .argument("<new>", "Path to the new/modified .excalidraw file")
    .option(
      "-o, --output <path>",
      "Output file path (.png, .svg, .pdf, .gif, or .excalidraw)",
    )
    .option("-s, --scale <number>", "Export scale factor", "1")
    .option("-d, --dark", "Enable dark mode export", false)
    .option("--transparent", "Transparent background (no fill)", false)
    .option("--hide-unchanged", "Don't render unchanged elements", false)
    .option("--no-tags", "Don't render status tags below elements")
    .option("--delay <ms>", "GIF frame delay in milliseconds", "1000")
    .option(
      "--format <type>",
      "Output format when using stdout (-o -): png, svg",
    )
    .action(
      (oldPath: string, newPath: string, opts: Record<string, unknown>) => {
        result = buildDiffArgs(oldPath, newPath, opts);
      },
    );

  program
    .command("info")
    .description("Show metadata about an .excalidraw file")
    .argument("<input>", "Input .excalidraw file (or - for stdin)")
    .option("--json", "Output metadata as JSON", false)
    .action((input: string, opts: Record<string, unknown>) => {
      result = buildInfoArgs(input, opts);
    });

  program
    .command("combine")
    .description(
      "Combine multiple .excalidraw files into a single image (side by side or stacked)",
    )
    .argument("<files...>", "Input .excalidraw files (at least 2)")
    .option(
      "-o, --output <path>",
      "Output file path (.png or .pdf)",
      "combined.png",
    )
    .option(
      "-l, --layout <type>",
      "Layout: horizontal or vertical",
      "horizontal",
    )
    .option("--gap <pixels>", "Gap between panels in pixels", "40")
    .option("--labels", "Show filename labels below each panel", false)
    .option("-s, --scale <number>", "Export scale factor", "1")
    .option("-d, --dark", "Enable dark mode export", false)
    .option("--transparent", "Transparent background (no fill)", false)
    .option("--format <type>", "Output format when using stdout (-o -): png")
    .action((files: string[], opts: Record<string, unknown>) => {
      result = buildCombineArgs(files, opts);
    });

  program
    .command("watch")
    .description(
      "Watch .excalidraw file(s) and preview in browser with live reload",
    )
    .argument("<files...>", "Input file(s): 1 file = export, 2 files = diff")
    .option("-p, --port <number>", "HTTP server port", "3333")
    .option("-s, --scale <number>", "Export scale factor", "1")
    .option("-d, --dark", "Enable dark mode", false)
    .option("--transparent", "Transparent background", false)
    .option("-b, --background <color>", "Background color")
    .option("-f, --frame <name>", "Export specific frame (export mode)")
    .option("--no-open", "Don't auto-open browser")
    .option(
      "--hide-unchanged",
      "Don't render unchanged elements (diff mode)",
      false,
    )
    .option("--no-tags", "Don't render status tags (diff mode)")
    .action((files: string[], opts: Record<string, unknown>) => {
      result = buildWatchArgs(files, opts);
    });

  program.parse();

  if (!result) {
    process.exit(1);
  }

  return result;
}
