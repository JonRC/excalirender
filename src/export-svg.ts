import { writeFileSync } from "node:fs";
import { getStroke } from "perfect-freehand";
import { simplify } from "points-on-curve";
import rough from "roughjs";
import type { PathInfo } from "roughjs/bin/core.js";
import type { RoughGenerator } from "roughjs/bin/generator.js";
import { generateFontFaceCSS } from "./fonts.js";
import {
  type Angle,
  applyDarkModeFilter,
  type Bounds,
  type ColorTransform,
  escapeXml,
  FONT_FAMILY,
  FRAME_STYLE,
  getCornerRadius,
  getRoughOptions,
  isPathALoop,
  prepareExport,
} from "./shared.js";
import type { ExcalidrawElement, ExportOptions } from "./types.js";

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

function svgPathsToMarkup(paths: PathInfo[], dashArray?: number[]): string {
  let out = "";
  for (const p of paths) {
    const dashAttr = dashArray
      ? ` stroke-dasharray="${dashArray.join(" ")}"`
      : "";
    const fillAttr = p.fill ? ` fill="${p.fill}"` : ' fill="none"';
    out += `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}"${fillAttr}${dashAttr} stroke-linecap="round" stroke-linejoin="round"/>\n`;
  }
  return out;
}

function buildRoundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  return `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y}, ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h}, ${x + w - r} ${y + h} L ${x + r} ${y + h} Q ${x} ${y + h}, ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y}, ${x + r} ${y}`;
}

// ---------------------------------------------------------------------------
// SVG element renderers
// ---------------------------------------------------------------------------

function svgRectangle(
  gen: RoughGenerator,
  element: ExcalidrawElement,
  ox: number,
  oy: number,
  ct: ColorTransform,
): string {
  const x = element.x + ox;
  const y = element.y + oy;
  const w = element.width || 0;
  const h = element.height || 0;
  const options = getRoughOptions(element, ct);
  const r = getCornerRadius(Math.min(w, h), element);

  const drawable =
    r > 0
      ? gen.path(buildRoundedRectPath(x, y, w, h, r), options)
      : gen.rectangle(x, y, w, h, options);

  return svgPathsToMarkup(gen.toPaths(drawable), options.strokeLineDash);
}

function svgDiamond(
  gen: RoughGenerator,
  element: ExcalidrawElement,
  ox: number,
  oy: number,
  ct: ColorTransform,
): string {
  const x = element.x + ox;
  const y = element.y + oy;
  const w = element.width || 0;
  const h = element.height || 0;
  const options = getRoughOptions(element, ct);

  const topX = x + w / 2,
    topY = y;
  const rightX = x + w,
    rightY = y + h / 2;
  const bottomX = x + w / 2,
    bottomY = y + h;
  const leftX = x,
    leftY = y + h / 2;

  const vr = getCornerRadius(Math.abs(topX - leftX), element);
  const hr = getCornerRadius(Math.abs(rightY - topY), element);

  let drawable: ReturnType<RoughGenerator["path"]>;
  if (vr > 0 || hr > 0) {
    const path = `M ${topX + vr} ${topY + hr} L ${rightX - vr} ${rightY - hr} C ${rightX} ${rightY}, ${rightX} ${rightY}, ${rightX - vr} ${rightY + hr} L ${bottomX + vr} ${bottomY - hr} C ${bottomX} ${bottomY}, ${bottomX} ${bottomY}, ${bottomX - vr} ${bottomY - hr} L ${leftX + vr} ${leftY + hr} C ${leftX} ${leftY}, ${leftX} ${leftY}, ${leftX + vr} ${leftY - hr} L ${topX - vr} ${topY + hr} C ${topX} ${topY}, ${topX} ${topY}, ${topX + vr} ${topY + hr}`;
    drawable = gen.path(path, options);
  } else {
    drawable = gen.polygon(
      [
        [topX, topY],
        [rightX, rightY],
        [bottomX, bottomY],
        [leftX, leftY],
      ],
      options,
    );
  }

  return svgPathsToMarkup(gen.toPaths(drawable), options.strokeLineDash);
}

