# Visual Regression Testing

Pixel-level comparison of PNG and SVG outputs against known-good baselines. Uses Docker to render (Cairo/Pango native libs), [resvg-js](https://github.com/nicolo-ribaudo/resvg-js) to render SVG to PNG, and [pixelmatch](https://github.com/mapbox/pixelmatch) to compare.

## Prerequisites

- Docker and Docker Compose
- Bun

## Directory Structure

```
tests/visual/
  fixtures/       # .excalidraw input files (one per test case)
  baselines/      # Expected outputs (committed to git)
                  #   {name}.png       — PNG baseline
                  #   {name}--svg.png  — SVG baseline (rendered via resvg)
  output/         # Actual outputs (gitignored)
  diffs/          # Diff images on failure (gitignored)
  run.ts          # Test runner script
```

## Running Tests

```bash
# Compare current output against baselines (PNG + SVG)
bun run test:visual

# Update baselines (after intentional rendering changes)
bun run test:visual:update

# Run only PNG or only SVG tests
bun run tests/visual/run.ts --png-only
bun run tests/visual/run.ts --svg-only
```

The runner:
1. Builds the Docker image (`docker compose build cli`)
2. Converts each fixture to PNG and SVG via `docker compose run --rm cli`
3. For PNG tests: compares output PNG against baseline using pixelmatch
4. For SVG tests: renders SVG to PNG via resvg-js, then compares against SVG baseline using pixelmatch
5. Reports pass/fail with diff percentage
6. Writes diff images to `tests/visual/diffs/` on failure

## Thresholds

Defined in `tests/visual/run.ts`:

- **PIXEL_THRESHOLD** (0.1) — Per-pixel color distance tolerance (0 = exact, 1 = any)
- **MAX_DIFF_PERCENT** (1.0%) — Maximum percentage of differing pixels before a PNG test fails
- **MAX_SVG_DIFF_PERCENT** (1.0%) — Maximum percentage of differing pixels before an SVG test fails

## Adding a New Test Case

1. Create a `.excalidraw` file in `tests/visual/fixtures/`:

```bash
# Example: tests/visual/fixtures/my-feature.excalidraw
```

The file must be valid Excalidraw JSON with `"type": "excalidraw"`. Use fixed `seed` values for deterministic rough.js output. See existing fixtures for reference.

2. Generate the baseline:

```bash
bun run test:visual:update
```

3. Verify the baselines look correct:

```bash
# Open the generated baselines (PNG and SVG)
open tests/visual/baselines/my-feature.png
open tests/visual/baselines/my-feature--svg.png
```

4. Run tests to confirm it passes:

```bash
bun run test:visual
```

5. Commit the fixture and baselines:

```bash
git add tests/visual/fixtures/my-feature.excalidraw
git add tests/visual/baselines/my-feature.png
git add tests/visual/baselines/my-feature--svg.png
```

## Adding a Dark Mode Variant

The test runner automatically creates a dark mode variant for any fixture named `dark-mode.excalidraw`. The variant is tested with the `--dark` flag and saved as `dark-mode--dark.png` (PNG) and `dark-mode--dark--svg.png` (SVG).

## Existing Test Cases

| Fixture | What it tests |
|---------|--------------|
| `basic-shapes` | Rectangle, ellipse, diamond with different fills |
| `text-rendering` | Virgil, Helvetica, Cascadia fonts; alignment; multiline |
| `stroke-styles` | Solid, dashed, dotted strokes on various shapes |
| `fill-styles` | Hachure, cross-hatch, solid, zigzag fills |
| `arrows-lines` | Arrows (one-way, two-way), curved lines, curved arrows |
| `dark-mode` | Shapes and text rendered in both normal and dark mode |
| `freedraw` | Freehand strokes with pressure and simulated pressure |
| `rotated-elements` | Rotated rectangle, ellipse, text |
| `rounded-corners` | Proportional and adaptive roundness on rectangles/diamonds |
| `opacity` | Elements at 100%, 60%, 30% opacity; semi-transparent text |
| `all-fonts` | All 7 supported font families (Excalifont, Nunito, Lilita One, Comic Shanns, Virgil, Cascadia, Liberation Sans) |

## Updating Baselines After Rendering Changes

When you intentionally change the rendering code (e.g., fix a bug, improve fidelity):

1. Run `bun run test:visual` to see which tests fail
2. Inspect the diff images in `tests/visual/diffs/` to verify changes are expected
3. Run `bun run test:visual:update` to regenerate all baselines
4. Review the updated baselines visually
5. Commit the updated baselines alongside your code changes

## CI Integration

Visual regression tests run in the `visual-tests` job in `.github/workflows/ci.yml`. On failure, diff images are uploaded as a GitHub Actions artifact (`visual-regression-diffs`) for inspection.
