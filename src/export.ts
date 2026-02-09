import { createWriteStream, writeFileSync } from "node:fs";
import {
  type Canvas,
  type CanvasRenderingContext2D,
  createCanvas,
  type Image,
  loadImage,
} from "canvas";
import { getStroke } from "perfect-freehand";
import { simplify } from "points-on-curve";
import rough from "roughjs";
import type { RoughCanvas } from "roughjs/bin/canvas.js";
import { registerFonts } from "./fonts.js";
import {
  type Angle,
  applyDarkModeFilter,
  applyDarkModeToImageData,
  type Bounds,
  type ColorTransform,
  FONT_FAMILY,
  FRAME_STYLE,
  getCornerRadius,
  getRoughOptions,
  isPathALoop,
  prepareExport,
} from "./shared.js";
import type { ExcalidrawElement, ExportOptions } from "./types.js";

function renderRectangle(
  rc: RoughCanvas,
  element: ExcalidrawElement,
  offsetX: number,
  offsetY: number,
  ct: ColorTransform,
) {
  const x = element.x + offsetX;
  const y = element.y + offsetY;
  const width = element.width || 0;
  const height = element.height || 0;
  const options = getRoughOptions(element, ct);

  // Handle rounded corners
  const r = getCornerRadius(Math.min(width, height), element);
  if (r > 0) {
    const path = `M ${x + r} ${y} L ${x + width - r} ${y} Q ${x + width} ${y}, ${x + width} ${y + r} L ${x + width} ${y + height - r} Q ${x + width} ${y + height}, ${x + width - r} ${y + height} L ${x + r} ${y + height} Q ${x} ${y + height}, ${x} ${y + height - r} L ${x} ${y + r} Q ${x} ${y}, ${x + r} ${y}`;
    rc.path(path, options);
  } else {
    rc.rectangle(x, y, width, height, options);
  }
}

function renderDiamond(
  rc: RoughCanvas,
  element: ExcalidrawElement,
  offsetX: number,
  offsetY: number,
  ct: ColorTransform,
) {
  const x = element.x + offsetX;
  const y = element.y + offsetY;
  const width = element.width || 0;
  const height = element.height || 0;
  const options = getRoughOptions(element, ct);

  const topX = x + width / 2;
  const topY = y;
  const rightX = x + width;
  const rightY = y + height / 2;
  const bottomX = x + width / 2;
  const bottomY = y + height;
  const leftX = x;
  const leftY = y + height / 2;

  // Rounded diamond uses cubic bezier curves at corners
  const vr = getCornerRadius(Math.abs(topX - leftX), element);
  const hr = getCornerRadius(Math.abs(rightY - topY), element);

  if (vr > 0 || hr > 0) {
    const path = `M ${topX + vr} ${topY + hr} L ${rightX - vr} ${rightY - hr} C ${rightX} ${rightY}, ${rightX} ${rightY}, ${rightX - vr} ${rightY + hr} L ${bottomX + vr} ${bottomY - hr} C ${bottomX} ${bottomY}, ${bottomX} ${bottomY}, ${bottomX - vr} ${bottomY - hr} L ${leftX + vr} ${leftY + hr} C ${leftX} ${leftY}, ${leftX} ${leftY}, ${leftX + vr} ${leftY - hr} L ${topX - vr} ${topY + hr} C ${topX} ${topY}, ${topX} ${topY}, ${topX + vr} ${topY + hr}`;
    rc.path(path, options);
  } else {
    rc.polygon(
      [
        [topX, topY],
        [rightX, rightY],
        [bottomX, bottomY],
        [leftX, leftY],
      ],
      options,
    );
  }
}

function renderEllipse(
  rc: RoughCanvas,
  element: ExcalidrawElement,
  offsetX: number,
  offsetY: number,
  ct: ColorTransform,
) {
  const x = element.x + offsetX;
  const y = element.y + offsetY;
  const width = element.width || 0;
  const height = element.height || 0;
  const options = getRoughOptions(element, ct);

  rc.ellipse(x + width / 2, y + height / 2, width, height, options);
}

function renderLine(
  rc: RoughCanvas,
  element: ExcalidrawElement,
  offsetX: number,
  offsetY: number,
  ct: ColorTransform,
) {
  const points = element.points as [number, number][];
  if (!points || points.length < 2) return;

  const x = element.x + offsetX;
  const y = element.y + offsetY;
  const options = getRoughOptions(element, ct);

  const transformedPoints = points.map(
    ([px, py]) => [x + px, y + py] as [number, number],
  );

  if (transformedPoints.length === 2) {
    rc.line(
      transformedPoints[0][0],
      transformedPoints[0][1],
      transformedPoints[1][0],
      transformedPoints[1][1],
      options,
    );
  } else {
    rc.curve(transformedPoints, options);
  }
}

