import { existsSync, type FSWatcher, watch } from "node:fs";
import { basename } from "node:path";
import type { CanvasRenderingContext2D } from "canvas";
import { applyUnchangedStyle, computeDiff } from "./diff-core.js";
import {
  type DiffOptions,
  type DiffStatus,
  getElementBounds,
  TAG_COLORS,
} from "./diff-excalidraw.js";
import {
  type RenderToCanvasOptions,
  renderElementsToCanvas,
} from "./export.js";
import {
  applyDarkModeFilter,
  getCanvasBounds,
  identityColor,
  prepareExport,
} from "./shared.js";
import type { ExcalidrawElement, ExportOptions } from "./types.js";

interface WatchConfig {
  inputPaths: string[];
  mode: "export" | "diff";
  port: number;
  open: boolean;
  exportOptions: ExportOptions;
  diffOptions: DiffOptions;
}

/** Debounce interval for file watcher — handles editor save sequences (temp file → rename). */
const DEBOUNCE_MS = 200;

function renderDiffTag(
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawElement,
  status: DiffStatus,
  offsetX: number,
  offsetY: number,
): void {
  const colors = TAG_COLORS[status];
  const bounds = getElementBounds(element);
  const centerX = bounds.x + bounds.width / 2 + offsetX;
  const bottomY = bounds.y + bounds.height + offsetY + 4;

  ctx.font = "10px Liberation Sans, sans-serif";
  const textWidth = ctx.measureText(status).width;
  const padding = { x: 4, y: 2 };
  const tagWidth = textWidth + padding.x * 2;
  const tagHeight = 10 + padding.y * 2;

  ctx.fillStyle = colors.bg;
  ctx.beginPath();
  ctx.roundRect(centerX - tagWidth / 2, bottomY, tagWidth, tagHeight, 3);
  ctx.fill();

  ctx.fillStyle = colors.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(status, centerX, bottomY + tagHeight / 2);
}

async function renderExportToBuffer(
  inputPath: string,
  options: ExportOptions,
): Promise<Buffer> {
  const prepared = prepareExport(inputPath, options);
  const renderOptions: RenderToCanvasOptions = {
    scale: options.scale,
    bounds: prepared.bounds,
    width: prepared.width,
    height: prepared.height,
    backgroundColor: prepared.backgroundColor,
    ct: prepared.ct,
    darkMode: options.darkMode,
    files: prepared.data.files || {},
  };
  const canvas = await renderElementsToCanvas(
    prepared.sortedElements,
    renderOptions,
  );
  return canvas.toBuffer("image/png");
}

async function renderDiffToBuffer(
  oldPath: string,
  newPath: string,
  options: DiffOptions,
): Promise<Buffer> {
  const diff = computeDiff(oldPath, newPath);

  const styledUnchanged = options.hideUnchanged
    ? []
    : diff.unchanged.map((el) => applyUnchangedStyle(el));
  const modifiedElements = diff.modified.map(({ new: newEl }) => newEl);
  const allElements = [
    ...styledUnchanged,
    ...diff.removed,
    ...modifiedElements,
    ...diff.added,
  ];

  if (allElements.length === 0) {
    throw new Error("No elements found in either file");
  }

  interface TaggedElement {
    element: ExcalidrawElement;
    status: DiffStatus;
  }
  const taggedElements: TaggedElement[] = [];
  if (options.showTags) {
    for (const el of diff.removed) {
      taggedElements.push({ element: el, status: "removed" });
    }
    for (const { new: newEl } of diff.modified) {
      taggedElements.push({ element: newEl, status: "modified" });
    }
    for (const el of diff.added) {
      taggedElements.push({ element: el, status: "added" });
    }
  }

  const allOriginalElements = [
    ...diff.unchanged,
    ...diff.removed,
    ...diff.modified.map(({ new: newEl }) => newEl),
    ...diff.added,
  ];
  const tagPadding = options.showTags ? 24 : 20;
  const bounds = getCanvasBounds(allOriginalElements, tagPadding);
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
    afterRender: options.showTags
      ? (ctx, offsetX, offsetY) => {
          for (const { element, status } of taggedElements) {
            renderDiffTag(ctx, element, status, offsetX, offsetY);
          }
        }
      : undefined,
  };

  const canvas = await renderElementsToCanvas(allElements, renderOptions);
  return canvas.toBuffer("image/png");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtmlPage(title: string): string {
  const safe = escapeHtml(title);
  return `<!DOCTYPE html>
<html>
<head>
  <title>excalirender — ${safe}</title>
  <style>
    body { margin: 0; background: #1a1a1a; display: flex; flex-direction: column;
           align-items: center; justify-content: center; min-height: 100vh;
           font-family: system-ui; color: #999; }
    .header { padding: 12px; font-size: 13px; }
    .header .time { color: #666; }
    img { max-width: 95vw; max-height: 85vh; object-fit: contain;
          background: repeating-conic-gradient(#333 0% 25%, #2a2a2a 0% 50%)
          50% / 20px 20px; }
  </style>
</head>
<body>
  <div class="header">
    <span class="file">${safe}</span>
    <span class="time"></span>
  </div>
  <img src="/image" />
  <script>
    const img = document.querySelector('img');
    const timeEl = document.querySelector('.time');
    const evtSource = new EventSource('/events');
    evtSource.onmessage = (e) => {
      img.src = '/image?t=' + Date.now();
      timeEl.textContent = '— rendered ' + new Date().toLocaleTimeString();
    };
  </script>
</body>
</html>`;
}