function svgEllipse(
  gen: RoughGenerator,
  element: ExcalidrawElement,
  ox: number,
  oy: number,
  ct: ColorTransform,
): string {
  const x = element.x + ox;
  const y = element.y + oy;
  const w = element.width || 0;
  const h = element.height || 0;
  const options = getRoughOptions(element, ct);

  const drawable = gen.ellipse(x + w / 2, y + h / 2, w, h, options);
  return svgPathsToMarkup(gen.toPaths(drawable), options.strokeLineDash);
}

function svgLine(
  gen: RoughGenerator,
  element: ExcalidrawElement,
  ox: number,
  oy: number,
  ct: ColorTransform,
): string {
  const points = element.points as [number, number][];
  if (!points || points.length < 2) return "";

  const x = element.x + ox;
  const y = element.y + oy;
  const options = getRoughOptions(element, ct);
  const transformed = points.map(
    ([px, py]) => [x + px, y + py] as [number, number],
  );

  const drawable =
    transformed.length === 2
      ? gen.line(
          transformed[0][0],
          transformed[0][1],
          transformed[1][0],
          transformed[1][1],
          options,
        )
      : gen.curve(transformed, options);

  return svgPathsToMarkup(gen.toPaths(drawable), options.strokeLineDash);
}

function svgArrowhead(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  strokeWidth: number,
): string {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const headLength = 15 + strokeWidth * 2;
  const headAngle = Math.PI / 6;

  const x1 = toX - headLength * Math.cos(angle - headAngle);
  const y1 = toY - headLength * Math.sin(angle - headAngle);
  const x2 = toX - headLength * Math.cos(angle + headAngle);
  const y2 = toY - headLength * Math.sin(angle + headAngle);

  return `<path d="M ${toX} ${toY} L ${x1} ${y1} M ${toX} ${toY} L ${x2} ${y2}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>\n`;
}

function svgArrow(
  gen: RoughGenerator,
  element: ExcalidrawElement,
  ox: number,
  oy: number,
  ct: ColorTransform,
): string {
  let out = svgLine(gen, element, ox, oy, ct);

  const points = element.points as [number, number][];
  if (!points || points.length < 2) return out;

  const x = element.x + ox;
  const y = element.y + oy;
  const strokeColor = ct(element.strokeColor || "#000000");
  const strokeWidth = element.strokeWidth || 1;

  if (element.endArrowhead === "arrow" || element.endArrowhead === "triangle") {
    const lastIdx = points.length - 1;
    const secondLastIdx = Math.max(0, lastIdx - 1);
    out += svgArrowhead(
      x + points[secondLastIdx][0],
      y + points[secondLastIdx][1],
      x + points[lastIdx][0],
      y + points[lastIdx][1],
      strokeColor,
      strokeWidth,
    );
  }

  if (
    element.startArrowhead === "arrow" ||
    element.startArrowhead === "triangle"
  ) {
    out += svgArrowhead(
      x + points[1][0],
      y + points[1][1],
      x + points[0][0],
      y + points[0][1],
      strokeColor,
      strokeWidth,
    );
  }

  return out;
}

