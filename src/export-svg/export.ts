import { writeFileSync } from "node:fs";
import rough from "roughjs";
import type { RoughGenerator } from "roughjs/bin/generator.js";
import { generateFontFaceCSS } from "../fonts.js";
import {
  type Angle,
  type Bounds,
  type ColorTransform,
  FRAME_STYLE,
  prepareExport,
} from "../shared.js";
import type { ExcalidrawElement, ExportOptions } from "../types.js";
import {
  buildArrowBoundTextLookup,
  buildArrowMaskDefs,
  collectUsedFontFamilies,
} from "./document.js";
import { renderSvgElement } from "./renderers.js";

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

  const usedFontFamilyIds = collectUsedFontFamilies(sortedElements);
  const arrowBoundTexts = buildArrowBoundTextLookup(
    sortedElements,
    elementsById,
  );

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
  const { defs: maskDefs, maskIds: arrowMaskIds } = buildArrowMaskDefs(
    arrowBoundTexts,
    viewW,
    viewH,
    ox,
    oy,
  );
  defs += maskDefs;

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

  const usedFontFamilyIds = collectUsedFontFamilies(elements);

  // Build element map
  const elementsById = new Map<string, ExcalidrawElement>();
  for (const element of elements) {
    elementsById.set(element.id, element);
  }

  const arrowBoundTexts = buildArrowBoundTextLookup(elements, elementsById);

  // Generate mask defs for arrows with bound text labels
  let defs = "";
  const { defs: maskDefs, maskIds: arrowMaskIds } = buildArrowMaskDefs(
    arrowBoundTexts,
    viewW,
    viewH,
    ox,
    oy,
  );
  defs += maskDefs;

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