function timestamp(): string {
  return new Date().toLocaleTimeString();
}

export async function startWatchServer(config: WatchConfig): Promise<void> {
  const { inputPaths, mode, port, open, exportOptions, diffOptions } = config;

  // Validate files exist
  for (const filePath of inputPaths) {
    if (!existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }
  }

  // Initial render
  let imageBuffer: Buffer;
  try {
    if (mode === "diff") {
      imageBuffer = await renderDiffToBuffer(
        inputPaths[0],
        inputPaths[1],
        diffOptions,
      );
    } else {
      imageBuffer = await renderExportToBuffer(inputPaths[0], exportOptions);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }

  // SSE clients
  const sseClients = new Set<ReadableStreamDefaultController>();

  function notifyClients() {
    const encoder = new TextEncoder();
    const data = encoder.encode("data: reload\n\n");
    for (const client of sseClients) {
      try {
        client.enqueue(data);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  // Build page title
  const title =
    mode === "diff"
      ? `${basename(inputPaths[0])} vs ${basename(inputPaths[1])}`
      : basename(inputPaths[0]);
  const htmlPage = buildHtmlPage(title);

  // Start HTTP server
  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/events") {
        let ctrl: ReadableStreamDefaultController;
        const stream = new ReadableStream({
          start(controller) {
            ctrl = controller;
            sseClients.add(controller);
          },
          cancel() {
            sseClients.delete(ctrl);
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      if (url.pathname === "/image") {
        return new Response(new Uint8Array(imageBuffer), {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "no-cache",
          },
        });
      }

      // Default: serve HTML page
      return new Response(htmlPage, {
        headers: { "Content-Type": "text/html" },
      });
    },
  });

  const serverUrl = `http://localhost:${server.port}`;

  // Log startup
  const fileNames = inputPaths.map((p) => basename(p)).join(", ");
  console.log(`Watching ${fileNames}`);
  console.log(`Preview at ${serverUrl}`);
  console.log("");

  // Open browser (cross-platform)
  if (open) {
    try {
      const openCmd =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "cmd"
            : "xdg-open";
      const openArgs =
        process.platform === "win32" ? ["/c", "start", serverUrl] : [serverUrl];
      const proc = Bun.spawn([openCmd, ...openArgs], {
        stdout: "ignore",
        stderr: "ignore",
      });
      proc.unref();
    } catch {
      // Browser open failed — user can manually navigate
    }
  }

  // File watcher with debounce
  let lastRender = 0;

  async function onFileChange() {
    const now = Date.now();
    if (now - lastRender < DEBOUNCE_MS) return;
    lastRender = now;

    const start = performance.now();
    try {
      if (mode === "diff") {
        imageBuffer = await renderDiffToBuffer(
          inputPaths[0],
          inputPaths[1],
          diffOptions,
        );
      } else {
        imageBuffer = await renderExportToBuffer(inputPaths[0], exportOptions);
      }
      const elapsed = Math.round(performance.now() - start);
      console.log(`[${timestamp()}] Rendered in ${elapsed}ms`);
      notifyClients();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}] Error: ${msg} — keeping last render`);
    }
  }

  const watchers: FSWatcher[] = [];
  for (const filePath of inputPaths) {
    watchers.push(watch(filePath, onFileChange));
  }

  // Keep process alive — Bun.serve already keeps it alive, but handle SIGINT
  process.on("SIGINT", () => {
    console.log("\nStopping watch server...");
    for (const w of watchers) w.close();
    server.stop();
    process.exit(0);
  });
}
