# Docker Hub Repository Description

This file contains the description for the Docker Hub repository [jonarc06/excalirender](https://hub.docker.com/r/jonarc06/excalirender).

**Short description:** Convert Excalidraw files to PNG/SVG — server-side rendering, no browser needed

**Full description (copy everything below the line):**

---

# excalirender

CLI tool that converts [Excalidraw](https://excalidraw.com) `.excalidraw` files to **PNG** and **SVG** images. Server-side rendering with no browser required.

## Quick Start

```bash
docker run --rm -v "$(pwd):/data" -w /data jonarc06/excalirender diagram.excalidraw
```

This converts `diagram.excalidraw` to `diagram.png` in the current directory.

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <path>` | Output file path | `<input>.png` |
| `-s, --scale <number>` | Export scale factor | `1` |
| `-b, --background <color>` | Background color (hex) | From file or `#ffffff` |
| `-d, --dark` | Enable dark mode export | `false` |

## Examples

```bash
# Basic conversion
docker run --rm -v "$(pwd):/data" -w /data jonarc06/excalirender drawing.excalidraw

# Custom output path
docker run --rm -v "$(pwd):/data" -w /data jonarc06/excalirender drawing.excalidraw -o output.png

# SVG output
docker run --rm -v "$(pwd):/data" -w /data jonarc06/excalirender drawing.excalidraw -o output.svg

# 2x resolution
docker run --rm -v "$(pwd):/data" -w /data jonarc06/excalirender drawing.excalidraw -s 2

# Dark mode
docker run --rm -v "$(pwd):/data" -w /data jonarc06/excalirender drawing.excalidraw --dark

# Custom background color
docker run --rm -v "$(pwd):/data" -w /data jonarc06/excalirender drawing.excalidraw -b "#f0f0f0"
```

## Supported Elements

Rectangle, Diamond, Ellipse, Line, Arrow (with labels), Freedraw, Text, Image, Frame, Embeddable

### Features

- **Fill styles**: hachure, cross-hatch, solid, zigzag
- **Stroke styles**: solid, dashed, dotted
- **Fonts**: Excalifont, Nunito, Comic Shanns, Liberation Sans, Lilita One, Virgil, Cascadia — with Cyrillic, Greek, and Latin Extended unicode support
- **Dark mode**: full color inversion matching Excalidraw behavior
- **Output formats**: PNG and SVG (with embedded fonts)

## Native Binary

A standalone Linux binary (no Docker needed) is also available:

```bash
curl -fsSL https://raw.githubusercontent.com/JonRC/excalirender/main/install.sh | sh
```

## Source Code

[GitHub — JonRC/excalirender](https://github.com/JonRC/excalirender)