function renderArrow(
  rc: RoughCanvas,
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  offsetX: number,
  offsetY: number,
  ct: ColorTransform,
) {
  // Arrow paths should not be filled — strip backgroundColor
  const arrowElement = { ...element, backgroundColor: "transparent" };
  renderLine(rc, arrowElement, offsetX, offsetY, ct);

  // Then render arrowheads
  const points = element.points as [number, number][];
  if (!points || points.length < 2) return;

  const x = element.x + offsetX;
  const y = element.y + offsetY;
  const strokeColor = ct(element.strokeColor || "#000000");
  const strokeWidth = element.strokeWidth || 1;

  const endArrowhead = element.endArrowhead;
  const startArrowhead = element.startArrowhead;

  if (endArrowhead === "arrow" || endArrowhead === "triangle") {
    const lastIdx = points.length - 1;
    const secondLastIdx = Math.max(0, lastIdx - 1);
    drawArrowhead(
      ctx,
      x + points[secondLastIdx][0],
      y + points[secondLastIdx][1],
      x + points[lastIdx][0],
      y + points[lastIdx][1],
      strokeColor,
      strokeWidth,
    );
  }

  if (startArrowhead === "arrow" || startArrowhead === "triangle") {
    drawArrowhead(
      ctx,
      x + points[1][0],
      y + points[1][1],
      x + points[0][0],
      y + points[0][1],
      strokeColor,
      strokeWidth,
    );
  }
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  strokeWidth: number,
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const headLength = 15 + strokeWidth * 2;
  const headAngle = Math.PI / 6;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLength * Math.cos(angle - headAngle),
    toY - headLength * Math.sin(angle - headAngle),
  );
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLength * Math.cos(angle + headAngle),
    toY - headLength * Math.sin(angle + headAngle),
  );
  ctx.stroke();
  ctx.restore();
}

function renderFreedraw(
  rc: RoughCanvas,
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  offsetX: number,
  offsetY: number,
  ct: ColorTransform,
) {
  const points = element.points as [number, number][];
  if (!points || points.length < 2) return;

  const x = element.x + offsetX;
  const y = element.y + offsetY;
  const strokeColor = ct(element.strokeColor || "#000000");
  const strokeWidth = element.strokeWidth || 1;
  const pressures = element.pressures as number[] | undefined;

  // (1) Background fill for closed paths (loop detection)
  if (isPathALoop(points) && element.backgroundColor !== "transparent") {
    const simplifiedPoints = simplify(points, 0.75);
    const transformedPoints = simplifiedPoints.map(
      ([px, py]) => [x + px, y + py] as [number, number],
    );
    const options = getRoughOptions(element, ct);
    rc.curve(transformedPoints, {
      ...options,
      stroke: "none",
    });
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

  if (strokePoints.length < 2) return;

  ctx.save();
  ctx.fillStyle = strokeColor;
  ctx.translate(x, y);

  ctx.beginPath();
  ctx.moveTo(strokePoints[0][0], strokePoints[0][1]);

  for (let i = 1; i < strokePoints.length - 1; i++) {
    const xc = (strokePoints[i][0] + strokePoints[i + 1][0]) / 2;
    const yc = (strokePoints[i][1] + strokePoints[i + 1][1]) / 2;
    ctx.quadraticCurveTo(strokePoints[i][0], strokePoints[i][1], xc, yc);
  }

  const lastPoint = strokePoints[strokePoints.length - 1];
  ctx.lineTo(lastPoint[0], lastPoint[1]);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function renderText(
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  offsetX: number,
  offsetY: number,
  ct: ColorTransform,
  sceneBgColor?: string,
  elementsById?: Map<string, ExcalidrawElement>,
) {
  const x = element.x + offsetX;
  const y = element.y + offsetY;
  const text = element.text as string;
  const fontSize = (element.fontSize as number) || 20;
  const fontFamily = FONT_FAMILY[element.fontFamily as number] || "Virgil";
  const strokeColor = ct(element.strokeColor || "#000000");
  const textAlign = (element.textAlign as CanvasTextAlign) || "left";
  const opacity = (element.opacity ?? 100) / 100;

  if (!text) return;

  // If this text is bound to an arrow container, draw an opaque background
  // rectangle to mask the arrow line underneath, creating the visual gap.
  // Only do this for arrows - other containers (rectangle, ellipse, diamond)
  // should show text on top of their own background fill without masking.
  const containerId = element.containerId as string | null;
  if (containerId && sceneBgColor && elementsById) {
    const container = elementsById.get(containerId);
    if (container && container.type === "arrow") {
      const padding = 4;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = sceneBgColor;
      ctx.fillRect(
        x - padding,
        y - padding,
        (element.width || 0) + padding * 2,
        (element.height || 0) + padding * 2,
      );
      ctx.restore();
    }
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = strokeColor;
  ctx.textBaseline = "top";
  ctx.textAlign = textAlign;

  const lines = text.split("\n");
  const lineHeight = (element.lineHeight as number) || 1.25;
  const actualLineHeight = fontSize * lineHeight;

  let textX = x;
  if (textAlign === "center") {
    textX = x + (element.width || 0) / 2;
  } else if (textAlign === "right") {
    textX = x + (element.width || 0);
  }

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], textX, y + i * actualLineHeight);
  }

  ctx.restore();
}

