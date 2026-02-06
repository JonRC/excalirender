# Combine Command

Combine multiple `.excalidraw` files into a single image, placed side by side or stacked vertically.

## Overview

The `excalirender combine` command renders each input file independently and composes the results onto a single output canvas. Each file keeps its native dimensions — panels are not resized to match each other.

Output formats: PNG and PDF.

## Usage

```bash
# Side by side (default horizontal layout)
excalirender combine a.excalidraw b.excalidraw

# Custom output path
excalirender combine a.excalidraw b.excalidraw -o comparison.png

# Vertical layout (stacked)
excalirender combine a.excalidraw b.excalidraw --layout vertical

# Show filename labels below each panel
excalirender combine a.excalidraw b.excalidraw --labels

# Custom gap, dark mode
excalirender combine a.excalidraw b.excalidraw --gap 60 --dark

# Three or more files
excalirender combine a.excalidraw b.excalidraw c.excalidraw --labels

# PDF output
excalirender combine a.excalidraw b.excalidraw -o output.pdf

# Scale 2x
excalirender combine a.excalidraw b.excalidraw --scale 2

# Write to stdout
excalirender combine a.excalidraw b.excalidraw -o - > output.png
```

## Options Reference

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <path>` | Output file path (.png or .pdf) | `combined.png` |
| `-l, --layout <type>` | Layout: `horizontal` or `vertical` | `horizontal` |
| `--gap <pixels>` | Gap between panels in pixels | `40` |
| `--labels` | Show filename labels below each panel | `false` |
| `-s, --scale <number>` | Export scale factor | `1` |
| `-d, --dark` | Enable dark mode export | `false` |
| `--transparent` | Transparent background (no fill) | `false` |
| `--format <type>` | Output format when using stdout (`-o -`) | `png` |

## Layout Calculation

### Horizontal (default)

Panels are placed left to right with a configurable gap between them.

- **Total width** = sum of all panel widths + gap × (panel count − 1)
- **Total height** = max panel height (including label height if enabled)

### Vertical

Panels are stacked top to bottom with a configurable gap between them.

- **Total width** = max panel width
- **Total height** = sum of all panel heights (including label height) + gap × (panel count − 1)

Gap and label height are scaled by the `--scale` factor to maintain proportions at higher resolutions.

## Labels

When `--labels` is enabled, each panel displays its filename (without the `.excalidraw` extension) centered below the panel.

- Font: 14px sans-serif (scaled by `--scale`)
- Color: `#333333` in light mode, `#cccccc` in dark mode
- Padding: 4px above the label text (scaled)

## Implementation Details

### File Structure

```
src/combine.ts  # Combine logic (exportCombined, CombineOptions)
src/cli.ts      # CLI argument parsing for combine subcommand
src/index.ts    # Combine routing and validation
```

### Key Functions

| Function | File | Description |
|----------|------|-------------|
| `exportCombined(inputPaths, options)` | combine.ts | Main entry point — renders and composes panels |
| `buildCombineArgs(files, opts)` | cli.ts | Builds CombineCLIArgs from CLI input |

### Data Structures

```typescript
interface CombineOptions {
  outputPath: string;
  layout: "horizontal" | "vertical";
  gap: number;
  labels: boolean;
  scale: number;
  darkMode: boolean;
  transparent: boolean;
}
```

### Rendering Pipeline

1. **Prepare each file**: `prepareExport()` from `shared.ts` parses the `.excalidraw` JSON, filters deleted elements, calculates bounds, and determines background color
2. **Render to canvas**: `renderElementsToCanvas()` from `export.ts` draws each file onto its own canvas using Rough.js and node-canvas
3. **Calculate master dimensions**: Based on layout, gap, and label height
4. **Compose**: Create a master canvas and draw each panel at its calculated (x, y) offset using `ctx.drawImage()`
5. **Labels**: If enabled, render filename text centered below each panel
6. **Write output**: PNG via stream or PDF via Cairo PDF backend

For PDF output, each panel canvas is converted to a PNG buffer, loaded as an image, and drawn onto a PDF canvas. This avoids issues with cross-backend canvas drawing.

## Limitations

- **PNG and PDF only**: SVG output is not supported (would require complex nested SVG documents). GIF and `.excalidraw` formats are also not supported.
- **No stdin**: All input files must be file paths. Stdin (`-`) is not supported since combine requires multiple inputs.
- **No resizing**: Each panel keeps its native dimensions. Panels with very different sizes may produce uneven layouts.