function svgFreedraw(
  gen: RoughGenerator,
  element: ExcalidrawElement,
  ox: number,
  oy: number,
  ct: ColorTransform,
): string {
  const points = element.points as [number, number][];
  if (!points || points.length < 2) return "";

  const x = element.x + ox;
  const y = element.y + oy;
  const strokeColor = ct(element.strokeColor || "#000000");
  const strokeWidth = element.strokeWidth || 1;
  const pressures = element.pressures as number[] | undefined;

  let out = "";

  // (1) Background fill for closed paths
  if (isPathALoop(points) && element.backgroundColor !== "transparent") {
    const simplifiedPoints = simplify(points, 0.75);
    const transformedPoints = simplifiedPoints.map(
      ([px, py]) => [x + px, y + py] as [number, number],
    );
    const options = getRoughOptions(element, ct);
    const drawable = gen.curve(transformedPoints, {
      ...options,
      stroke: "none",
    });
    out += svgPathsToMarkup(gen.toPaths(drawable));
  }

  // (2) Stroke rendering via perfect-freehand
  const inputPoints = points.map((p, i) => ({
    x: p[0],
    y: p[1],
    pressure: pressures?.[i] ?? 0.5,
  }));

  const strokePoints = getStroke(inputPoints, {
    size: strokeWidth * 4.25,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    easing: (t: number) => Math.sin((t * Math.PI) / 2),
    last: true,
    simulatePressure: !pressures || Boolean(element.simulatePressure),
  });

  if (strokePoints.length < 2) return out;

  // Build SVG path from stroke points — translated by element position
  let d = `M ${strokePoints[0][0] + x} ${strokePoints[0][1] + y}`;
  for (let i = 1; i < strokePoints.length - 1; i++) {
    const xc = (strokePoints[i][0] + strokePoints[i + 1][0]) / 2 + x;
    const yc = (strokePoints[i][1] + strokePoints[i + 1][1]) / 2 + y;
    d += ` Q ${strokePoints[i][0] + x} ${strokePoints[i][1] + y}, ${xc} ${yc}`;
  }
  const lastPoint = strokePoints[strokePoints.length - 1];
  d += ` L ${lastPoint[0] + x} ${lastPoint[1] + y} Z`;

  out += `<path d="${d}" fill="${strokeColor}" stroke="none"/>\n`;
  return out;
}

function svgText(
  element: ExcalidrawElement,
  ox: number,
  oy: number,
  ct: ColorTransform,
): string {
  const x = element.x + ox;
  const y = element.y + oy;
  const text = element.text as string;
  const fontSize = (element.fontSize as number) || 20;
  const fontFamily = FONT_FAMILY[element.fontFamily as number] || "Virgil";
  const strokeColor = ct(element.strokeColor || "#000000");
  const textAlign = (element.textAlign as string) || "left";

  if (!text) return "";

  const lines = text.split("\n");
  const lineHeight = (element.lineHeight as number) || 1.25;
  const actualLineHeight = fontSize * lineHeight;

  let textX = x;
  let anchor = "start";
  if (textAlign === "center") {
    textX = x + (element.width || 0) / 2;
    anchor = "middle";
  } else if (textAlign === "right") {
    textX = x + (element.width || 0);
    anchor = "end";
  }

  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const lineY = y + i * actualLineHeight + fontSize; // baseline offset
    out += `<text x="${textX}" y="${lineY}" fill="${strokeColor}" font-family="${escapeXml(fontFamily)}, sans-serif" font-size="${fontSize}" text-anchor="${anchor}" dominant-baseline="auto">${escapeXml(lines[i])}</text>\n`;
  }
  return out;
}

function svgImage(
  element: ExcalidrawElement,
  ox: number,
  oy: number,
  files: Record<string, { dataURL: string }>,
  darkMode: boolean,
): string {
  const fileId = element.fileId as string | null;
  if (!fileId) return "";

  const fileData = files[fileId];
  if (!fileData) return "";

  const x = element.x + ox;
  const y = element.y + oy;
  const w = element.width || 0;
  const h = element.height || 0;

  const cornerRadius = getCornerRadius(Math.min(w, h), element);
  const scale = (element.scale as [number, number]) || [1, 1];

  let out = "";
  const clipId = `clip-${element.id}`;
  const darkModeFilter = darkMode
    ? ' style="filter: invert(0.93) hue-rotate(180deg)"'
    : "";

  // Open group for transforms
  let transform = "";
  if (scale[0] !== 1 || scale[1] !== 1) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    transform = `translate(${cx}, ${cy}) scale(${scale[0]}, ${scale[1]}) translate(${-cx}, ${-cy})`;
  }

  if (cornerRadius > 0) {
    out += `<defs><clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${cornerRadius}" ry="${cornerRadius}"/></clipPath></defs>\n`;
    out += `<g clip-path="url(#${clipId})"${transform ? ` transform="${transform}"` : ""}${darkModeFilter}>`;
  } else if (transform || darkMode) {
    out += `<g${transform ? ` transform="${transform}"` : ""}${darkModeFilter}>`;
  }

  // Handle crop
  const crop = element.crop as {
    x: number;
    y: number;
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
  } | null;

  if (crop) {
    // SVG doesn't have direct crop support — use viewBox trick via nested SVG
    out += `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}" preserveAspectRatio="none">`;
    out += `<image href="${escapeXml(fileData.dataURL)}" width="${crop.naturalWidth || crop.width}" height="${crop.naturalHeight || crop.height}"/>`;
    out += `</svg>`;
  } else {
    out += `<image href="${escapeXml(fileData.dataURL)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/>`;
  }

  if (cornerRadius > 0 || transform || darkMode) {
    out += `</g>`;
  }

  return `${out}\n`;
}