function renderImage(
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  offsetX: number,
  offsetY: number,
  imageCache: Map<string, Image>,
  darkMode: boolean,
) {
  const fileId = element.fileId as string | null;
  if (!fileId) return;

  const img = imageCache.get(fileId);
  if (!img) {
    console.warn(`Image not found in cache for fileId: ${fileId}`);
    return;
  }

  const x = element.x + offsetX;
  const y = element.y + offsetY;
  const width = element.width || 0;
  const height = element.height || 0;

  ctx.save();

  // Apply rounded corners clipping
  const cornerRadius = getCornerRadius(Math.min(width, height), element);
  if (cornerRadius > 0) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, cornerRadius);
    ctx.clip();
  }

  // Apply scale (axis flipping) — applied after rotation per Excalidraw convention
  const scale = (element.scale as [number, number]) || [1, 1];
  if (scale[0] !== 1 || scale[1] !== 1) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    ctx.translate(cx, cy);
    ctx.scale(scale[0], scale[1]);
    ctx.translate(-cx, -cy);
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

  if (darkMode) {
    // Dark mode: draw image to temp canvas, apply invert(93%)+hue-rotate(180°), then composite
    const imgW = Math.ceil(width);
    const imgH = Math.ceil(height);
    if (imgW > 0 && imgH > 0) {
      const tmpCanvas = createCanvas(imgW, imgH);
      const tmpCtx = tmpCanvas.getContext("2d") as CanvasRenderingContext2D;

      if (crop) {
        tmpCtx.drawImage(
          img,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          imgW,
          imgH,
        );
      } else {
        tmpCtx.drawImage(
          img,
          0,
          0,
          img.naturalWidth || img.width,
          img.naturalHeight || img.height,
          0,
          0,
          imgW,
          imgH,
        );
      }

      const imageData = tmpCtx.getImageData(0, 0, imgW, imgH);
      applyDarkModeToImageData(imageData.data);
      tmpCtx.putImageData(imageData, 0, 0);

      ctx.drawImage(tmpCanvas, x, y, width, height);
    }
  } else if (crop) {
    ctx.drawImage(
      img,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      x,
      y,
      width,
      height,
    );
  } else {
    ctx.drawImage(
      img,
      0,
      0,
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      x,
      y,
      width,
      height,
    );
  }

  ctx.restore();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (maxWidth <= 0) return [text];

  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine + word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine.trimEnd());
      currentLine = word.trimStart();
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine.trimEnd());
  }

  return lines.length > 0 ? lines : [text];
}

