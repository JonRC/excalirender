# Conversion: .excalidraw to PNG/SVG

## Origin

The rendering logic is a custom clean-room implementation inspired by Excalidraw's architecture. It is **not** a port of Excalidraw's export code — the rendering pipeline was written from scratch using the same underlying libraries.

## Output Format

The output format is determined by the `-o`/`--output` file extension:

| Extension | Format | Notes |
|-----------|--------|-------|
| `.svg` | SVG | Vector format, scalable |
| `.png` | PNG | Raster format (default) |
| (none) | PNG | Default when no extension specified |

Examples:
- `excalirender diagram.excalidraw -o output.svg` → SVG output
- `excalirender diagram.excalidraw -o output.png` → PNG output
- `excalirender diagram.excalidraw -o output` → PNG output (default)
- `excalirender diagram.excalidraw` → `diagram.png` (default)

## Fonts

Font files are sourced from `excalidraw/packages/excalidraw/fonts/` in WOFF2 format. They are converted to TTF using `scripts/convert-fonts.ts`, which uses the `wawoff2` library to decompress WOFF2 → TTF. The resulting TTF files live in `assets/fonts/`.

Fonts are embedded into the compiled binary at build time via Bun's `import ... with { type: "file" }` syntax. At runtime, embedded fonts are extracted from Bun's virtual filesystem (`/$bunfs/`) to a temp directory so that node-canvas's native `registerFont` can access them.

