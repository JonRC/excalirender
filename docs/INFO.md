# Info Command

Display metadata about an `.excalidraw` file without rendering it.

## Overview

The `excalirender info` command inspects `.excalidraw` files and reports metadata: element counts by type, canvas dimensions, fonts used, color palette, frames, and embedded files. It performs pure JSON analysis with no canvas or Cairo dependency, making it fast and lightweight.

Two output modes are supported:
- **Text** (default): human-readable summary with conditional sections
- **JSON** (`--json`): machine-readable `FileInfo` object for scripting and automation

Stdin is supported via `-` as the input path.

## Usage

```bash
# Human-readable output
excalirender info diagram.excalidraw

# JSON output (for scripting)
excalirender info diagram.excalidraw --json

# Read from stdin
cat diagram.excalidraw | excalirender info -
```

### Options Reference

| Option | Description | Default |
|--------|-------------|---------|
| `--json` | Output metadata as JSON | `false` |

## Sample Output

```
File: diagram.excalidraw
Size: 3.9 KB
Version: 2
Source: https://excalidraw.com

Elements: 8
  rectangle: 3
  frame: 2
  ellipse: 1
  text: 1
  diamond: 1

Canvas: 570 x 371 px
Background: #ffffff

Fonts:
  Excalifont

Colors:
  Stroke: #1971c2, #1e1e1e, #2f9e44
  Fill: #a5d8ff, #b2f2bb, #ffc9c9

Frames:
  My Frame, frame-2
```

Sections like Fonts, Colors, Frames, and Embedded files are only shown when the file contains relevant data.

## Architecture

### File Structure

```
src/info.ts       # Info command implementation (no canvas dependency)
src/cli.ts        # CLI wiring (InfoCLIArgs, buildInfoArgs, commander subcommand)
src/index.ts      # Routing (args.command === "info" → runInfo)
```

### Data Flow

```
CLI input → parseArgs() → runInfo(filePath, options, content?)
                              ├── Read file (or use stdin content)
                              ├── JSON.parse + validate type === "excalidraw"
                              ├── collectInfo(data, filePath, fileSize) → FileInfo
                              └── Output: formatText(info) or JSON.stringify(info)
```

### Key Functions

| Function | Location | Description |
|----------|----------|-------------|
| `runInfo(filePath, options, content?)` | info.ts:205 | Entry point: reads file, validates, collects info, outputs |
| `collectInfo(data, filePath, fileSize)` | info.ts:35 | Gathers all metadata into `FileInfo` |
| `formatText(info)` | info.ts:147 | Formats `FileInfo` as human-readable text |
| `formatSize(bytes)` | info.ts:141 | Formats bytes as B/KB/MB |
| `buildInfoArgs(input, opts)` | cli.ts:103 | Builds `InfoCLIArgs` from commander options |

### Dependencies from shared.ts

| Import | Usage |
|--------|-------|
| `getElementBounds(element)` | Computes bounding box per element for canvas dimensions |
| `FONT_FAMILY` | Maps numeric font IDs to font names (e.g., `5` → `"Excalifont"`) |

## FileInfo Interface

The `FileInfo` interface (info.ts:9-33) defines all collected metadata:

```typescript
interface FileInfo {
  file: string;             // File path or "stdin"
  size: number | null;      // File size in bytes (null for stdin)
  version: number;          // Excalidraw file format version
  source: string;           // Source application URL
  elements: {
    total: number;          // Count of active (non-deleted) elements
    byType: Record<string, number>;  // Count per element type
  };
  canvas: {
    width: number;          // Bounding box width in pixels
    height: number;         // Bounding box height in pixels
  };
  background: string;       // View background color from appState
  fonts: string[];          // Font names used by text elements
  colors: {
    stroke: string[];       // Unique stroke colors (sorted)
    fill: string[];         // Unique fill/background colors (sorted)
  };
  frames: string[];         // Frame names (or IDs if unnamed)
  embeddedFiles: {
    total: number;          // Total embedded file count
    byMimeType: Record<string, { count: number; size: number }>;
  };
}
```

## Metadata Collection

### Element Counting

Filters out deleted elements (`isDeleted === true`), then groups active elements by `type`. Element types are sorted by count descending in text output.

### Canvas Dimensions

Iterates all active elements, calls `getElementBounds()` (from shared.ts) for each, and computes the overall bounding box. Returns `0 x 0` for empty files.

```
canvas.width  = Math.round(maxX - minX)
canvas.height = Math.round(maxY - minY)
```

### Font Detection

Scans text elements for their `fontFamily` numeric ID and maps each to a human-readable name via the `FONT_FAMILY` lookup table in shared.ts:

| ID | Font Name |
|----|-----------|
| 1 | Virgil |
| 2 | Helvetica |
| 3 | Cascadia |
| 5 | Excalifont |
| 6 | Nunito |
| 7 | Lilita One |
| 8 | Comic Shanns |
| 9 | Liberation Sans |

Unknown IDs are displayed as `Unknown (<id>)`.

### Color Palette

Collects unique `strokeColor` and `backgroundColor` values from all active elements, excluding `"transparent"`. Colors are sorted alphabetically.

### Frame Listing

Finds elements with type `frame` or `magicframe`. Uses the element's `name` property if set, otherwise falls back to the element `id`.

### Embedded Files

Iterates `data.files` (the Excalidraw file's embedded binary data), groups by MIME type, and estimates decoded file sizes from base64 length:

```
decodedSize ≈ base64Length * 0.75
```

This is an approximation — actual decoded size may differ slightly due to padding.

## Text Output Format

The text output is structured in sections, some of which are conditional:

| Section | Condition | Example |
|---------|-----------|---------|
| File, Size, Version, Source | Always shown | `File: diagram.excalidraw` |
| Elements + breakdown | Always shown | `Elements: 8` + per-type counts |
| Canvas, Background | Always shown | `Canvas: 570 x 371 px` |
| Fonts | Only if text elements exist | `Fonts:` + font list |
| Colors | Only if non-transparent colors exist | `Colors:` + Stroke/Fill lists |
| Frames | Only if frame elements exist | `Frames:` + comma-separated names |
| Embedded files | Only if files are embedded | `Embedded files: 2` + MIME breakdown |

Size formatting uses `formatSize()`: bytes < 1024 → `B`, < 1MB → `KB`, otherwise `MB`.

## Design Decisions

- **No canvas dependency**: The info command performs pure JSON analysis. It doesn't import `canvas` or any rendering library, enabling fast metadata inspection even without Cairo system libraries installed.
- **Deleted elements excluded**: Consistent with export behavior — only active elements are counted and analyzed.
- **Base64 size estimation**: Uses `b64.length * 0.75` to approximate decoded binary size. This avoids decoding potentially large embedded images just to measure them.
- **Stdin support**: The `content` parameter on `runInfo()` allows passing pre-read content, avoiding double file I/O when the caller (index.ts) has already read stdin.
- **Conditional sections**: Sections like Fonts, Colors, Frames, and Embedded files are omitted from text output when empty, keeping the output concise for simple files.
