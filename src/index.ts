#!/usr/bin/env node

import { parseArgs } from "./cli.js";
import { exportToPng } from "./export.js";
import { exportToSvg } from "./export-svg.js";

async function main() {
  try {
    const { inputFile, options } = parseArgs();

    if (options.outputPath.endsWith(".svg")) {
      await exportToSvg(inputFile, options);
    } else {
      await exportToPng(inputFile, options);
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
