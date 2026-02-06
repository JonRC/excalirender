import type { ExcalidrawElement } from "../types.js";

/** Collect font family IDs used by text/frame/embeddable elements */
export function collectUsedFontFamilies(
  elements: ExcalidrawElement[],
): Set<number> {
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
  return usedFontFamilyIds;
}

/** Build lookup of arrow IDs → bound text elements for masking */
export function buildArrowBoundTextLookup(
  elements: ExcalidrawElement[],
  elementsById: Map<string, ExcalidrawElement>,
): Map<string, ExcalidrawElement[]> {
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
  return arrowBoundTexts;
}

/** Generate SVG mask defs for arrows with bound text labels */
export function buildArrowMaskDefs(
  arrowBoundTexts: Map<string, ExcalidrawElement[]>,
  viewW: number,
  viewH: number,
  ox: number,
  oy: number,
): { defs: string; maskIds: Map<string, string> } {
  let defs = "";
  const maskIds = new Map<string, string>();
  for (const [arrowId, textElements] of arrowBoundTexts) {
    const maskId = `mask-${arrowId}`;
    maskIds.set(arrowId, maskId);
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
  return { defs, maskIds };
}
