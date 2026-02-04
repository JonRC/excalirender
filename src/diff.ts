/**
 * Diff export functionality - renders visual diff to PNG/SVG/Excalidraw.
 */

import type { CanvasRenderingContext2D } from "canvas";
import { applyUnchangedStyle, computeDiff } from "./diff-core.js";
import {
  type DiffOptions,
  type DiffStatus,
  getElementBounds,
  TAG_COLORS,
} from "./diff-excalidraw.js";
import { exportToPngWithElements } from "./export.js";
import { exportToSvgWithElements } from "./export-svg.js";
import { getCanvasBounds, identityColor } from "./shared.js";
import type { ExcalidrawElement } from "./types.js";

// Re-export from diff-core for backwards compatibility
export { computeDiff, type DiffResult } from "./diff-core.js";

// Re-export from diff-excalidraw for backwards compatibility
export {
  type DiffOptions,
  exportDiffToExcalidraw,
} from "./diff-excalidraw.js";

/** Element with its diff status for tag rendering */
interface TaggedElement {
  element: ExcalidrawElement;
  status: DiffStatus;
}

/**
 * Render a diff tag on canvas (PNG).
 */
function renderDiffTag(
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  status: DiffStatus,
  offsetX: number,
  offsetY: number,
): void {
  const colors = TAG_COLORS[status];
  const bounds = getElementBounds(element);

  // Calculate tag position at bottom center of element
  const centerX = bounds.x + bounds.width / 2 + offsetX;
  const bottomY = bounds.y + bounds.height + offsetY + 4; // 4px gap

  // Measure text
  ctx.font = "10px Liberation Sans, sans-serif";
  const textWidth = ctx.measureText(status).width;
  const padding = { x: 4, y: 2 };
  const tagWidth = textWidth + padding.x * 2;
  const tagHeight = 10 + padding.y * 2;

  // Draw background
  ctx.fillStyle = colors.bg;
  ctx.beginPath();
  ctx.roundRect(centerX - tagWidth / 2, bottomY, tagWidth, tagHeight, 3);
  ctx.fill();

  // Draw text
  ctx.fillStyle = colors.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(status, centerX, bottomY + tagHeight / 2);
}

/**
 * Generate SVG markup for a diff tag.
 */
function createSvgTag(
  element: ExcalidrawElement,
  status: DiffStatus,
  offsetX: number,
  offsetY: number,
): string {
  const colors = TAG_COLORS[status];
  const bounds = getElementBounds(element);

  // Calculate tag position at bottom center of element
  const centerX = bounds.x + bounds.width / 2 + offsetX;
  const bottomY = bounds.y + bounds.height + offsetY + 4; // 4px gap

  // Approximate text width (10px font, ~6px per character)
  const textWidth = status.length * 6;
  const padding = { x: 4, y: 2 };
  const tagWidth = textWidth + padding.x * 2;
  const tagHeight = 10 + padding.y * 2;

  const rectX = centerX - tagWidth / 2;
  const textY = bottomY + tagHeight / 2;

  return `<g>
  <rect x="${rectX}" y="${bottomY}" width="${tagWidth}" height="${tagHeight}" rx="3" ry="3" fill="${colors.bg}"/>
  <text x="${centerX}" y="${textY}" fill="${colors.text}" font-family="Liberation Sans, sans-serif" font-size="10" text-anchor="middle" dominant-baseline="central">${status}</text>
</g>
`;
}

/**
 * Export a visual diff between two Excalidraw files to PNG.
 */