function svgFrame(
  element: ExcalidrawElement,
  ox: number,
  oy: number,
  ct: ColorTransform,
): string {
  const x = element.x + ox;
  const y = element.y + oy;
  const w = element.width || 0;
  const h = element.height || 0;

  const strokeColor = ct(FRAME_STYLE.strokeColor);
  const name = (element.name as string | null) ?? "Frame";
  const nameColor =
    ct === applyDarkModeFilter
      ? FRAME_STYLE.nameColorDarkTheme
      : FRAME_STYLE.nameColorLightTheme;

  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${FRAME_STYLE.radius}" ry="${FRAME_STYLE.radius}" stroke="${strokeColor}" stroke-width="${FRAME_STYLE.strokeWidth}" fill="none"/>\n`;
  out += `<text x="${x}" y="${y - FRAME_STYLE.nameOffsetY}" fill="${nameColor}" font-family="Liberation Sans, Helvetica, sans-serif" font-size="${FRAME_STYLE.nameFontSize}" text-anchor="start" dominant-baseline="auto">${escapeXml(name)}</text>\n`;

  return out;
}

function svgEmbeddable(
  gen: RoughGenerator,
  element: ExcalidrawElement,
  ox: number,
  oy: number,
  ct: ColorTransform,
): string {
  let out = svgRectangle(gen, element, ox, oy, ct);

  const isIframe = element.type === "iframe";
  const link = element.link as string | null;
  const text = isIframe
    ? "IFrame element"
    : !link || link === ""
      ? "Empty Web-Embed"
      : link;

  const x = element.x + ox;
  const y = element.y + oy;
  const w = element.width || 0;
  const h = element.height || 0;

  const fontSize = Math.max(Math.min(w / 2, w / text.length), w / 30);
  const textColor =
    element.strokeColor !== "transparent"
      ? ct(element.strokeColor || "#000000")
      : ct("#000000");

  out += `<text x="${x + w / 2}" y="${y + h / 2}" fill="${textColor}" font-family="Liberation Sans, Helvetica, sans-serif" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">${escapeXml(text)}</text>\n`;
  return out;
}

// ---------------------------------------------------------------------------
// SVG element dispatcher
// ---------------------------------------------------------------------------

