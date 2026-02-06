/**
 * Diff export to animated GIF - alternates between old and new states.
 */

import { writeFileSync } from "node:fs";
// @ts-expect-error -- gifenc has no type definitions
import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { computeDiff } from "./diff-core.js";
import type { DiffOptions } from "./diff-excalidraw.js";
import {
  type RenderToCanvasOptions,
  renderElementsToCanvas,
} from "./export.js";
import {
  applyDarkModeFilter,
  getCanvasBounds,
  identityColor,
} from "./shared.js";

/**
 * Export a visual diff between two Excalidraw files as an animated GIF.
 * Frame 1 shows the old state, Frame 2 shows the new state.
 */
export async function exportDiffToGif(
  oldPath: string,
  newPath: string,
  options: DiffOptions,
  oldContent?: string,
  newContent?: string,
): Promise<void> {
  const diff = computeDiff(oldPath, newPath, oldContent, newContent);

  const unchangedElements = options.hideUnchanged ? [] : diff.unchanged;

  // Frame 1 (old state): unchanged + removed + modified.old
  const oldFrameElements = [
    ...unchangedElements,
    ...diff.removed,
    ...diff.modified.map(({ old: oldEl }) => oldEl),
  ];

  // Frame 2 (new state): unchanged + added + modified.new
  const newFrameElements = [
    ...unchangedElements,
    ...diff.added,
    ...diff.modified.map(({ new: newEl }) => newEl),
  ];

  if (oldFrameElements.length === 0 && newFrameElements.length === 0) {
    console.log("No elements found in either file");
    return;
  }

  // Compute bounds from union of ALL elements so both frames have same dimensions
  const allElements = [
    ...diff.unchanged,
    ...diff.removed,
    ...diff.added,
    ...diff.modified.map(({ old: oldEl }) => oldEl),
    ...diff.modified.map(({ new: newEl }) => newEl),
  ];
  const bounds = getCanvasBounds(allElements, 20);
  const width = Math.ceil((bounds.maxX - bounds.minX) * options.scale);
  const height = Math.ceil((bounds.maxY - bounds.minY) * options.scale);

  const ct = options.darkMode ? applyDarkModeFilter : identityColor;
  const backgroundColor = options.transparent ? "transparent" : ct("#ffffff");

  const renderOptions: RenderToCanvasOptions = {
    scale: options.scale,
    bounds,
    width,
    height,
    backgroundColor,
    ct,
    darkMode: options.darkMode,
    files: {},
  };

  // Render both frames to canvas
  const oldCanvas = await renderElementsToCanvas(
    oldFrameElements,
    renderOptions,
  );
  const newCanvas = await renderElementsToCanvas(
    newFrameElements,
    renderOptions,
  );

  // Extract raw RGBA pixel data
  const oldRgba = oldCanvas
    .getContext("2d")
    .getImageData(0, 0, width, height).data;
  const newRgba = newCanvas
    .getContext("2d")
    .getImageData(0, 0, width, height).data;

  // GIF encoding
  const transparent = options.transparent;
  const format = transparent ? "rgba4444" : "rgb444";
  const delay = options.gifDelay ?? 1000;

  const gif = GIFEncoder();

  // Frame 1: old state
  const oldPalette = quantize(oldRgba, 256, {
    format,
    oneBitAlpha: transparent,
  });
  const oldIndex = applyPalette(oldRgba, oldPalette, format);
  gif.writeFrame(oldIndex, width, height, {
    palette: oldPalette,
    delay,
    repeat: 0,
    transparent,
  });

  // Frame 2: new state
  const newPalette = quantize(newRgba, 256, {
    format,
    oneBitAlpha: transparent,
  });
  const newIndex = applyPalette(newRgba, newPalette, format);
  gif.writeFrame(newIndex, width, height, {
    palette: newPalette,
    delay,
    transparent,
  });

  gif.finish();
  writeFileSync(options.outputPath, Buffer.from(gif.bytes()));

  const hasDiff =
    diff.added.length > 0 ||
    diff.removed.length > 0 ||
    diff.modified.length > 0;
  if (!hasDiff) {
    console.log("No differences found, GIF will show identical frames");
  }
  console.log(`Exported diff to ${options.outputPath}`);
  console.log(
    `  Added: ${diff.added.length}, Removed: ${diff.removed.length}, Modified: ${diff.modified.length}, Unchanged: ${diff.unchanged.length}`,
  );
}
