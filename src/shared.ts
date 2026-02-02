import { readFileSync } from "node:fs";
import type {
  ExcalidrawElement,
  ExcalidrawFile,
  ExportOptions,
} from "./types.js";

// Type assertion for angle (can be number or undefined)
export type Angle = number;

// ---------------------------------------------------------------------------
// Dark mode color transformation
// ---------------------------------------------------------------------------
// Ported from excalidraw/packages/common/src/colors.ts
// Applies invert(93%) + hue-rotate(180°) to match Excalidraw's dark mode.

function parseHexColor(color: string): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  let hex = color.trim();
  if (hex.startsWith("#")) hex = hex.slice(1);

  // Handle shorthand #RGB
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;

  return { r, g, b, a };
}

function rgbToHex(r: number, g: number, b: number, a?: number): string {
  const hex6 = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  if (a !== undefined && a < 1) {
    const alphaHex = Math.round(a * 255)
      .toString(16)
      .padStart(2, "0");
    return `${hex6}${alphaHex}`;
  }
  return hex6;
}

function cssInvert(
  r: number,
  g: number,
  b: number,
  percent: number,
): { r: number; g: number; b: number } {
  const p = Math.max(0, Math.min(100, percent)) / 100;
  const inv = (c: number) =>
    Math.round(Math.max(0, Math.min(255, c * (1 - p) + (255 - c) * p)));
  return { r: inv(r), g: inv(g), b: inv(b) };
}

function cssHueRotate(
  r: number,
  g: number,
  b: number,
  degrees: number,
): { r: number; g: number; b: number } {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;

  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);

  const matrix = [
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072,
  ];

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  return {
    r: Math.round(
      clamp01(nr * matrix[0] + ng * matrix[1] + nb * matrix[2]) * 255,
    ),
    g: Math.round(
      clamp01(nr * matrix[3] + ng * matrix[4] + nb * matrix[5]) * 255,
    ),
    b: Math.round(
      clamp01(nr * matrix[6] + ng * matrix[7] + nb * matrix[8]) * 255,
    ),
  };
}

export function applyDarkModeFilter(color: string): string {
  if (!color || color === "transparent") return color;

  const { r, g, b, a } = parseHexColor(color);
  const inverted = cssInvert(r, g, b, 93);
  const rotated = cssHueRotate(inverted.r, inverted.g, inverted.b, 180);
  return rgbToHex(rotated.r, rotated.g, rotated.b, a);
}

// Identity function for non-dark-mode rendering
export const identityColor = (color: string): string => color;

/**
 * Apply dark-mode invert(93%) + hue-rotate(180°) to raw RGBA pixel data (in-place).
 * Matches the CSS filter applied to images in Excalidraw's dark mode.
 */
export function applyDarkModeToImageData(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // alpha (data[i+3]) unchanged

    const inv = cssInvert(r, g, b, 93);
    const rot = cssHueRotate(inv.r, inv.g, inv.b, 180);

    data[i] = rot.r;
    data[i + 1] = rot.g;
    data[i + 2] = rot.b;
  }
}

export type ColorTransform = (color: string) => string;