function renderSvgElement(
  gen: RoughGenerator,
  element: ExcalidrawElement,
  ox: number,
  oy: number,
  ct: ColorTransform,
  files: Record<string, { dataURL: string }>,
  darkMode: boolean,
  maskId?: string,
): string {
  if (element.isDeleted) return "";

  const opacity = (element.opacity ?? 100) / 100;
  const rotation = (element.angle as Angle) || 0;

  let inner = "";
  switch (element.type) {
    case "rectangle":
      inner = svgRectangle(gen, element, ox, oy, ct);
      break;
    case "diamond":
      inner = svgDiamond(gen, element, ox, oy, ct);
      break;
    case "ellipse":
      inner = svgEllipse(gen, element, ox, oy, ct);
      break;
    case "line":
      inner = svgLine(gen, element, ox, oy, ct);
      break;
    case "arrow":
      inner = svgArrow(gen, element, ox, oy, ct);
      break;
    case "freedraw":
      inner = svgFreedraw(gen, element, ox, oy, ct);
      break;
    case "text":
      inner = svgText(element, ox, oy, ct);
      break;
    case "image":
      inner = svgImage(element, ox, oy, files, darkMode);
      break;
    case "embeddable":
    case "iframe":
      inner = svgEmbeddable(gen, element, ox, oy, ct);
      break;
    case "frame":
    case "magicframe":
      inner = svgFrame(element, ox, oy, ct);
      break;
    default:
      console.warn(`Unsupported element type: ${element.type}`);
      return "";
  }

  if (!inner) return "";

  // Wrap with group for opacity and rotation
  const transforms: string[] = [];
  if (rotation) {
    const cx = element.x + ox + (element.width || 0) / 2;
    const cy = element.y + oy + (element.height || 0) / 2;
    transforms.push(`rotate(${(rotation * 180) / Math.PI}, ${cx}, ${cy})`);
  }

  const attrs: string[] = [];
  if (transforms.length > 0) attrs.push(`transform="${transforms.join(" ")}"`);
  if (opacity < 1) attrs.push(`opacity="${opacity}"`);
  if (maskId) attrs.push(`mask="url(#${maskId})"`);

  if (attrs.length > 0) {
    return `<g ${attrs.join(" ")}>\n${inner}</g>\n`;
  }
  return inner;
}

// ---------------------------------------------------------------------------
// Main SVG export
// ---------------------------------------------------------------------------

