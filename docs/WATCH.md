# Watch Command

Live browser preview for `.excalidraw` files with auto-refresh on file changes.

## Overview

`excalirender watch` starts a local HTTP server that renders `.excalidraw` files to PNG and serves them in a browser. When the source file is saved, the preview refreshes automatically via Server-Sent Events (SSE).

**Mode detection** is based on file count:
- 1 file argument: **export mode** — renders single file as PNG
- 2 file arguments: **diff mode** — renders visual diff between files

No new dependencies — uses `Bun.serve()` for HTTP, `fs.watch()` for file changes, and native `ReadableStream` for SSE.

## Architecture

```
┌──────────────┐     fs.watch()     ┌─────────────────┐
│  .excalidraw │  ───────────────>  │  Watch Server   │
│    file(s)   │    file change     │  (Bun.serve)    │
└──────────────┘                    └────────┬────────┘
                                             │
                              ┌──────────────┼──────────────┐
                              │              │              │
                         GET /          GET /image     GET /events
                         HTML page      PNG buffer     SSE stream
                              │              │              │
                              └──────────────┼──────────────┘
                                             │
                                      ┌──────▼──────┐
                                      │   Browser   │
                                      │  <img> tag  │
                                      └─────────────┘
```

### HTTP Routes

| Route | Content-Type | Description |
|-------|-------------|-------------|
| `GET /` | `text/html` | HTML page with `<img>` and SSE listener |
| `GET /image` | `image/png` | Current rendered PNG buffer |
| `GET /events` | `text/event-stream` | SSE stream, pushes `data: reload\n\n` on changes |

### SSE Live Reload

The server maintains a `Set<ReadableStreamDefaultController>` of connected SSE clients. When a file change triggers a re-render, `notifyClients()` enqueues `"data: reload\n\n"` to all controllers. The browser's `EventSource` listener updates the `<img>` src with a cache-busting timestamp.

```typescript
const sseClients = new Set<ReadableStreamDefaultController>();

function notifyClients() {
  const data = new TextEncoder().encode("data: reload\n\n");
  for (const client of sseClients) {
    try { client.enqueue(data); }
    catch { sseClients.delete(client); }
  }
}
```

### File Watching

Uses `node:fs` `watch()` with a 200ms debounce to handle rapid editor saves (editors often write to temp file then rename):

```typescript
const DEBOUNCE_MS = 200;
let lastRender = 0;

for (const filePath of inputPaths) {
  watch(filePath, async () => {
    if (Date.now() - lastRender < DEBOUNCE_MS) return;
    lastRender = Date.now();
    // Re-render and notify SSE clients
  });
}
```

## Rendering Pipeline

### Export Mode

Reuses the standard export pipeline:

1. `prepareExport(inputPath, options)` — reads file, sorts elements, computes bounds
2. `renderElementsToCanvas(elements, renderOptions)` — draws to canvas
3. `canvas.toBuffer("image/png")` — produces PNG buffer

### Diff Mode

Reuses the diff algorithm with inline tag rendering:

1. `computeDiff(oldPath, newPath)` — computes added/removed/modified/unchanged
2. Style unchanged elements with `applyUnchangedStyle()`
3. `renderElementsToCanvas(allElements, renderOptions)` — draws to canvas with `afterRender` callback for diff tags
4. `canvas.toBuffer("image/png")` — produces PNG buffer

Diff tags are rendered inline via `renderDiffTag()` which draws colored labels (added/removed/modified) below each changed element.

## HTML Preview Page

The served HTML page has:
- Dark background (`#1a1a1a`) for comfortable viewing
- Checkerboard pattern behind the image (visible with `--transparent`)
- File name header with last render timestamp
- `EventSource` listening on `/events` for live reload

## Error Recovery

Parse errors during re-render are caught and logged to the terminal. The last successfully rendered PNG is preserved — the browser continues showing the previous valid render. When the file is fixed and saved again, the preview updates normally.

```
[12:34:56] Rendered in 120ms
[12:35:02] Error: Failed to parse diagram.excalidraw — keeping last render
[12:35:10] Rendered in 95ms
```

## Key Design Decisions

1. **SSE over WebSocket**: One-way server-to-browser push is all that's needed. SSE is simpler and sufficient.
2. **PNG only**: The preview always renders PNG (not SVG/PDF) for consistent browser display and fast rendering.
3. **Dynamic import**: `watch.ts` is loaded via `await import("./watch.js")` so non-watch commands don't pay the import cost.
4. **Browser open**: Cross-platform via `Bun.spawn()` — uses `open` on macOS, `cmd /c start` on Windows, `xdg-open` on Linux. Child process is `unref()`'d so it doesn't block the server. Failures are silently ignored.
5. **Mode from file count**: Instead of a `--diff` flag, the mode is auto-detected from the number of arguments (1 = export, 2 = diff).

## File Structure

| File | Role |
|------|------|
| `src/watch.ts` | Watch server: rendering, HTTP, SSE, file watcher |
| `src/cli.ts` | `WatchCLIArgs` interface, `buildWatchArgs()`, watch subcommand |
| `src/index.ts` | Watch routing with validation |

### Key Functions

- `startWatchServer(config)` — entry point, validates files, initial render, starts server + watchers
- `renderExportToBuffer(inputPath, options)` — renders single file to PNG buffer
- `renderDiffToBuffer(oldPath, newPath, options)` — renders visual diff to PNG buffer
- `renderDiffTag(ctx, element, status, offsetX, offsetY)` — draws colored status tag below element
- `buildHtmlPage(title)` — returns HTML string for the preview page

### WatchConfig Interface

```typescript
interface WatchConfig {
  inputPaths: string[];
  mode: "export" | "diff";
  port: number;
  open: boolean;
  exportOptions: ExportOptions;
  diffOptions: DiffOptions;
}
```

## Options Reference

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --port <number>` | HTTP server port | `3333` |
| `-s, --scale <number>` | Export scale factor | `1` |
| `-d, --dark` | Enable dark mode | `false` |
| `--transparent` | Transparent background | `false` |
| `-b, --background <color>` | Background color | From file |
| `-f, --frame <name>` | Export specific frame (export mode only) | - |
| `--no-open` | Don't auto-open browser | `false` |
| `--hide-unchanged` | Don't render unchanged elements (diff mode) | `false` |
| `--no-tags` | Don't render status tags (diff mode) | - |
