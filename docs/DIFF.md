# Diff Feature

Create visual diffs between two `.excalidraw` files, highlighting added, removed, and modified elements.

## Overview

The `excalirender diff` command compares two Excalidraw files and generates a visual diff output showing:
- **Added** elements (in new file only)
- **Removed** elements (in old file only)
- **Modified** elements (same ID, different properties)
- **Unchanged** elements (dimmed for context)

Output formats: PNG, SVG, PDF, GIF (animated), and Excalidraw (`.excalidraw`).

## Usage

```bash
# Basic usage (auto-generates output name: old_vs_new.png)
excalirender diff old.excalidraw new.excalidraw

# Custom output name
excalirender diff old.excalidraw new.excalidraw -o diff.png

# SVG output (format detected from extension)
excalirender diff old.excalidraw new.excalidraw -o diff.svg

# Excalidraw output (for further editing)
excalirender diff old.excalidraw new.excalidraw -o diff.excalidraw

# With scale factor
excalirender diff old.excalidraw new.excalidraw -o diff.png --scale 2

# Hide unchanged elements
excalirender diff old.excalidraw new.excalidraw --hide-unchanged

# Disable status tags
excalirender diff old.excalidraw new.excalidraw --no-tags

# Dark mode
excalirender diff old.excalidraw new.excalidraw --dark

# Transparent background
excalirender diff old.excalidraw new.excalidraw --transparent

# Animated GIF (alternates between old and new states)
excalirender diff old.excalidraw new.excalidraw -o diff.gif

# GIF with custom frame delay (2 seconds)
excalirender diff old.excalidraw new.excalidraw -o diff.gif --delay 2000
```

### Output Naming

When `-o` is not specified, the output filename is auto-generated:
```
<oldfile>_vs_<newfile>.png
```

Examples:
- `old.excalidraw` vs `new.excalidraw` → `old_vs_new.png`
- `diagrams/v1.excalidraw` vs `diagrams/v2.excalidraw` → `v1_vs_v2.png`

### Output Formats

Format is determined by file extension:

| Extension | Format | Description |
|-----------|--------|-------------|
| `.png` | PNG image | Default format |
| `.svg` | SVG image | Vector format |
| `.pdf` | PDF document | Vector format via Cairo |
| `.gif` | Animated GIF | Alternates between old and new states |
| `.excalidraw` | Excalidraw file | Editable in Excalidraw |

## Algorithm

### Element Matching Strategy

Elements are matched by their unique `id` field. Each Excalidraw element has a stable ID that persists across edits, making ID-based matching reliable for detecting changes.

### Categorization Logic

| Category | Condition |
|----------|-----------|
| **Added** | Element ID exists in new file but not in old file |
| **Removed** | Element ID exists in old file but not in new file |
| **Modified** | Element ID exists in both files but visual properties differ |
| **Unchanged** | Element ID exists in both files with identical visual properties |

### Modified Detection

The following properties are compared to detect modifications:

| Property | Description |
|----------|-------------|
| `x`, `y` | Position |
| `width`, `height` | Dimensions |
| `strokeColor` | Stroke/border color |
| `backgroundColor` | Fill color |
| `strokeWidth` | Line thickness |
| `opacity` | Transparency |
| `angle` | Rotation |
| `text` | Text content (for text elements) |
| `points` | Shape points (for lines, arrows, freedraw) |

**Ignored fields** (transient/non-visual): `seed`, `version`, `updated`, `versionNonce`

## Visual Representation

### Element Colors

Elements keep their **original colors** from the source files. Diff status is indicated by status tags only.

| Status | Appearance |
|--------|------------|
| Added | Original colors (from new file) |
| Modified | Original colors (new version shown) |
| Removed | Original colors (from old file) |
| Unchanged | Dimmed to 30% opacity |

### Status Tags

Each diff element displays a small status tag at its bottom center:

| Status | Background | Text Color |
|--------|------------|------------|
| `added` | `#a7f3d0` | `#065f46` |
| `modified` | `#d1d5db` | `#374151` |
| `removed` | `#fecaca` | `#991b1b` |

Tags can be disabled with `--no-tags`.

### Rendering Order

Elements are rendered in layers (bottom to top):
1. Unchanged elements (dimmed)
2. Removed elements
3. Modified elements
4. Added elements

