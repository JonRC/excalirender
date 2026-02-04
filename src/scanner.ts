import { stat } from "node:fs/promises";
import { Glob } from "bun";

/**
 * Find all .excalidraw files in a directory recursively.
 *
 * @param directory - The directory path to scan
 * @returns Array of absolute file paths, sorted alphabetically
 */
export async function findExcalidrawFiles(
  directory: string,
): Promise<string[]> {
  // Verify directory exists and is a directory
  const stats = await stat(directory).catch(() => null);
  if (!stats) {
    throw new Error(`Directory not found: ${directory}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`Not a directory: ${directory}`);
  }

  const glob = new Glob("**/*.excalidraw");
  const files: string[] = [];

  for await (const file of glob.scan({ cwd: directory, absolute: true })) {
    files.push(file);
  }

  return files.sort();
}
