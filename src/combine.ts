import { createWriteStream, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { type Canvas, createCanvas, loadImage } from "canvas";
import {
  type RenderToCanvasOptions,
  renderElementsToCanvas,
} from "./export.js";
import { registerFonts } from "./fonts.js";
import { applyDarkModeFilter, identityColor, prepareExport } from "./shared.js";
import type { ExportOptions } from "./types.js";

export interface CombineOptions {
  outputPath: string;
  layout: "horizontal" | "vertical";
  gap: number;
  labels: boolean;
  scale: number;
  darkMode: boolean;
  transparent: boolean;
}

interface PanelInfo {
  canvas: Canvas;
  width: number;
  height: number;
  label: string;
}

export async function exportCombined(
  inputPaths: string[],
  options: CombineOptions,
): Promise<void> {
  registerFonts();

  const ct = options.darkMode ? applyDarkModeFilter : identityColor;
  const scaledGap = Math.ceil(options.gap * options.scale);
  const labelFontSize = Math.ceil(14 * options.scale);
  const labelPadding = Math.ceil(4 * options.scale);
  const labelHeight = options.labels ? labelFontSize + labelPadding : 0;

  // Render each file to an individual canvas
  const panels: PanelInfo[] = [];

  for (const filePath of inputPaths) {
    const exportOptions: ExportOptions = {
      outputPath: "",
      scale: options.scale,
      background: options.transparent ? "transparent" : null,
      darkMode: options.darkMode,
    };

    const prepared = prepareExport(filePath, exportOptions);

    const renderOptions: RenderToCanvasOptions = {
      scale: options.scale,
      bounds: prepared.bounds,
      width: prepared.width,
      height: prepared.height,
      backgroundColor: prepared.backgroundColor,
      ct,
      darkMode: options.darkMode,
      files: prepared.data.files || {},
    };

    const canvas = await renderElementsToCanvas(
      prepared.sortedElements,
      renderOptions,
    );

    panels.push({
      canvas,
      width: prepared.width,
      height: prepared.height,
      label: basename(filePath, ".excalidraw"),
    });
  }

  // Calculate master dimensions
  let totalWidth: number;
  let totalHeight: number;

  if (options.layout === "vertical") {
    totalWidth = Math.max(...panels.map((p) => p.width));
    totalHeight =
      panels.reduce((sum, p) => sum + p.height + labelHeight, 0) +
      scaledGap * (panels.length - 1);
  } else {
    totalWidth =
      panels.reduce((sum, p) => sum + p.width, 0) +
      scaledGap * (panels.length - 1);
    totalHeight = Math.max(...panels.map((p) => p.height + labelHeight));
  }

  // Determine output format
  const outputPath = options.outputPath;
  const isPdf = outputPath.endsWith(".pdf");

  // Create master canvas
  const masterCanvas = isPdf
    ? createCanvas(totalWidth, totalHeight, "pdf")
    : createCanvas(totalWidth, totalHeight);
  const ctx = masterCanvas.getContext("2d");

  // Fill background
  if (!options.transparent) {
    const bgColor = options.darkMode ? ct("#ffffff") : "#ffffff";
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, totalWidth, totalHeight);
  }

  // Compose panels onto master canvas
  let x = 0;
  let y = 0;

  for (const panel of panels) {
    if (isPdf) {
      // For PDF canvas, draw via PNG buffer → loadImage
      const pngBuffer = panel.canvas.toBuffer("image/png");
      const img = await loadImage(pngBuffer);
      ctx.drawImage(img, x, y);
    } else {
      ctx.drawImage(panel.canvas, x, y);
    }

    // Draw label if enabled
    if (options.labels) {
      ctx.save();
      ctx.font = `${labelFontSize}px sans-serif`;
      ctx.fillStyle = options.darkMode ? "#cccccc" : "#333333";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const labelX = x + panel.width / 2;
      const labelY = y + panel.height + labelPadding;
      ctx.fillText(panel.label, labelX, labelY);
      ctx.restore();
    }

    if (options.layout === "vertical") {
      y += panel.height + labelHeight + scaledGap;
    } else {
      x += panel.width + scaledGap;
    }
  }

  // Write output
  if (isPdf) {
    if (outputPath === "-") {
      process.stdout.write(masterCanvas.toBuffer("application/pdf"));
    } else {
      writeFileSync(outputPath, masterCanvas.toBuffer("application/pdf"));
      console.log(`Exported to ${outputPath}`);
    }
    return;
  }

  if (outputPath === "-") {
    return new Promise((resolve, reject) => {
      const stream = masterCanvas.createPNGStream();
      stream.pipe(process.stdout);
      stream.on("end", resolve);
      stream.on("error", reject);
    });
  }

  return new Promise((resolve, reject) => {
    const out = createWriteStream(outputPath);
    const stream = masterCanvas.createPNGStream();
    stream.pipe(out);
    out.on("finish", () => {
      console.log(`Exported to ${outputPath}`);
      resolve();
    });
    out.on("error", reject);
  });
}