function renderEmbeddable(
  rc: RoughCanvas,
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  offsetX: number,
  offsetY: number,
  ct: ColorTransform,
) {
  // Render the rectangle shape (embeddables are rendered as rectangles)
  renderRectangle(rc, element, offsetX, offsetY, ct);

  // Render placeholder text label
  const isIframe = element.type === "iframe";
  const link = element.link as string | null;
  const text = isIframe
    ? "IFrame element"
    : !link || link === ""
      ? "Empty Web-Embed"
      : link;

  const x = element.x + offsetX;
  const y = element.y + offsetY;
  const width = element.width || 0;
  const height = element.height || 0;

  // Calculate font size matching Excalidraw's algorithm
  const fontSize = Math.max(
    Math.min(width / 2, width / text.length),
    width / 30,
  );

  const textColor =
    element.strokeColor !== "transparent"
      ? ct(element.strokeColor || "#000000")
      : ct("#000000");

  ctx.save();
  ctx.font = `${fontSize}px Liberation Sans, Helvetica, sans-serif`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  // Wrap text to fit within element width (with 20px padding)
  const lines = wrapText(ctx, text, width - 20);
  const lineHeight = fontSize * 1.25;
  const totalTextHeight = lines.length * lineHeight;
  const startY = y + height / 2 - totalTextHeight / 2 + lineHeight / 2;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x + width / 2, startY + i * lineHeight);
  }

  ctx.restore();
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  offsetX: number,
  offsetY: number,
  ct: ColorTransform,
) {
  const x = element.x + offsetX;
  const y = element.y + offsetY;
  const width = element.width || 0;
  const height = element.height || 0;

  ctx.save();

  const strokeColor = ct(FRAME_STYLE.strokeColor);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = FRAME_STYLE.strokeWidth;

  // Draw rounded rectangle border
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, FRAME_STYLE.radius);
  ctx.stroke();
  ctx.closePath();

  // Draw frame label above the frame
  const name = (element.name as string | null) ?? "Frame";
  const nameColor =
    ct === applyDarkModeFilter
      ? FRAME_STYLE.nameColorDarkTheme
      : FRAME_STYLE.nameColorLightTheme;

  ctx.fillStyle = nameColor;
  ctx.font = `${FRAME_STYLE.nameFontSize}px Liberation Sans, Helvetica, sans-serif`;
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";

  // Truncate name to fit frame width
  let displayName = name;
  const maxWidth = width;
  if (ctx.measureText(displayName).width > maxWidth && maxWidth > 0) {
    while (
      displayName.length > 0 &&
      ctx.measureText(`${displayName}…`).width > maxWidth
    ) {
      displayName = displayName.slice(0, -1);
    }
    displayName = `${displayName}…`;
  }

  ctx.fillText(displayName, x, y - FRAME_STYLE.nameOffsetY);

  ctx.restore();
}

function frameClip(
  ctx: CanvasRenderingContext2D,
  frame: ExcalidrawElement,
  offsetX: number,
  offsetY: number,
) {
  const x = frame.x + offsetX;
  const y = frame.y + offsetY;
  const width = frame.width || 0;
  const height = frame.height || 0;
  const rotation = (frame.angle as Angle) || 0;

  if (rotation) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.translate(-cx, -cy);
  }

  ctx.beginPath();
  ctx.roundRect(x, y, width, height, FRAME_STYLE.radius);
  ctx.clip();

  // Undo rotation so child elements render in world space
  // (the clip region remains rotated in device coordinates)
  if (rotation) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(-rotation);
    ctx.translate(-cx, -cy);
  }
}

function renderElement(
  rc: RoughCanvas,
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  offsetX: number,
  offsetY: number,
  ct: ColorTransform,
  imageCache: Map<string, Image>,
  darkMode: boolean,
  sceneBgColor?: string,
  elementsById?: Map<string, ExcalidrawElement>,
) {
  if (element.isDeleted) return;

  const opacity = (element.opacity ?? 100) / 100;
  ctx.save();
  ctx.globalAlpha = opacity;

  // Handle rotation
  const rotation = (element.angle as Angle) || 0;
  if (rotation) {
    const cx = element.x + offsetX + (element.width || 0) / 2;
    const cy = element.y + offsetY + (element.height || 0) / 2;
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.translate(-cx, -cy);
  }

  switch (element.type) {
    case "rectangle":
      renderRectangle(rc, element, offsetX, offsetY, ct);
      break;
    case "diamond":
      renderDiamond(rc, element, offsetX, offsetY, ct);
      break;
    case "ellipse":
      renderEllipse(rc, element, offsetX, offsetY, ct);
      break;
    case "line":
      renderLine(rc, element, offsetX, offsetY, ct);
      break;
    case "arrow":
      renderArrow(rc, ctx, element, offsetX, offsetY, ct);
      break;
    case "freedraw":
      renderFreedraw(rc, ctx, element, offsetX, offsetY, ct);
      break;
    case "text":
      renderText(
        ctx,
        element,
        offsetX,
        offsetY,
        ct,
        sceneBgColor,
        elementsById,
      );
      break;
    case "image":
      renderImage(ctx, element, offsetX, offsetY, imageCache, darkMode);
      break;
    case "embeddable":
    case "iframe":
      renderEmbeddable(rc, ctx, element, offsetX, offsetY, ct);
      break;
    case "frame":
    case "magicframe":
      renderFrame(ctx, element, offsetX, offsetY, ct);
      break;
    default:
      console.warn(`Unsupported element type: ${element.type}`);
  }

  ctx.restore();
}