export async function exportToSvg(
  inputPath: string,
  options: ExportOptions,
  content?: string,
): Promise<void> {
  const prepared = prepareExport(inputPath, options, content);
  const {
    data,
    exportFrame,
    bounds,
    width,
    height,
    ct,
    backgroundColor,
    sortedElements,
    elementsById,
  } = prepared;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gen = (rough as any).generator() as RoughGenerator;

  const ox = -bounds.minX;
  const oy = -bounds.minY;
  const files = data.files || {};
  const viewW = width / options.scale;
  const viewH = height / options.scale;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${viewW} ${viewH}">\n`;

  // Background
  if (backgroundColor !== "transparent") {
    svg += `<rect x="0" y="0" width="${viewW}" height="${viewH}" fill="${backgroundColor}"/>\n`;
  }

  // Collect used font families from text elements for @font-face embedding
  const usedFontFamilyIds = new Set<number>();
  for (const element of sortedElements) {
    if (element.type === "text" && element.fontFamily) {
      usedFontFamilyIds.add(element.fontFamily as number);
    }
    // Frame labels and embeddable placeholders use Liberation Sans
    if (
      element.type === "frame" ||
      element.type === "magicframe" ||
      element.type === "embeddable" ||
      element.type === "iframe"
    ) {
      usedFontFamilyIds.add(9); // Liberation Sans
    }
  }

  // Build arrow → bound text lookup for masking
  const arrowBoundTexts = new Map<string, ExcalidrawElement[]>();
  for (const element of sortedElements) {
    const containerId = element.containerId as string | null;
    if (element.type === "text" && containerId) {
      const container = elementsById.get(containerId);
      if (container && container.type === "arrow") {
        const existing = arrowBoundTexts.get(containerId) || [];
        existing.push(element);
        arrowBoundTexts.set(containerId, existing);
      }
    }
  }

  // Collect clipPath defs for frames
  let defs = "";
  let clipCounter = 0;
  const frameClipIds = new Map<string, string>();

  if (exportFrame) {
    const clipId = `frame-clip-${clipCounter++}`;
    frameClipIds.set(exportFrame.id, clipId);
    const fx = exportFrame.x + ox;
    const fy = exportFrame.y + oy;
    const fw = exportFrame.width || 0;
    const fh = exportFrame.height || 0;
    const fAngle = (exportFrame.angle as Angle) || 0;
    const rotateAttr = fAngle
      ? ` transform="rotate(${(fAngle * 180) / Math.PI}, ${fx + fw / 2}, ${fy + fh / 2})"`
      : "";
    defs += `<clipPath id="${clipId}"><rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="${FRAME_STYLE.radius}" ry="${FRAME_STYLE.radius}"${rotateAttr}/></clipPath>\n`;
  } else {
    // Collect frame clip defs for child elements
    for (const element of sortedElements) {
      const frameId = element.frameId as string | null;
      if (frameId && !frameClipIds.has(frameId)) {
        const frame = elementsById.get(frameId);
        if (frame) {
          const clipId = `frame-clip-${clipCounter++}`;
          frameClipIds.set(frameId, clipId);
          const fx = frame.x + ox;
          const fy = frame.y + oy;
          const fw = frame.width || 0;
          const fh = frame.height || 0;
          const fAngle = (frame.angle as Angle) || 0;
          const rotateAttr = fAngle
            ? ` transform="rotate(${(fAngle * 180) / Math.PI}, ${fx + fw / 2}, ${fy + fh / 2})"`
            : "";
          defs += `<clipPath id="${clipId}"><rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="${FRAME_STYLE.radius}" ry="${FRAME_STYLE.radius}"${rotateAttr}/></clipPath>\n`;
        }
      }
    }
  }

  // Generate mask defs for arrows with bound text labels
  const arrowMaskIds = new Map<string, string>();
  for (const [arrowId, textElements] of arrowBoundTexts) {
    const maskId = `mask-${arrowId}`;
    arrowMaskIds.set(arrowId, maskId);
    const padding = 4;
    // White rect makes everything visible; black rects hide arrow under text
    defs += `<mask id="${maskId}">\n`;
    defs += `<rect x="0" y="0" width="${viewW}" height="${viewH}" fill="#fff"/>\n`;
    for (const textEl of textElements) {
      const tx = textEl.x + ox - padding;
      const ty = textEl.y + oy - padding;
      const tw = (textEl.width || 0) + padding * 2;
      const th = (textEl.height || 0) + padding * 2;
      defs += `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" fill="#000"/>\n`;
    }
    defs += `</mask>\n`;
  }

  // Generate @font-face CSS for used fonts
  const fontCSS = generateFontFaceCSS(usedFontFamilyIds);
  if (fontCSS) {
    defs += `<style>\n  ${fontCSS}</style>\n`;
  }

  if (defs) {
    svg += `<defs>\n${defs}</defs>\n`;
  }

  // Render elements
  if (exportFrame) {
    const clipId = frameClipIds.get(exportFrame.id) as string;
    svg += `<g clip-path="url(#${clipId})">\n`;
    for (const element of sortedElements) {
      const maskId = arrowMaskIds.get(element.id);
      svg += renderSvgElement(
        gen,
        element,
        ox,
        oy,
        ct,
        files,
        options.darkMode,
        maskId,
      );
    }
    svg += `</g>\n`;
  } else {
    for (const element of sortedElements) {
      const frameId = element.frameId as string | null;
      const clipId = frameId ? frameClipIds.get(frameId) : undefined;
      const maskId = arrowMaskIds.get(element.id);

      if (clipId) {
        svg += `<g clip-path="url(#${clipId})">\n`;
        svg += renderSvgElement(
          gen,
          element,
          ox,
          oy,
          ct,
          files,
          options.darkMode,
          maskId,
        );
        svg += `</g>\n`;
      } else {
        svg += renderSvgElement(
          gen,
          element,
          ox,
          oy,
          ct,
          files,
          options.darkMode,
          maskId,
        );
      }
    }
  }

  svg += `</svg>\n`;

  if (options.outputPath === "-") {
    process.stdout.write(svg);
  } else {
    writeFileSync(options.outputPath, svg, "utf-8");
    console.log(`Exported to ${options.outputPath}`);
  }
}

/**
 * Options for rendering pre-styled elements to SVG.
 */