export async function exportDiffToPng(
  oldPath: string,
  newPath: string,
  options: DiffOptions,
): Promise<void> {
  const diff = computeDiff(oldPath, newPath);

  // Unchanged elements are dimmed for context; diff elements keep original colors
  const styledUnchanged = options.hideUnchanged
    ? []
    : diff.unchanged.map((el) => applyUnchangedStyle(el));

  // Use original elements - tags indicate diff status
  const removedElements = diff.removed;
  const addedElements = diff.added;
  const modifiedElements = diff.modified.map(({ new: newEl }) => newEl);

  // Combine elements in rendering order: unchanged, removed, modified, added
  const allElements = [
    ...styledUnchanged,
    ...removedElements,
    ...modifiedElements,
    ...addedElements,
  ];

  if (allElements.length === 0) {
    console.log("No differences found between files");
    return;
  }

  // Build list of elements that need tags (original elements, not styled)
  const taggedElements: TaggedElement[] = [];
  if (options.showTags) {
    for (const el of diff.removed) {
      taggedElements.push({ element: el, status: "removed" });
    }
    for (const { new: newEl } of diff.modified) {
      taggedElements.push({ element: newEl, status: "modified" });
    }
    for (const el of diff.added) {
      taggedElements.push({ element: el, status: "added" });
    }
  }

  // Calculate bounds from all original elements (before styling)
  // Include extra space for tags if enabled
  const allOriginalElements = [
    ...diff.unchanged,
    ...diff.removed,
    ...diff.modified.map(({ new: newEl }) => newEl),
    ...diff.added,
  ];
  const tagPadding = options.showTags ? 24 : 20; // Extra padding for tags
  const bounds = getCanvasBounds(allOriginalElements, tagPadding);
  const width = Math.ceil((bounds.maxX - bounds.minX) * options.scale);
  const height = Math.ceil((bounds.maxY - bounds.minY) * options.scale);

  await exportToPngWithElements(allElements, {
    outputPath: options.outputPath,
    scale: options.scale,
    bounds,
    width,
    height,
    backgroundColor: "#ffffff",
    ct: identityColor,
    darkMode: false,
    files: {},
    afterRender: options.showTags
      ? (ctx, offsetX, offsetY) => {
          for (const { element, status } of taggedElements) {
            renderDiffTag(ctx, element, status, offsetX, offsetY);
          }
        }
      : undefined,
  });

  console.log(`Exported diff to ${options.outputPath}`);
  console.log(
    `  Added: ${diff.added.length}, Removed: ${diff.removed.length}, Modified: ${diff.modified.length}, Unchanged: ${diff.unchanged.length}`,
  );
}

/**
 * Export a visual diff between two Excalidraw files to SVG.
 */
export async function exportDiffToSvg(
  oldPath: string,
  newPath: string,
  options: DiffOptions,
): Promise<void> {
  const diff = computeDiff(oldPath, newPath);

  // Unchanged elements are dimmed for context; diff elements keep original colors
  const styledUnchanged = options.hideUnchanged
    ? []
    : diff.unchanged.map((el) => applyUnchangedStyle(el));

  // Use original elements - tags indicate diff status
  const removedElements = diff.removed;
  const addedElements = diff.added;
  const modifiedElements = diff.modified.map(({ new: newEl }) => newEl);

  // Combine elements in rendering order: unchanged, removed, modified, added
  const allElements = [
    ...styledUnchanged,
    ...removedElements,
    ...modifiedElements,
    ...addedElements,
  ];

  if (allElements.length === 0) {
    console.log("No differences found between files");
    return;
  }

  // Build list of elements that need tags (original elements, not styled)
  const taggedElements: TaggedElement[] = [];
  if (options.showTags) {
    for (const el of diff.removed) {
      taggedElements.push({ element: el, status: "removed" });
    }
    for (const { new: newEl } of diff.modified) {
      taggedElements.push({ element: newEl, status: "modified" });
    }
    for (const el of diff.added) {
      taggedElements.push({ element: el, status: "added" });
    }
  }

  // Calculate bounds from all original elements (before styling)
  // Include extra space for tags if enabled
  const allOriginalElements = [
    ...diff.unchanged,
    ...diff.removed,
    ...diff.modified.map(({ new: newEl }) => newEl),
    ...diff.added,
  ];
  const tagPadding = options.showTags ? 24 : 20; // Extra padding for tags
  const bounds = getCanvasBounds(allOriginalElements, tagPadding);
  const width = Math.ceil((bounds.maxX - bounds.minX) * options.scale);
  const height = Math.ceil((bounds.maxY - bounds.minY) * options.scale);

  await exportToSvgWithElements(allElements, {
    outputPath: options.outputPath,
    scale: options.scale,
    bounds,
    width,
    height,
    backgroundColor: "#ffffff",
    ct: identityColor,
    darkMode: false,
    files: {},
    afterRenderSvg: options.showTags
      ? (offsetX, offsetY) => {
          let svg = "";
          for (const { element, status } of taggedElements) {
            svg += createSvgTag(element, status, offsetX, offsetY);
          }
          return svg;
        }
      : undefined,
  });

  console.log(`Exported diff to ${options.outputPath}`);
  console.log(
    `  Added: ${diff.added.length}, Removed: ${diff.removed.length}, Modified: ${diff.modified.length}, Unchanged: ${diff.unchanged.length}`,
  );
}
