# excalirender

CLI tool that converts [Excalidraw](https://excalidraw.com) `.excalidraw` files to PNG and SVG images. Runs as a standalone binary compiled with [Bun](https://bun.sh), available as a Docker image or a self-contained native Linux binary.

## Quick Start

### Native Linux Binary

Install with a single command — no Docker or system libraries required:

```bash
# Using curl
curl -fsSL https://raw.githubusercontent.com/JonRC/excalirender/main/install.sh | sh

# Using wget
wget -qO- https://raw.githubusercontent.com/JonRC/excalirender/main/install.sh | sh
```

Then run:

```bash
excalirender diagram.excalidraw
```

The install script downloads the self-contained tarball from [GitHub Releases](https://github.com/JonRC/excalirender/releases), which bundles all shared libraries (Cairo, Pango, etc.). Works on any Linux x64 system (Ubuntu 20.04+, Debian 11+, Fedora, etc.) with no additional dependencies.

To install a specific version or customize the install location:

```bash
VERSION=v1.0.0 sh install.sh          # specific version
PREFIX=/opt sh install.sh              # custom prefix
```

See [docs/LINUX-INSTALLATION.md](docs/LINUX-INSTALLATION.md) for full details on install locations, uninstall, and how the script works.

### Docker

```bash
docker run --rm -v "$(pwd):/data" -w /data jonarc06/excalirender diagram.excalidraw
```

This converts `diagram.excalidraw` to `diagram.png` in the current directory.

## Usage

```
excalirender <input> [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <path>` | Output PNG file path | `<input>.png` |
| `-s, --scale <number>` | Export scale factor | `1` |
| `-b, --background <color>` | Background color (hex) | From file or `#ffffff` |
| `-d, --dark` | Enable dark mode export | `false` |

### Examples

```bash
# Basic conversion
docker run --rm -v "$(pwd):/data" -w /data jonarc06/excalirender drawing.excalidraw

# Custom output path
docker run --rm -v "$(pwd):/data" -w /data jonarc06/excalirender drawing.excalidraw -o output.png

# 2x resolution
docker run --rm -v "$(pwd):/data" -w /data jonarc06/excalirender drawing.excalidraw -s 2

# Dark mode
docker run --rm -v "$(pwd):/data" -w /data jonarc06/excalirender drawing.excalidraw --dark

# Custom background color
docker run --rm -v "$(pwd):/data" -w /data jonarc06/excalirender drawing.excalidraw -b "#f0f0f0"
```

## Supported Elements

| Element | Status | Notes |
|---------|--------|-------|
| Rectangle | Supported | Including rounded corners |
| Diamond | Supported | |
| Ellipse | Supported | |
| Line | Supported | Single segment and multi-point curves |
| Arrow | Supported | With start/end arrowheads |
| Freedraw | Supported | Pressure-sensitive strokes, closed-path fill |
| Text | Supported | Multi-line, 7 font families, alignment |
| Image | Supported | PNG/JPEG/SVG with rounded corners, dark mode inversion |
| Frame | Supported | Clipping, labels, rotation |
| Embeddable | Supported | Rendered as placeholder with URL |

### Rendering Features

- **Fill styles**: hachure, cross-hatch, solid, zigzag (via Rough.js)
- **Stroke styles**: solid, dashed, dotted
- **Opacity**: per-element
- **Rotation**: full rotation support
- **Dark mode**: color inversion matching Excalidraw's algorithm, including image pixel transformation
- **Fonts**: Excalifont, Nunito, Comic Shanns, Liberation Sans, Lilita One, Virgil, Cascadia — with Cyrillic, Greek, and Latin Extended unicode support
- **Output formats**: PNG and SVG (with embedded fonts)

## Building from Source

Requires [Bun](https://bun.sh) and system libraries for [node-canvas](https://github.com/Automattic/node-canvas) (Cairo, Pango, etc.).

```bash
# Install dependencies
bun install

# Build standalone binary (Linux x64) — requires system Cairo/Pango
bun run build

# Build Docker image and extract binary
bun run docker:build

# Build self-contained native tarball (no system libs needed at runtime)
bun run build:native
# Output: dist/excalirender-linux-x64.tar.gz
```

See [docs/BUILD.md](docs/BUILD.md) for details on the Docker build, native bundle, and system dependencies.

## Development

```bash
bun run start -- <file.excalidraw>   # Run from source
bun run typecheck                     # TypeScript check
```

## How It Works

The rendering pipeline reads `.excalidraw` JSON files and draws elements to a server-side canvas using the same libraries Excalidraw uses:

- [Rough.js](https://roughjs.com/) for hand-drawn shapes
- [perfect-freehand](https://github.com/steveruizok/perfect-freehand) for pressure-sensitive strokes
- [node-canvas](https://github.com/Automattic/node-canvas) for server-side rendering

See [docs/CONVERSION.md](docs/CONVERSION.md) for the full rendering pipeline documentation.

## License

MIT