export async function exportToPng(
  inputPath: string,
  options: ExportOptions,
  content?: string,
  format: "png" | "pdf" = "png",
): Promise<void> {
  // Register fonts first
  registerFonts();

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

  // Create canvas (PDF backend for pdf format)
  const canvas =
    format === "pdf"
      ? createCanvas(width, height, "pdf")
      : createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Enable font embedding for selectable text in PDF
  if (format === "pdf") {
    (ctx as any).textDrawingMode = "glyph";
  }

  // Apply scale
  ctx.scale(options.scale, options.scale);

  // Fill background
  if (backgroundColor !== "transparent") {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width / options.scale, height / options.scale);
  }

  // Create rough canvas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rc = (rough as any).canvas(canvas) as RoughCanvas;

  // Calculate offset to translate elements to canvas coordinates
  const offsetX = -bounds.minX;
  const offsetY = -bounds.minY;

  // Preload images into cache
  const imageCache = new Map<string, Image>();
  const files = data.files || {};
  for (const [fileId, fileData] of Object.entries(files)) {
    try {
      const img = await loadImage(fileData.dataURL);
      imageCache.set(fileId, img);
    } catch (err) {
      console.warn(`Failed to load image ${fileId}:`, err);
    }
  }

  // Render elements
  if (exportFrame) {
    // Frame-only export: clip to frame bounds, skip frame element itself
    ctx.save();
    frameClip(ctx, exportFrame, offsetX, offsetY);
    for (const element of sortedElements) {
      renderElement(
        rc,
        ctx,
        element,
        offsetX,
        offsetY,
        ct,
        imageCache,
        options.darkMode,
        backgroundColor,
        elementsById,
      );
    }
    ctx.restore();
  } else {
    // Full export: render all elements with frame clipping support
    for (const element of sortedElements) {
      const frameId = element.frameId as string | null;
      if (frameId) {
        const frame = elementsById.get(frameId);
        if (frame) {
          ctx.save();
          frameClip(ctx, frame, offsetX, offsetY);
          renderElement(
            rc,
            ctx,
            element,
            offsetX,
            offsetY,
            ct,
            imageCache,
            options.darkMode,
            backgroundColor,
            elementsById,
          );
          ctx.restore();
          continue;
        }
      }
      renderElement(
        rc,
        ctx,
        element,
        offsetX,
        offsetY,
        ct,
        imageCache,
        options.darkMode,
        backgroundColor,
        elementsById,
      );
    }
  }

  // Write output
  if (format === "pdf") {
    if (options.outputPath === "-") {
      process.stdout.write(canvas.toBuffer("application/pdf"));
    } else {
      writeFileSync(options.outputPath, canvas.toBuffer("application/pdf"));
      console.log(`Exported to ${options.outputPath}`);
    }
    return;
  }

  if (options.outputPath === "-") {
    // Write PNG to stdout
    return new Promise((resolve, reject) => {
      const stream = canvas.createPNGStream();
      stream.pipe(process.stdout);
      stream.on("end", resolve);
      stream.on("error", reject);
    });
  }

  return new Promise((resolve, reject) => {
    const out = createWriteStream(options.outputPath);
    const stream = canvas.createPNGStream();

    stream.pipe(out);
    out.on("finish", () => {
      console.log(`Exported to ${options.outputPath}`);
      resolve();
    });
    out.on("error", reject);
  });
}

/**
 * Options for rendering pre-styled elements to a canvas.
 */
export interface RenderToCanvasOptions {
  scale: number;
  bounds: Bounds;
  width: number;
  height: number;
  backgroundColor: string;
  ct: ColorTransform;
  darkMode: boolean;
  files: Record<string, { dataURL: string }>;
  /** Optional callback to render additional content after elements (e.g., diff tags) */
  afterRender?: (
    ctx: CanvasRenderingContext2D,
    offsetX: number,
    offsetY: number,
  ) => void;
}

/**
 * Options for exporting pre-styled elements to PNG/PDF file.
 */
export interface RenderOptions extends RenderToCanvasOptions {
  outputPath: string;
  format?: "png" | "pdf";
}

