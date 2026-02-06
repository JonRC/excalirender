/**
 * Core diff computation logic - pure functions without rendering dependencies.
 */

import { readFileSync } from "node:fs";
import type { ExcalidrawElement, ExcalidrawFile } from "./types.js";

export interface DiffResult {
  added: ExcalidrawElement[];
  removed: ExcalidrawElement[];
  modified: Array<{ old: ExcalidrawElement; new: ExcalidrawElement }>;
  unchanged: ExcalidrawElement[];
}

/**
 * Compare two points arrays for equality.
 */
function pointsAreEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  const aPoints = a as [number, number][];
  const bPoints = b as [number, number][];

  if (!Array.isArray(aPoints) || !Array.isArray(bPoints)) return false;
  if (aPoints.length !== bPoints.length) return false;

  for (let i = 0; i < aPoints.length; i++) {
    if (aPoints[i][0] !== bPoints[i][0] || aPoints[i][1] !== bPoints[i][1]) {
      return false;
    }
  }
  return true;
}

/**
 * Check if two elements have the same visual properties.
 * Ignores transient fields like seed, version, updated.
 */
function elementsAreEqual(a: ExcalidrawElement, b: ExcalidrawElement): boolean {
  // Position and dimensions
  if (a.x !== b.x || a.y !== b.y) return false;
  if (a.width !== b.width || a.height !== b.height) return false;

  // Visual styles
  if (a.strokeColor !== b.strokeColor) return false;
  if (a.backgroundColor !== b.backgroundColor) return false;
  if (a.strokeWidth !== b.strokeWidth) return false;
  if (a.opacity !== b.opacity) return false;

  // Rotation
  if ((a.angle ?? 0) !== (b.angle ?? 0)) return false;

  // Text content (for text elements)
  if (a.text !== b.text) return false;

  // Points (for lines, arrows, freedraw)
  if (!pointsAreEqual(a.points, b.points)) return false;

  return true;
}

/**
 * Load and parse an Excalidraw file.
 */
export function loadExcalidrawFile(
  path: string,
  content?: string,
): ExcalidrawFile {
  const fileContent = content ?? readFileSync(path, "utf-8");
  let data: ExcalidrawFile;

  try {
    data = JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Failed to parse ${path}: ${error}`);
  }

  if (data.type !== "excalidraw") {
    throw new Error(
      `Invalid file format: expected type "excalidraw", got "${data.type}"`,
    );
  }

  return data;
}

/**
 * Compute the diff between two Excalidraw files.
 * Elements are matched by their `id` field.
 * Modified elements are those with same ID but different visual properties.
 */
export function computeDiff(
  oldPath: string,
  newPath: string,
  oldContent?: string,
  newContent?: string,
): DiffResult {
  const oldData = loadExcalidrawFile(oldPath, oldContent);
  const newData = loadExcalidrawFile(newPath, newContent);

  const oldElements = oldData.elements.filter((el) => !el.isDeleted);
  const newElements = newData.elements.filter((el) => !el.isDeleted);

  // Build map of old elements by ID for efficient lookup
  const oldById = new Map<string, ExcalidrawElement>();
  for (const el of oldElements) {
    oldById.set(el.id, el);
  }

  const newIds = new Set(newElements.map((el) => el.id));

  const added: ExcalidrawElement[] = [];
  const removed: ExcalidrawElement[] = [];
  const modified: Array<{ old: ExcalidrawElement; new: ExcalidrawElement }> =
    [];
  const unchanged: ExcalidrawElement[] = [];

  // Categorize new elements
  for (const newEl of newElements) {
    const oldEl = oldById.get(newEl.id);
    if (!oldEl) {
      // Element only in new file
      added.push(newEl);
    } else if (elementsAreEqual(oldEl, newEl)) {
      // Element unchanged
      unchanged.push(newEl);
    } else {
      // Element modified
      modified.push({ old: oldEl, new: newEl });
    }
  }

  // Find removed elements (in old, not in new)
  for (const el of oldElements) {
    if (!newIds.has(el.id)) {
      removed.push(el);
    }
  }

  return { added, removed, modified, unchanged };
}

/**
 * Apply unchanged styling - dimmed appearance.
 */
export function applyUnchangedStyle(
  element: ExcalidrawElement,
): ExcalidrawElement {
  return {
    ...element,
    opacity: 30, // 0.3 opacity
  };
}
