/**
 * Info command — displays metadata about an .excalidraw file without rendering.
 */

import { readFileSync, statSync } from "node:fs";
import { FONT_FAMILY, getElementBounds } from "./shared.js";
import type { ExcalidrawFile } from "./types.js";

export interface FileInfo {
  file: string;
  size: number | null;
  version: number;
  source: string;
  elements: {
    total: number;
    byType: Record<string, number>;
  };
  canvas: {
    width: number;
    height: number;
  };
  background: string;
  fonts: string[];
  colors: {
    stroke: string[];
    fill: string[];
  };
  frames: string[];
  embeddedFiles: {
    total: number;
    byMimeType: Record<string, { count: number; size: number }>;
  };
}

function collectInfo(
  data: ExcalidrawFile,
  filePath: string,
  fileSize: number | null,
): FileInfo {
  const activeElements = data.elements.filter((el) => !el.isDeleted);

  // Element count by type
  const byType: Record<string, number> = {};
  for (const el of activeElements) {
    byType[el.type] = (byType[el.type] || 0) + 1;
  }

  // Canvas dimensions
  let canvasWidth = 0;
  let canvasHeight = 0;
  if (activeElements.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of activeElements) {
      const bounds = getElementBounds(el);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }
    canvasWidth = Math.round(maxX - minX);
    canvasHeight = Math.round(maxY - minY);
  }

  // Fonts used
  const fontIds = new Set<number>();
  for (const el of activeElements) {
    if (el.type === "text" && typeof el.fontFamily === "number") {
      fontIds.add(el.fontFamily);
    }
  }
  const fonts = [...fontIds]
    .map((id) => FONT_FAMILY[id] || `Unknown (${id})`)
    .sort();

  // Color palette
  const strokeColors = new Set<string>();
  const fillColors = new Set<string>();
  for (const el of activeElements) {
    if (el.strokeColor && el.strokeColor !== "transparent") {
      strokeColors.add(el.strokeColor);
    }
    if (el.backgroundColor && el.backgroundColor !== "transparent") {
      fillColors.add(el.backgroundColor);
    }
  }

  // Frames
  const frames: string[] = [];
  for (const el of activeElements) {
    if (el.type === "frame" || el.type === "magicframe") {
      frames.push((el.name as string) || el.id);
    }
  }

  // Embedded files
  const files = data.files || {};
  const fileEntries = Object.values(files);
  const byMimeType: Record<string, { count: number; size: number }> = {};
  for (const f of fileEntries) {
    const mime = f.mimeType || "unknown";
    if (!byMimeType[mime]) {
      byMimeType[mime] = { count: 0, size: 0 };
    }
    byMimeType[mime].count++;
    // Approximate decoded size from base64 dataURL
    const commaIdx = f.dataURL.indexOf(",");
    const b64 = commaIdx >= 0 ? f.dataURL.slice(commaIdx + 1) : f.dataURL;
    byMimeType[mime].size += Math.round(b64.length * 0.75);
  }

  return {
    file: filePath,
    size: fileSize,
    version: data.version,
    source: data.source,
    elements: {
      total: activeElements.length,
      byType,
    },
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
    },
    background: data.appState?.viewBackgroundColor || "#ffffff",
    fonts,
    colors: {
      stroke: [...strokeColors].sort(),
      fill: [...fillColors].sort(),
    },
    frames,
    embeddedFiles: {
      total: fileEntries.length,
      byMimeType,
    },
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatText(info: FileInfo): string {
  const lines: string[] = [];

  lines.push(`File: ${info.file}`);
  lines.push(`Size: ${info.size !== null ? formatSize(info.size) : "stdin"}`);
  lines.push(`Version: ${info.version}`);
  lines.push(`Source: ${info.source}`);

  lines.push("");
  lines.push(`Elements: ${info.elements.total}`);
  // Sort by count descending
  const sorted = Object.entries(info.elements.byType).sort(
    (a, b) => b[1] - a[1],
  );
  for (const [type, count] of sorted) {
    lines.push(`  ${type}: ${count}`);
  }

  lines.push("");
  lines.push(`Canvas: ${info.canvas.width} x ${info.canvas.height} px`);
  lines.push(`Background: ${info.background}`);

  if (info.fonts.length > 0) {
    lines.push("");
    lines.push("Fonts:");
    for (const font of info.fonts) {
      lines.push(`  ${font}`);
    }
  }

  if (info.colors.stroke.length > 0 || info.colors.fill.length > 0) {
    lines.push("");
    lines.push("Colors:");
    if (info.colors.stroke.length > 0) {
      lines.push(`  Stroke: ${info.colors.stroke.join(", ")}`);
    }
    if (info.colors.fill.length > 0) {
      lines.push(`  Fill: ${info.colors.fill.join(", ")}`);
    }
  }

  if (info.frames.length > 0) {
    lines.push("");
    lines.push("Frames:");
    lines.push(`  ${info.frames.join(", ")}`);
  }

  if (info.embeddedFiles.total > 0) {
    lines.push("");
    lines.push(`Embedded files: ${info.embeddedFiles.total}`);
    for (const [mime, data] of Object.entries(info.embeddedFiles.byMimeType)) {
      lines.push(`  ${mime}: ${data.count} (${formatSize(data.size)})`);
    }
  }

  return lines.join("\n");
}

export function runInfo(
  filePath: string,
  options: { json: boolean },
  content?: string,
): void {
  const isStdin = filePath === "-";
  const fileContent = content ?? readFileSync(filePath, "utf-8");
  const fileSize = isStdin ? null : statSync(filePath).size;

  let data: ExcalidrawFile;
  try {
    data = JSON.parse(fileContent);
  } catch {
    throw new Error(
      `Failed to parse ${isStdin ? "stdin" : filePath}: invalid JSON`,
    );
  }

  if (data.type !== "excalidraw") {
    throw new Error(
      `Invalid file format: expected type "excalidraw", got "${data.type}"`,
    );
  }

  const displayPath = isStdin ? "stdin" : filePath;
  const info = collectInfo(data, displayPath, fileSize);

  if (options.json) {
    console.log(JSON.stringify(info, null, 2));
  } else {
    console.log(formatText(info));
  }
}