/**
 * Render pre-styled elements to a canvas and return it.
 * Used by diff GIF export to get pixel data, and by exportToPngWithElements for file output.
 */
export async function renderElementsToCanvas(
  elements: ExcalidrawElement[],
  options: RenderToCanvasOptions,
): Promise<Canvas> {
  // Register fonts first
  registerFonts();

  const canvas = createCanvas(options.width, options.height);
  const ctx = canvas.getContext("2d");

  // Apply scale
  ctx.scale(options.scale, options.scale);

  // Fill background
  if (options.backgroundColor !== "transparent") {
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(
      0,
      0,
      options.width / options.scale,
      options.height / options.scale,
    );
  }

  // Create rough canvas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rc = (rough as any).canvas(canvas) as RoughCanvas;

  // Calculate offset to translate elements to canvas coordinates
  const offsetX = -options.bounds.minX;
  const offsetY = -options.bounds.minY;

  // Preload images into cache
  const imageCache = new Map<string, Image>();
  for (const [fileId, fileData] of Object.entries(options.files)) {
    try {
      const img = await loadImage(fileData.dataURL);
      imageCache.set(fileId, img);
    } catch (err) {
      console.warn(`Failed to load image ${fileId}:`, err);
    }
  }

  // Build element map for text label masking
  const elementsById = new Map<string, ExcalidrawElement>();
  for (const element of elements) {
    elementsById.set(element.id, element);
  }

  // Render elements (no frame clipping for diff export)
  for (const element of elements) {
    renderElement(
      rc,
      ctx,
      element,
      offsetX,
      offsetY,
      options.ct,
      imageCache,
      options.darkMode,
      options.backgroundColor,
      elementsById,
    );
  }

  // Call afterRender callback if provided (e.g., for diff tags)
  if (options.afterRender) {
    options.afterRender(ctx, offsetX, offsetY);
  }

  return canvas;
}

/**
 * Export pre-styled elements to PNG or PDF.
 * Used by diff export to render elements with custom styling.
 */
export async function exportToPngWithElements(
  elements: ExcalidrawElement[],
  options: RenderOptions,
): Promise<void> {
  const format = options.format || "png";

  if (format === "pdf") {
    // PDF requires special canvas backend
    registerFonts();

    const pdfCanvas = createCanvas(options.width, options.height, "pdf");
    const ctx = pdfCanvas.getContext("2d");
    (ctx as any).textDrawingMode = "glyph";

    ctx.scale(options.scale, options.scale);

    if (options.backgroundColor !== "transparent") {
      ctx.fillStyle = options.backgroundColor;
      ctx.fillRect(
        0,
        0,
        options.width / options.scale,
        options.height / options.scale,
      );
    }

    const rc = (rough as any).canvas(pdfCanvas) as RoughCanvas;
    const offsetX = -options.bounds.minX;
    const offsetY = -options.bounds.minY;

    const imageCache = new Map<string, Image>();
    for (const [fileId, fileData] of Object.entries(options.files)) {
      try {
        const img = await loadImage(fileData.dataURL);
        imageCache.set(fileId, img);
      } catch (err) {
        console.warn(`Failed to load image ${fileId}:`, err);
      }
    }

    const elementsById = new Map<string, ExcalidrawElement>();
    for (const element of elements) {
      elementsById.set(element.id, element);
    }

    for (const element of elements) {
      renderElement(
        rc,
        ctx,
        element,
        offsetX,
        offsetY,
        options.ct,
        imageCache,
        options.darkMode,
        options.backgroundColor,
        elementsById,
      );
    }

    if (options.afterRender) {
      options.afterRender(ctx, offsetX, offsetY);
    }

    if (options.outputPath === "-") {
      process.stdout.write(pdfCanvas.toBuffer("application/pdf"));
    } else {
      writeFileSync(options.outputPath, pdfCanvas.toBuffer("application/pdf"));
    }
    return;
  }

  // PNG path: render to canvas then write file
  const canvas = await renderElementsToCanvas(elements, options);

  if (options.outputPath === "-") {
    // Write PNG to stdout
    return new Promise((resolve, reject) => {
      const stream = canvas.createPNGStream();
      stream.pipe(process.stdout);
      stream.on("end", resolve);
      stream.on("error", reject);
    });
  }

  return new Promise((resolve, reject) => {
    const out = createWriteStream(options.outputPath);
    const stream = canvas.createPNGStream();

    stream.pipe(out);
    out.on("finish", resolve);
    out.on("error", reject);
  });
}