**Font family mapping** (matches Excalidraw's numbering):

| ID | Font | Style | Status |
|----|------|-------|--------|
| 1 | Virgil | Hand-drawn serif | Deprecated |
| 2 | Helvetica | System sans-serif | Deprecated |
| 3 | Cascadia | Monospace | Deprecated |
| 5 | Excalifont | Hand-drawn (default) | Active |
| 6 | Nunito | Sans-serif | Active |
| 7 | Lilita One | Display | Active |
| 8 | Comic Shanns | Comic-style monospace | Active |
| 9 | Liberation Sans | Server-side export | Active |

**Unicode coverage**: All unicode segments from Excalidraw's font splits are embedded:

| Font | Segments | Unicode Coverage |
|------|----------|-----------------|
| Excalifont | 7 | Latin, Latin Extended, Cyrillic, Cyrillic Extended, Greek, Combining Marks, Diacritics |
| Nunito | 5 | Latin, Latin Extended, Cyrillic, Cyrillic Extended, Vietnamese |
| Lilita One | 2 | Latin, Latin Extended |
| Comic Shanns | 4 | Latin, Latin Extended, Combining Marks, Greek Lambda |
| Virgil | 1 | Full (single file) |
| Cascadia | 1 | Full (single file) |
| Liberation Sans | 1 | Full (single file) |

Multiple TTF segments for the same font family are registered with node-canvas under the same family name. fontconfig handles automatic glyph fallback across segments.

Note: CJK characters are not supported (no CJK segments available in Excalidraw's font files).

## Shared Libraries

Same libraries Excalidraw uses for rendering:

- **Rough.js** — hand-drawn, sketchy shapes (rectangles, ellipses, diamonds, lines, arrows)
- **perfect-freehand** — pressure-sensitive freehand stroke paths

## Rendering Pipeline

1. **Read JSON** — parse `.excalidraw` file
2. **Parse elements** — extract element array, filter deleted elements
3. **Preload images** — decode base64 data URLs from the `files` record into image objects
4. **Calculate canvas bounds** — compute bounding box across all elements (accounting for rotation)
5. **Create node-canvas** — sized to bounds × scale factor, filled with background color
6. **Render elements** — iterate elements sorted by index, draw each one (child elements of frames are clipped to frame bounds)
7. **Write PNG** — stream canvas to PNG file

## Supported Elements

| Element | Renderer | Notes |
|---------|----------|-------|
| rectangle | Rough.js | Rounded corners via SVG path (`rc.path()`) |
| diamond | Rough.js | 4-point polygon, rounded corners via cubic bezier |
| ellipse | Rough.js | `rc.ellipse()` |
| line | Rough.js | Single segment or multi-point curve |
| arrow | Rough.js + canvas | Line via Rough.js, arrowheads via canvas API |
| freedraw | perfect-freehand | `getStroke()` → native canvas quadratic bezier path |
| text | Native canvas | Multi-line, 7 embedded font families (+ Helvetica fallback), alignment, all font sizes |
| image | Native canvas | Base64 data URL decoding, crop, flip (scale), rotation, rounded corners |
| frame | Native canvas | Rounded rectangle border, label text, child element clipping |
| magicframe | Native canvas | Same rendering as frame |
| embeddable | Rough.js + canvas | Rectangle shape with centered placeholder text (URL or "Empty Web-Embed") |
| iframe | Rough.js + canvas | Rectangle shape with centered placeholder text ("IFrame element") |

## Rendering Details

- **Rough.js options**: `seed`, `strokeWidth`, `roughness`, `stroke`, `fill`, `fillStyle`, `strokeLineDash`, `disableMultiStroke` — all read from element properties
- **Fill styles**: `hachure`, `cross-hatch`, `solid`, `zigzag` (via Rough.js)
- **Stroke styles**: `solid` (default), `dashed` (pattern `[8, 8+strokeWidth]`), `dotted` (pattern `[1.5, 6+strokeWidth]`). Non-solid strokes disable multi-stroke and add 0.5 to strokeWidth for visual consistency
- **Opacity**: applied per-element via `ctx.globalAlpha`
- **Rotation**: handled via canvas `translate()` + `rotate()` around element center
- **Corner radius**: proportional (25% of min dimension), adaptive (fixed radius with cutoff), or legacy. Applied to rectangles and diamonds
- **Dark mode**: supported via CLI flag (`--dark`). Applies `invert(93%) + hue-rotate(180°)` color transformation to all colors (background, strokes, fills) and image pixel data — matching Excalidraw's `applyDarkModeFilter()` algorithm. For PNG export, image pixels are transformed via `getImageData`/`putImageData`. For SVG export, images get a CSS `filter: invert(0.93) hue-rotate(180deg)` style
- **Freedraw**: uses `perfect-freehand` with `size: strokeWidth * 4.25`, `thinning: 0.6`, `smoothing: 0.5`, `streamline: 0.5`, `easing: easeOutSine`, `last: true` — matching Excalidraw's parameters. Closed paths (first/last point within 8px) get background fill via Rough.js curve with simplified points
- **Text**: font family selected from element's `fontFamily` ID (see Font family mapping table). Supports all font sizes via the `fontSize` property. Text alignment (`left`, `center`, `right`) positions text within the element's width. Multi-line text is split on `\n` and rendered line-by-line with configurable `lineHeight` (default 1.25). Deprecated font IDs (1=Virgil, 2=Helvetica, 3=Cascadia) are mapped to their embedded TTFs where available; Helvetica (ID 2) has no embedded font and falls back to system default. Text color uses the element's `strokeColor`
- **Images**: loaded from `files` record via `fileId`, supports crop (source region), horizontal/vertical flip via `scale` property, opacity, rotation, and rounded corners clipping
- **Frames**: rendered as rounded rectangle borders (8px radius, `#bbb` stroke, 2px width) with a label above the frame. Label uses 14px sans-serif font, `#999999` color (light) / `#7a7a7a` (dark). Child elements (those with `frameId` matching the frame) are clipped to the frame bounds. Frame names default to "Frame" when `name` is null. Long names are truncated with ellipsis to fit frame width. Rotation is fully supported — border, label, and clipping region all rotate together
- **Frame-only export**: `--frame <name>` exports only a specific frame's contents. Matches by frame name first, then by element ID. The output is sized exactly to the frame dimensions (no padding), children are clipped to frame bounds, and the frame border/label is omitted. If the frame is not found, an error lists available frames
- **Embeddables/iframes**: rendered as rectangles (via Rough.js) with a centered placeholder text label. For `embeddable` elements, the label shows the `link` URL or "Empty Web-Embed" if no link is set. For `iframe` elements, the label shows "IFrame element". Font size is adaptive based on element width and text length. Text wraps to fit within the element width (20px padding). This matches Excalidraw's static export behavior — interactive embed content cannot be rendered in PNG

## SVG Export

SVG export is auto-detected from the output file extension (`.svg`). The SVG renderer uses `rough.generator()` to generate Drawable objects, then `gen.toPaths()` to convert them to SVG `<path>` elements — no DOM required.

All element types supported by PNG export are also supported in SVG:
- **Shapes** (rectangle, diamond, ellipse, line, arrow): Rough.js generator → PathInfo → SVG `<path>` elements
- **Freedraw**: perfect-freehand stroke points → SVG `<path>` with quadratic bezier curves
- **Text**: SVG `<text>` elements with font-family, font-size, text-anchor. Fonts are embedded as base64 `@font-face` rules in `<defs><style>` with `unicode-range` descriptors — only fonts actually used in the document are included
- **Images**: SVG `<image>` elements with inline data URLs; crop via nested `<svg>` viewBox
- **Frames**: SVG `<rect>` + `<text>` for border/label; `<clipPath>` + `clip-path` for child clipping
- **Embeddables/iframes**: Rough.js rectangle + centered SVG `<text>` placeholder

Dark mode, frame-only export, opacity, and rotation are all supported via SVG attributes (`fill`, `opacity`, `transform`).

## Not Supported

- CJK text (no CJK font segments available)
