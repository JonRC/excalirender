# PDF Export

Export `.excalidraw` files to PDF with vector graphics and selectable text. Uses the same rendering pipeline as PNG export, backed by Cairo's PDF surface via node-canvas.

## Usage

```bash
# Export to PDF (format detected from extension)
excalirender diagram.excalidraw -o output.pdf

# With scale factor
excalirender diagram.excalidraw -o output.pdf --scale 2

# Dark mode
excalirender diagram.excalidraw -o output.pdf --dark

# Transparent background
excalirender diagram.excalidraw -o output.pdf --transparent

# Export specific frame
excalirender diagram.excalidraw -o output.pdf --frame "My Frame"

# Diff to PDF
excalirender diff old.excalidraw new.excalidraw -o diff.pdf

# Diff to PDF with options
excalirender diff old.excalidraw new.excalidraw -o diff.pdf --dark --hide-unchanged

# Recursive directory conversion to PDF
excalirender -r ./diagrams -o ./output/diagram.pdf
```

All existing CLI options (`--scale`, `--dark`, `--transparent`, `--frame`, `--background`) work with PDF output.

## How It Works

### Approach

PDF export reuses the existing PNG rendering pipeline by swapping the canvas backend. Instead of creating a standard raster canvas, it creates a Cairo PDF surface canvas:

```
PNG:  createCanvas(width, height)        → raster bitmap
PDF:  createCanvas(width, height, 'pdf') → Cairo PDF surface
```

This means every shape, path, and text element rendered via the Canvas 2D API is captured as native PDF vector primitives — not rasterized pixels.

### No New Dependencies

The PDF backend is built into `node-canvas` (which wraps Cairo). Since the project already depends on node-canvas for PNG rendering, PDF export adds zero new dependencies.

## Implementation Details

### File Structure

```
src/export.ts     # exportToPng() and exportToPngWithElements() — format parameter selects PNG or PDF
src/index.ts      # Routes .pdf extension to exportToPng(input, options, 'pdf')
src/diff.ts       # exportDiffToPng() passes format to exportToPngWithElements()
src/cli.ts        # CLI help text mentions PDF as supported format
```

### Canvas Creation

Both `exportToPng()` and `exportToPngWithElements()` accept a `format` parameter:

```typescript
export async function exportToPng(
  inputPath: string,
  options: ExportOptions,
  content?: string,
  format: "png" | "pdf" = "png",
): Promise<void> {
  const canvas =
    format === "pdf"
      ? createCanvas(width, height, "pdf")
      : createCanvas(width, height);
```

### Selectable Text

By default, Cairo's PDF surface converts text to vector outlines — visually correct but not selectable. Setting `textDrawingMode` to `'glyph'` changes this behavior:

```typescript
if (format === "pdf") {
  (ctx as any).textDrawingMode = "glyph";
}
```

With `'glyph'` mode, font subsets are embedded in the PDF and text becomes selectable and searchable in PDF viewers.

### PDF Output

PDF uses synchronous buffer output (simpler than PNG's stream-based approach). Supports both file and stdout output:

```typescript
if (format === "pdf") {
  if (options.outputPath === "-") {
    process.stdout.write(canvas.toBuffer("application/pdf"));
  } else {
    writeFileSync(options.outputPath, canvas.toBuffer("application/pdf"));
  }
  return;
}
// PNG continues with stream-based output...
```

### Format Routing

`src/index.ts` detects the `.pdf` extension and passes the format parameter:

```typescript
if (options.outputPath.endsWith(".svg")) {
  await exportToSvg(inputFile, options);
} else if (options.outputPath.endsWith(".pdf")) {
  await exportToPng(inputFile, options, undefined, "pdf");
} else {
  await exportToPng(inputFile, options);
}
```

The same routing applies to diff export and recursive directory conversion.

### RenderOptions Interface

The `RenderOptions` interface (used by `exportToPngWithElements()` for diff export) extends `RenderToCanvasOptions` and adds an optional `format` field:

```typescript
export interface RenderToCanvasOptions {
  scale: number;
  bounds: Bounds;
  width: number;
  height: number;
  backgroundColor: string;
  ct: ColorTransform;
  darkMode: boolean;
  files: Record<string, { dataURL: string }>;
  afterRender?: (ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number) => void;
}

export interface RenderOptions extends RenderToCanvasOptions {
  outputPath: string;
  format?: "png" | "pdf";
}
```

## Vector vs Raster Content

Cairo's PDF surface preserves most rendering as vector primitives:

| Content | PDF Representation |
|---------|-------------------|
| Shapes (rectangle, diamond, ellipse) | Vector paths via Rough.js |
| Lines and arrows | Vector paths |
| Freedraw strokes | Vector paths via perfect-freehand |
| Text | Embedded font subsets (selectable) |
| Opacity, rotation | Native PDF attributes |
| Images | Rasterized at target size (expected) |

PDF files are typically 3-7x smaller than equivalent PNG exports for shape-heavy diagrams, since vector paths are more compact than pixel data.

## Limitations

- **Images are rasterized**: `drawImage()` on a PDF canvas produces a bitmap in the PDF. This is expected behavior — embedded images in `.excalidraw` files are already raster data (base64 PNGs/JPEGs).
- **No PDF metadata**: Title, author, and other PDF metadata fields are not set. Cairo supports this via `toBuffer('application/pdf', { title, creator })` if needed in the future.
- **Synchronous output**: `canvas.toBuffer()` loads the entire PDF into memory before writing. For typical diagram sizes this is negligible. Streaming via `canvas.createPDFStream()` is available if needed for very large files.
- **globalCompositeOperation**: Certain composite operations may trigger Cairo's rasterization fallback, converting affected regions to bitmaps within the PDF. Standard Excalidraw diagrams do not use problematic composite operations.
