# Build Pipeline

Two distribution strategies exist, each with a different trade-off:

| | Docker image | Native tarball |
|---|---|---|
| **Build command** | `bun run docker:build` | `bun run build:native` |
| **Dockerfile** | `Dockerfile` (Alpine musl) | `Dockerfile.native` (Debian Bullseye glibc) |
| **Output** | Docker image | `dist/excalirender-linux-x64.tar.gz` |
| **Runtime deps** | None (container has everything) | None (shared libs bundled in tarball) |
| **Requires Docker** | Yes (to run) | No (only to build) |
| **Image/tarball size** | ~80 MB | ~45 MB |
| **Compatibility** | Any Docker host | Linux x64 with glibc 2.31+ |

## Local Build

```bash
bun run build
# Runs: bun build --compile --target=bun-linux-x64 ./src/index.ts --outfile excalirender
```

Produces a standalone ELF binary (`excalirender`) that bundles the Bun runtime, all application code, and embedded assets (fonts) into a single file. Requires system libraries (Cairo, Pango, etc.) to be present on the host.

### Why Bun Compile

`bun build --compile` bundles runtime + source + native dependencies into one binary. No Node.js, no `node_modules`, no external font files needed on the target machine — only system libraries (Cairo, Pango, etc.) must be present.

## Native Dependency: node-canvas

The `canvas` npm package (node-canvas) provides server-side `<canvas>` via Cairo. It requires these system libraries at runtime:

- **Cairo** — 2D graphics
- **Pango** — text layout
- **libjpeg-turbo** — JPEG support
- **giflib** — GIF support
- **librsvg** — SVG rasterization
- **Pixman** — pixel manipulation

At build time, development headers and a C++ toolchain are also needed (see Docker builder stage).

## Font Embedding

Fonts are embedded at compile time using Bun's file import syntax:

```typescript
import virgilPath from "../assets/fonts/Virgil.ttf" with { type: "file" };
```

This bakes the TTF files into the binary — they're extracted to a temp path at runtime and registered with node-canvas.

## Docker Image (`Dockerfile`)

### Strategy

Uses Alpine Linux (musl libc) for a minimal image. The binary runs inside the container where all system libraries are available. Users invoke conversions via `docker run`.

### Stage 1: Builder (`oven/bun:alpine`)

Installs build tools and dev libraries needed to compile node-canvas on musl:

- **Build tools**: python3, make, g++, pkgconfig
- **Dev libraries**: cairo-dev, pango-dev, libjpeg-turbo-dev, giflib-dev, librsvg-dev

Runs `bun install` (compiles native addon) then `bun run build` (produces binary).

### Stage 2: Runtime (`alpine:3.20`)

Minimal image with only runtime libraries:

- cairo, pango, libjpeg-turbo, giflib, librsvg, pixman

Binary is copied from builder stage. No build tools, no source code, no `node_modules` in the final image.

### Build and Run

```bash
bun run docker:build     # Build image and extract binary to ./output/
```

## Native Linux Bundle (`Dockerfile.native`)

### Strategy

Uses Debian Bullseye (glibc 2.31) to build the binary and collect all shared library dependencies into a self-contained tarball. A shell launcher sets `LD_LIBRARY_PATH` so the bundled `.so` files are used instead of system libraries. This lets the binary run on any Linux x64 system without Docker or pre-installed graphics libraries.

Core glibc libraries (`libc.so`, `libm.so`, `libpthread.so`, `ld-linux`, etc.) are intentionally excluded from the bundle to avoid version conflicts with the host system — the host's glibc is always used.

### Build

```bash
bun run build:native
# Output: dist/excalirender-linux-x64.tar.gz
```

### Multi-Stage Process

1. **Builder stage** (Debian Bullseye) — installs Bun, Cairo/Pango dev packages, builds the standalone binary with `bun run build`
2. **Packager stage** (Debian Bullseye) — installs runtime libraries, uses `ldd` (two recursive passes) to collect all transitive shared library dependencies from both the binary and `canvas.node`, copies them into a staging directory
3. **Output stage** (`scratch`) — packages everything into `excalirender-linux-x64.tar.gz`

### Tarball Contents

```
excalirender/
├── bin/
│   ├── excalirender       # Shell launcher (sets LD_LIBRARY_PATH)
│   └── excalirender.bin   # Bun standalone binary
├── lib/
│   └── *.so*                # Bundled shared libraries (~48 files)
└── etc/
    └── fonts/
        └── fonts.conf        # Minimal fontconfig configuration
```

The launcher script (`bin/excalirender`) sets `LD_LIBRARY_PATH` to the bundled `lib/` directory and `FONTCONFIG_PATH`/`FONTCONFIG_FILE` to the bundled config before executing the real binary.

### Compatibility

Built on Debian Bullseye (glibc 2.31) for broad compatibility:

- Ubuntu 20.04+
- Debian 11+
- Fedora 33+
- Most modern Linux x64 distributions

### Why Debian Bullseye (Not Alpine)

Alpine uses musl libc. A musl-built binary requires `/lib/ld-musl-x86_64.so.1` as its ELF interpreter, which doesn't exist on glibc systems. Bundling musl's linker and invoking it directly breaks Bun's standalone binary detection. Debian Bullseye provides glibc 2.31, which is old enough to be compatible with most modern distros while avoiding the musl/glibc mismatch.

## Testing

### Visual Regression Tests (Docker)

```bash
bun run test:visual            # Compare against baselines
bun run test:visual --update   # Update baselines
bun run test:visual --png-only # Only PNG tests
bun run test:visual --svg-only # Only SVG tests
```

Auto-discovers all `.excalidraw` fixtures in `tests/visual/fixtures/`. Each fixture generates both PNG and SVG test cases. Dark mode variants are added for `dark-mode` and `image-elements` fixtures. See [VISUAL-REGRESSION-TESTING.md](VISUAL-REGRESSION-TESTING.md) for details.

### Native Bundle Smoke Tests

```bash
bun run build:native   # Must build tarball first
bun run test:native
```

Auto-discovers the same fixtures and runs them on a clean Ubuntu 22.04 Docker container (no Cairo/Pango installed) to verify zero-dependency operation. Each fixture is tested in both PNG and SVG output, with dark mode variants where applicable.
