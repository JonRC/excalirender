# excalirender

CLI tool that converts [Excalidraw](https://excalidraw.com) `.excalidraw` files to PNG, SVG, and PDF. Runs as a standalone binary compiled with [Bun](https://bun.sh), available as a Docker image or a self-contained native Linux binary.

## Get Started

### Docker (Linux, Mac, Windows)

Convert an Excalidraw file to PNG:

```bash
docker run --rm -v "$(pwd):/data" -w /data jonarc06/excalirender diagram.excalidraw
```

This creates `diagram.png` in the current directory.

### Native Linux Binary

Install with a single command — no Docker or system dependencies required:

```bash
curl -fsSL https://raw.githubusercontent.com/JonRC/excalirender/main/install.sh | sh
```

Then run:

```bash
excalirender diagram.excalidraw
```

The install script downloads a self-contained binary from [GitHub Releases](https://github.com/JonRC/excalirender/releases) that bundles all libraries. Works on any Linux x64 system. Run the install command again to update to the latest version.

See [docs/LINUX-INSTALLATION.md](docs/LINUX-INSTALLATION.md) for install options and uninstall instructions.

## Usage

```
excalirender <input> [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-r, --recursive` | Convert all .excalidraw files in directory | `false` |
| `-o, --output <path>` | Output file path (.png, .svg, or .pdf); format inferred from extension | `<input>.png` |
| `-s, --scale <number>` | Export scale factor | `1` |
| `-b, --background <color>` | Background color (hex) | From file or `#ffffff` |
| `-d, --dark` | Enable dark mode export | `false` |
| `--transparent` | Transparent background (no fill) | `false` |
| `--format <type>` | Output format when using stdout (`-o -`): `png`, `svg` | `png` |

### Examples

```bash
excalirender drawing.excalidraw -o output.png      # Custom output path
excalirender drawing.excalidraw -s 2               # 2x resolution
excalirender drawing.excalidraw --dark             # Dark mode
excalirender drawing.excalidraw -b "#f0f0f0"       # Custom background
excalirender drawing.excalidraw --transparent       # Transparent background
excalirender drawing.excalidraw -o out.svg         # SVG output
excalirender drawing.excalidraw -o out.pdf         # PDF output (vector)
```

### Recursive Conversion

Convert all `.excalidraw` files in a directory and its subdirectories:

```bash
excalirender -r ./diagrams              # Output alongside input files
excalirender -r ./diagrams -o ./output  # Output to specific directory
excalirender -r ./diagrams --dark -s 2  # With options
```

For Docker, prefix commands with `docker run --rm -v "$(pwd):/data" -w /data jonarc06/excalirender`.

### Piping (stdin/stdout)

Use `-` as input to read from stdin, and `-o -` to write to stdout. This enables composability with other CLI tools.

```bash
# Read from stdin
cat diagram.excalidraw | excalirender - -o output.png
excalirender - -o output.svg < diagram.excalidraw

# Write to stdout
excalirender diagram.excalidraw -o - > output.png
excalirender diagram.excalidraw -o - --format svg > output.svg

# Full pipe (stdin + stdout)
cat diagram.excalidraw | excalirender - -o - > output.png
cat diagram.excalidraw | excalirender - -o - --format svg | other-tool

# Diff with stdin (one file only)
cat old.excalidraw | excalirender diff - new.excalidraw -o diff.png
excalirender diff old.excalidraw - -o - < new.excalidraw > diff.png
```

When writing to stdout (`-o -`), use `--format` to specify the output format (`png` or `svg`). Defaults to `png`. Status messages are redirected to stderr so they don't corrupt the binary output.

### Diff Command

Compare two Excalidraw files and generate a visual diff highlighting added, removed, and modified elements:

```bash
excalirender diff old.excalidraw new.excalidraw
```

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <path>` | Output file (.png, .svg, .pdf, or .excalidraw) | `<old>_vs_<new>.png` |
| `-s, --scale <number>` | Export scale factor | `1` |
| `-d, --dark` | Enable dark mode export | `false` |
| `--transparent` | Transparent background (no fill) | `false` |
| `--hide-unchanged` | Don't render unchanged elements | `false` |
| `--no-tags` | Don't render status tags | `false` |
| `--format <type>` | Output format when using stdout (`-o -`): `png`, `svg` | `png` |

Examples:

```bash
excalirender diff v1.excalidraw v2.excalidraw                # Creates v1_vs_v2.png
excalirender diff old.excalidraw new.excalidraw -o diff.svg  # SVG output
excalirender diff old.excalidraw new.excalidraw -o diff.pdf  # PDF output
excalirender diff old.excalidraw new.excalidraw --dark       # Dark mode
excalirender diff old.excalidraw new.excalidraw --transparent    # Transparent background
excalirender diff old.excalidraw new.excalidraw --hide-unchanged
```

See [docs/DIFF.md](docs/DIFF.md) for algorithm details and visual output documentation.

### Info Command

Display metadata about an `.excalidraw` file without rendering. Shows element counts by type, canvas dimensions, fonts, color palette, frames, and embedded files.

```bash
excalirender info diagram.excalidraw              # Human-readable output
excalirender info diagram.excalidraw --json        # JSON output
cat diagram.excalidraw | excalirender info -       # Read from stdin
```

| Flag | Description | Default |
|------|-------------|---------|
| `--json` | Output metadata as JSON | `false` |

## How It Works

The rendering pipeline reads `.excalidraw` JSON files and draws elements to a server-side canvas using the same libraries Excalidraw uses:

- [Rough.js](https://roughjs.com/) for hand-drawn shapes
- [perfect-freehand](https://github.com/steveruizok/perfect-freehand) for pressure-sensitive strokes
- [node-canvas](https://github.com/Automattic/node-canvas) for server-side rendering

See [docs/CONVERSION.md](docs/CONVERSION.md) for the full rendering pipeline documentation.

## License

MIT