This ensures added elements appear on top for visibility.

## Implementation Details

### File Structure

```
src/diff-core.ts       # Core algorithm (computeDiff, element comparison)
src/diff.ts            # Rendering (PNG/SVG export, tag rendering)
src/diff-gif.ts        # Animated GIF export (old/new state frames)
src/diff-excalidraw.ts # Excalidraw format export, DiffOptions interface
src/cli.ts             # CLI argument parsing for diff subcommand
```

### Key Functions

| Function | File | Description |
|----------|------|-------------|
| `computeDiff(oldPath, newPath)` | diff-core.ts | Returns categorized elements |
| `elementsAreEqual(a, b)` | diff-core.ts | Compares visual properties |
| `exportDiffToPng()` | diff.ts | Renders diff to PNG |
| `exportDiffToSvg()` | diff.ts | Renders diff to SVG |
| `exportDiffToGif()` | diff-gif.ts | Renders animated GIF (old/new frames) |
| `exportDiffToExcalidraw()` | diff-excalidraw.ts | Exports diff as Excalidraw file |
| `renderDiffTag()` | diff.ts | Renders PNG status tag |
| `createSvgTag()` | diff.ts | Generates SVG status tag |

### Data Structures

```typescript
interface DiffResult {
  added: ExcalidrawElement[];
  removed: ExcalidrawElement[];
  modified: Array<{ old: ExcalidrawElement; new: ExcalidrawElement }>;
  unchanged: ExcalidrawElement[];
}

interface DiffOptions {
  outputPath: string;
  scale: number;
  hideUnchanged: boolean;
  showTags: boolean;
  darkMode: boolean;
  transparent: boolean;
  gifDelay?: number;
}
```

## Options Reference

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <path>` | Output file path (.png, .svg, .pdf, .gif, or .excalidraw) | `<old>_vs_<new>.png` |
| `-s, --scale <number>` | Export scale factor | `1` |
| `-d, --dark` | Enable dark mode export | `false` |
| `--transparent` | Transparent background (no fill) | `false` |
| `--hide-unchanged` | Don't render unchanged elements | `false` |
| `--no-tags` | Don't render status tags | `false` |
| `--delay <ms>` | GIF frame delay in milliseconds | `1000` |
| `--format <type>` | Output format when using stdout (`-o -`): `png`, `svg` | `png` |

## Piping (stdin/stdout)

The diff command supports Unix-style piping for one of the two inputs and for the output.

**stdin input**: Use `-` as one of the input paths to read `.excalidraw` JSON from stdin (only one input can be stdin):
```bash
cat old.excalidraw | excalirender diff - new.excalidraw -o diff.png
cat new.excalidraw | excalirender diff old.excalidraw - -o diff.svg
```

**stdout output**: Use `-o -` to write the diff image to stdout:
```bash
excalirender diff old.excalidraw new.excalidraw -o - > diff.png
excalirender diff old.excalidraw new.excalidraw -o - --format svg > diff.svg
```

**Combined**: Pipe stdin and stdout together:
```bash
cat new.excalidraw | excalirender diff old.excalidraw - -o - --format svg | other-tool
```

## Animated GIF Output

The `.gif` format produces an animated GIF that alternates between the old and new states of the diagram, providing a visual "before/after" comparison.

### How It Works

- **Frame 1**: Shows the old state (unchanged + removed + old version of modified elements)
- **Frame 2**: Shows the new state (unchanged + added + new version of modified elements)
- The GIF loops infinitely, alternating between frames at the configured delay

The `--delay` option controls the time (in milliseconds) each frame is displayed. Default is 1000ms (1 second).

### GIF-Specific Behavior

- `--no-tags` is ignored for GIF output (tags are not rendered since each frame shows a complete state, not a diff overlay)
- `--hide-unchanged` removes unchanged elements from both frames
- `--dark`, `--transparent`, and `--scale` apply to both frames

### Limitations

- **256-color palette**: GIF supports a maximum of 256 colors per frame. This is sufficient for typical Excalidraw diagrams (which use fewer than 20 colors), but complex diagrams with many colors may show slight quantization artifacts.
- **1-bit transparency**: GIF transparency is binary (fully transparent or fully opaque). The `--transparent` flag works, but elements with partial opacity may render differently compared to PNG output.