export interface SvgRenderOptions {
  outputPath: string;
  scale: number;
  bounds: Bounds;
  width: number;
  height: number;
  backgroundColor: string;
  ct: ColorTransform;
  darkMode: boolean;
  files: Record<string, { dataURL: string }>;
  /** Optional callback to generate additional SVG content after elements (e.g., diff tags) */
  afterRenderSvg?: (offsetX: number, offsetY: number) => string;
}

/**
 * Export pre-styled elements to SVG.
 * Used by diff export to render elements with custom styling.
 */
export async function exportToSvgWithElements(
  elements: ExcalidrawElement[],
  options: SvgRenderOptions,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gen = (rough as any).generator() as RoughGenerator;

  const ox = -options.bounds.minX;
  const oy = -options.bounds.minY;
  const viewW = options.width / options.scale;
  const viewH = options.height / options.scale;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${viewW} ${viewH}">\n`;

  // Background
  if (options.backgroundColor !== "transparent") {
    svg += `<rect x="0" y="0" width="${viewW}" height="${viewH}" fill="${options.backgroundColor}"/>\n`;
  }

  // Collect used font families from text elements
  const usedFontFamilyIds = new Set<number>();
  for (const element of elements) {
    if (element.type === "text" && element.fontFamily) {
      usedFontFamilyIds.add(element.fontFamily as number);
    }
    if (
      element.type === "frame" ||
      element.type === "magicframe" ||
      element.type === "embeddable" ||
      element.type === "iframe"
    ) {
      usedFontFamilyIds.add(9); // Liberation Sans
    }
  }

  // Build element map
  const elementsById = new Map<string, ExcalidrawElement>();
  for (const element of elements) {
    elementsById.set(element.id, element);
  }

  // Build arrow → bound text lookup for masking
  const arrowBoundTexts = new Map<string, ExcalidrawElement[]>();
  for (const element of elements) {
    const containerId = element.containerId as string | null;
    if (element.type === "text" && containerId) {
      const container = elementsById.get(containerId);
      if (container && container.type === "arrow") {
        const existing = arrowBoundTexts.get(containerId) || [];
        existing.push(element);
        arrowBoundTexts.set(containerId, existing);
      }
    }
  }

  // Generate mask defs for arrows with bound text labels
  let defs = "";
  const arrowMaskIds = new Map<string, string>();
  for (const [arrowId, textElements] of arrowBoundTexts) {
    const maskId = `mask-${arrowId}`;
    arrowMaskIds.set(arrowId, maskId);
    const padding = 4;
    defs += `<mask id="${maskId}">\n`;
    defs += `<rect x="0" y="0" width="${viewW}" height="${viewH}" fill="#fff"/>\n`;
    for (const textEl of textElements) {
      const tx = textEl.x + ox - padding;
      const ty = textEl.y + oy - padding;
      const tw = (textEl.width || 0) + padding * 2;
      const th = (textEl.height || 0) + padding * 2;
      defs += `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" fill="#000"/>\n`;
    }
    defs += `</mask>\n`;
  }

  // Generate @font-face CSS for used fonts
  const fontCSS = generateFontFaceCSS(usedFontFamilyIds);
  if (fontCSS) {
    defs += `<style>\n  ${fontCSS}</style>\n`;
  }

  if (defs) {
    svg += `<defs>\n${defs}</defs>\n`;
  }

  // Render elements (no frame clipping for diff export)
  for (const element of elements) {
    const maskId = arrowMaskIds.get(element.id);
    svg += renderSvgElement(
      gen,
      element,
      ox,
      oy,
      options.ct,
      options.files,
      options.darkMode,
      maskId,
    );
  }

  // Call afterRenderSvg callback if provided (e.g., for diff tags)
  if (options.afterRenderSvg) {
    svg += options.afterRenderSvg(ox, oy);
  }

  svg += `</svg>\n`;

  if (options.outputPath === "-") {
    process.stdout.write(svg);
  } else {
    writeFileSync(options.outputPath, svg, "utf-8");
  }
}