// Font family mapping — matches Excalidraw's FONT_FAMILY constants
export const FONT_FAMILY: Record<number, string> = {
  1: "Virgil", // deprecated, hand-drawn serif
  2: "Helvetica", // deprecated, system sans-serif
  3: "Cascadia", // deprecated, monospace
  5: "Excalifont", // default hand-drawn font
  6: "Nunito", // sans-serif
  7: "Lilita One", // display font
  8: "Comic Shanns", // comic-style monospace
  9: "Liberation Sans", // server-side export sans-serif
};

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function getElementBounds(element: ExcalidrawElement): Bounds {
  const x = element.x;
  const y = element.y;
  const width = element.width || 0;
  const height = element.height || 0;

  // Frame elements have a label above them that needs to be included in bounds
  const isFrame = element.type === "frame" || element.type === "magicframe";
  const labelHeight = isFrame
    ? FRAME_STYLE.nameFontSize * FRAME_STYLE.nameLineHeight +
      FRAME_STYLE.nameOffsetY
    : 0;

  // Handle rotation
  const angle = (element.angle as Angle) || 0;
  if (angle === 0) {
    return {
      minX: x,
      minY: y - labelHeight,
      maxX: x + width,
      maxY: y + height,
    };
  }

  // For rotated elements, calculate bounding box
  const cx = x + width / 2;
  const cy = y + height / 2;
  const corners: [number, number][] = [
    [x, y - labelHeight],
    [x + width, y - labelHeight],
    [x + width, y + height],
    [x, y + height],
  ];

  const rotatedCorners = corners.map(([px, py]): [number, number] => {
    const dx = px - cx;
    const dy = py - cy;
    return [
      cx + dx * Math.cos(angle) - dy * Math.sin(angle),
      cy + dx * Math.sin(angle) + dy * Math.cos(angle),
    ];
  });

  const xs = rotatedCorners.map((c) => c[0]);
  const ys = rotatedCorners.map((c) => c[1]);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** Bounds for frame-only export — excludes frame label, accounts for rotation */
function getFrameOnlyBounds(frame: ExcalidrawElement): Bounds {
  const x = frame.x;
  const y = frame.y;
  const width = frame.width || 0;
  const height = frame.height || 0;
  const angle = (frame.angle as Angle) || 0;

  if (angle === 0) {
    return { minX: x, minY: y, maxX: x + width, maxY: y + height };
  }

  const cx = x + width / 2;
  const cy = y + height / 2;
  const corners: [number, number][] = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];

  const rotated = corners.map(([px, py]): [number, number] => {
    const dx = px - cx;
    const dy = py - cy;
    return [
      cx + dx * Math.cos(angle) - dy * Math.sin(angle),
      cy + dx * Math.sin(angle) + dy * Math.cos(angle),
    ];
  });

  const xs = rotated.map((c) => c[0]);
  const ys = rotated.map((c) => c[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export function getCanvasBounds(
  elements: ExcalidrawElement[],
  padding: number,
): Bounds {
  if (elements.length === 0) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const element of elements) {
    if (element.isDeleted) continue;

    const bounds = getElementBounds(element);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

export function getDashArrayDashed(strokeWidth: number): number[] {
  return [8, 8 + strokeWidth];
}

export function getDashArrayDotted(strokeWidth: number): number[] {
  return [1.5, 6 + strokeWidth];
}

export function getRoughOptions(
  element: ExcalidrawElement,
  ct: ColorTransform,
) {
  const strokeStyle = element.strokeStyle || "solid";
  const strokeWidth = element.strokeWidth || 1;
  const isNonSolid = strokeStyle !== "solid";

  return {
    seed: element.seed,
    strokeWidth: isNonSolid ? strokeWidth + 0.5 : strokeWidth,
    roughness: element.roughness ?? 1,
    stroke: ct(element.strokeColor || "#000000"),
    fill:
      element.backgroundColor !== "transparent"
        ? ct(element.backgroundColor)
        : undefined,
    fillStyle: element.fillStyle || "hachure",
    fillWeight: strokeWidth / 2,
    hachureGap: strokeWidth * 4,
    strokeLineDash:
      strokeStyle === "dashed"
        ? getDashArrayDashed(strokeWidth)
        : strokeStyle === "dotted"
          ? getDashArrayDotted(strokeWidth)
          : undefined,
    disableMultiStroke: isNonSolid,
  };
}

// Roundness types matching Excalidraw's constants
export const ROUNDNESS = {
  LEGACY: 1,
  PROPORTIONAL_RADIUS: 2,
  ADAPTIVE_RADIUS: 3,
} as const;
export const DEFAULT_PROPORTIONAL_RADIUS = 0.25;
export const DEFAULT_ADAPTIVE_RADIUS = 32;

// Frame style constants — matches Excalidraw's FRAME_STYLE from constants.ts
export const FRAME_STYLE = {
  strokeColor: "#bbb",
  strokeWidth: 2,
  radius: 8,
  nameOffsetY: 3,
  nameColorLightTheme: "#999999",
  nameColorDarkTheme: "#7a7a7a",
  nameFontSize: 14,
  nameLineHeight: 1.25,
};

export function getCornerRadius(x: number, element: ExcalidrawElement): number {
  const roundness = element.roundness as {
    type: number;
    value?: number;
  } | null;
  if (!roundness) return 0;

  if (
    roundness.type === ROUNDNESS.PROPORTIONAL_RADIUS ||
    roundness.type === ROUNDNESS.LEGACY
  ) {
    return x * DEFAULT_PROPORTIONAL_RADIUS;
  }

  if (roundness.type === ROUNDNESS.ADAPTIVE_RADIUS) {
    const fixedRadiusSize = roundness.value ?? DEFAULT_ADAPTIVE_RADIUS;
    const cutoffSize = fixedRadiusSize / DEFAULT_PROPORTIONAL_RADIUS;
    if (x <= cutoffSize) {
      return x * DEFAULT_PROPORTIONAL_RADIUS;
    }
    return fixedRadiusSize;
  }

  return 0;
}

// Matches Excalidraw's LINE_CONFIRM_THRESHOLD (8px)
export const LINE_CONFIRM_THRESHOLD = 8;

export function isPathALoop(points: [number, number][]): boolean {
  if (points.length >= 3) {
    const [first, last] = [points[0], points[points.length - 1]];
    const distance = Math.hypot(first[0] - last[0], first[1] - last[1]);
    return distance <= LINE_CONFIRM_THRESHOLD;
  }
  return false;
}

/**
 * Parsed and prepared data for export, shared by PNG and SVG exporters.
 */
export interface PreparedExport {
  data: ExcalidrawFile;
  elements: ExcalidrawElement[];
  exportFrame: ExcalidrawElement | null;
  bounds: Bounds;
  width: number;
  height: number;
  ct: ColorTransform;
  backgroundColor: string;
  sortedElements: ExcalidrawElement[];
  elementsById: Map<string, ExcalidrawElement>;
}

export function prepareExport(
  inputPath: string,
  options: ExportOptions,
): PreparedExport {
  const content = readFileSync(inputPath, "utf-8");
  let data: ExcalidrawFile;

  try {
    data = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse ${inputPath}: ${error}`);
  }

  if (data.type !== "excalidraw") {
    throw new Error(
      `Invalid file format: expected type "excalidraw", got "${data.type}"`,
    );
  }

  const allElements = data.elements.filter((el) => !el.isDeleted);
  if (allElements.length === 0) {
    throw new Error("No elements to export");
  }

  // Frame-only export: find the target frame and filter elements
  let exportFrame: ExcalidrawElement | null = null;
  let elements: ExcalidrawElement[];

  if (options.frameId) {
    const frames = allElements.filter(
      (el) => el.type === "frame" || el.type === "magicframe",
    );

    exportFrame =
      frames.find((f) => (f.name as string) === options.frameId) ??
      frames.find((f) => f.id === options.frameId) ??
      null;

    if (!exportFrame) {
      const available = frames
        .map((f) => (f.name as string | null) ?? f.id)
        .join(", ");
      throw new Error(
        `Frame "${options.frameId}" not found. Available frames: ${available || "(none)"}`,
      );
    }

    elements = allElements.filter(
      (el) => (el.frameId as string | null) === exportFrame?.id,
    );

    if (elements.length === 0) {
      throw new Error(`Frame "${options.frameId}" has no child elements`);
    }
  } else {
    elements = allElements;
  }

  // Calculate canvas bounds
  const padding = exportFrame ? 0 : 20;
  const bounds = exportFrame
    ? getFrameOnlyBounds(exportFrame)
    : getCanvasBounds(elements, padding);
  const width = Math.ceil((bounds.maxX - bounds.minX) * options.scale);
  const height = Math.ceil((bounds.maxY - bounds.minY) * options.scale);

  // Determine color transform for dark mode
  const ct: ColorTransform = options.darkMode
    ? applyDarkModeFilter
    : identityColor;

  // Fill background
  const rawBackground =
    options.background || data.appState?.viewBackgroundColor || "#ffffff";
  const backgroundColor = ct(rawBackground);

  // Sort elements by their original order
  const sortedElements = [...elements].sort((a, b) => {
    const indexA = a.index ?? 0;
    const indexB = b.index ?? 0;
    if (typeof indexA === "string" && typeof indexB === "string") {
      return indexA.localeCompare(indexB);
    }
    return 0;
  });

  // Build element map
  const elementsById = new Map<string, ExcalidrawElement>();
  for (const element of sortedElements) {
    elementsById.set(element.id, element);
  }

  return {
    data,
    elements,
    exportFrame,
    bounds,
    width,
    height,
    ct,
    backgroundColor,
    sortedElements,
    elementsById,
  };
}

/** Escape XML special characters for SVG attribute values */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
