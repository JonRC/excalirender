/**
 * Diff export to Excalidraw format - no canvas dependencies.
 * This module is separate to allow testing without native canvas bindings.
 */

import { writeFileSync } from "node:fs";
import {
  applyUnchangedStyle,
  computeDiff,
  loadExcalidrawFile,
} from "./diff-core.js";
import type { ExcalidrawElement, ExcalidrawFile } from "./types.js";

/** Tag colors for diff status labels */
export const TAG_COLORS = {
  added: { bg: "#a7f3d0", text: "#065f46" },
  modified: { bg: "#d1d5db", text: "#374151" },
  removed: { bg: "#fecaca", text: "#991b1b" },
} as const;

export type DiffStatus = "added" | "modified" | "removed";

export interface DiffOptions {
  outputPath: string;
  scale: number;
  hideUnchanged: boolean;
  showTags: boolean;
}

/**
 * Calculate element bounding box, accounting for lines/arrows with points.
 */
export function getElementBounds(element: ExcalidrawElement): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const points = element.points as [number, number][] | undefined;

  if (points && points.length > 0) {
    // For lines/arrows, calculate bounds from points
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const [px, py] of points) {
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
    return {
      x: element.x + minX,
      y: element.y + minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  return {
    x: element.x,
    y: element.y,
    width: element.width || 0,
    height: element.height || 0,
  };
}

/**
 * Create a text element to serve as a status tag in Excalidraw output.
 */
export function createTagElement(
  element: ExcalidrawElement,
  status: DiffStatus,
): ExcalidrawElement {
  const bounds = getElementBounds(element);
  const colors = TAG_COLORS[status];

  return {
    id: `${element.id}-tag`,
    type: "text",
    x: bounds.x + bounds.width / 2 - 20,
    y: bounds.y + bounds.height + 4,
    width: 40,
    height: 14,
    strokeColor: colors.text,
    backgroundColor: colors.bg,
    fillStyle: "solid",
    strokeStyle: "solid",
    strokeWidth: 0,
    roughness: 0,
    opacity: 100,
    seed: Math.floor(Math.random() * 1000000),
    text: status,
    fontSize: 10,
    fontFamily: 1,
    textAlign: "center",
  };
}

/**
 * Export diff as an Excalidraw file with all elements and status tags.
 */
export async function exportDiffToExcalidraw(
  oldPath: string,
  newPath: string,
  options: DiffOptions,
): Promise<void> {
  const diff = computeDiff(oldPath, newPath);

  // Load both files for metadata and embedded files
  const oldData = loadExcalidrawFile(oldPath);
  const newData = loadExcalidrawFile(newPath);

  // Combine elements in rendering order
  const allElements: ExcalidrawElement[] = [];

  // Add unchanged elements (dimmed)
  if (!options.hideUnchanged) {
    for (const el of diff.unchanged) {
      allElements.push(applyUnchangedStyle(el));
    }
  }

  // Add removed elements with tag
  for (const el of diff.removed) {
    allElements.push(el);
    if (options.showTags) {
      allElements.push(createTagElement(el, "removed"));
    }
  }

  // Add modified elements (new version) with tag
  for (const { new: newEl } of diff.modified) {
    allElements.push(newEl);
    if (options.showTags) {
      allElements.push(createTagElement(newEl, "modified"));
    }
  }

  // Add added elements with tag
  for (const el of diff.added) {
    allElements.push(el);
    if (options.showTags) {
      allElements.push(createTagElement(el, "added"));
    }
  }

  // Merge files from both sources
  const mergedFiles = { ...oldData.files, ...newData.files };

  // Create output file
  const output: ExcalidrawFile = {
    type: "excalidraw",
    version: 2,
    source: "excalirender-diff",
    elements: allElements,
    appState: newData.appState,
    files: mergedFiles,
  };

  writeFileSync(options.outputPath, JSON.stringify(output, null, 2));

  console.log(`Exported diff to ${options.outputPath}`);
  console.log(
    `  Added: ${diff.added.length}, Removed: ${diff.removed.length}, Modified: ${diff.modified.length}, Unchanged: ${diff.unchanged.length}`,
  );
}
