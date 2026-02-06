import type { PathInfo } from "roughjs/bin/core.js";

export function svgPathsToMarkup(
  paths: PathInfo[],
  dashArray?: number[],
): string {
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

export function buildRoundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  return `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y}, ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h}, ${x + w - r} ${y + h} L ${x + r} ${y + h} Q ${x} ${y + h}, ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y}, ${x + r} ${y}`;
}
