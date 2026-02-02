/**
 * Convert WOFF2 fonts to TTF for node-canvas
 * Usage: npx tsx scripts/convert-fonts.ts
 *
 * Converts all unicode-range segments for each font family.
 * Segments are registered separately with node-canvas to provide
 * full unicode coverage (Latin, Cyrillic, Greek, etc.)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decompress } from "wawoff2";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const excalidrawFontsDir = join(
  projectRoot,
  "excalidraw/packages/excalidraw/fonts",
);
const outputDir = join(projectRoot, "assets/fonts");

const fonts = [
  // --- Single-file fonts (already complete) ---
  {
    input: join(excalidrawFontsDir, "Virgil/Virgil-Regular.woff2"),
    output: join(outputDir, "Virgil.ttf"),
  },
  {
    input: join(excalidrawFontsDir, "Cascadia/CascadiaCode-Regular.woff2"),
    output: join(outputDir, "Cascadia.ttf"),
  },
  {
    input: join(excalidrawFontsDir, "Liberation/LiberationSans-Regular.woff2"),
    output: join(outputDir, "LiberationSans.ttf"),
  },

  // --- Excalifont segments (7 total) ---
  {
    input: join(
      excalidrawFontsDir,
      "Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2",
    ),
    output: join(outputDir, "Excalifont.ttf"),
  },
  {
    input: join(
      excalidrawFontsDir,
      "Excalifont/Excalifont-Regular-be310b9bcd4f1a43f571c46df7809174.woff2",
    ),
    output: join(outputDir, "Excalifont-LatinExt.ttf"),
  },
  {
    input: join(
      excalidrawFontsDir,
      "Excalifont/Excalifont-Regular-b9dcf9d2e50a1eaf42fc664b50a3fd0d.woff2",
    ),
    output: join(outputDir, "Excalifont-Cyrillic.ttf"),
  },
  {
    input: join(
      excalidrawFontsDir,
      "Excalifont/Excalifont-Regular-41b173a47b57366892116a575a43e2b6.woff2",
    ),
    output: join(outputDir, "Excalifont-Greek.ttf"),
  },
  {
    input: join(
      excalidrawFontsDir,
      "Excalifont/Excalifont-Regular-3f2c5db56cc93c5a6873b1361d730c16.woff2",
    ),
    output: join(outputDir, "Excalifont-CombiningMarks.ttf"),
  },
  {
    input: join(
      excalidrawFontsDir,
      "Excalifont/Excalifont-Regular-349fac6ca4700ffec595a7150a0d1e1d.woff2",
    ),
    output: join(outputDir, "Excalifont-CyrillicExt.ttf"),
  },
  {
    input: join(
      excalidrawFontsDir,
      "Excalifont/Excalifont-Regular-623ccf21b21ef6b3a0d87738f77eb071.woff2",
    ),
    output: join(outputDir, "Excalifont-Diacritics.ttf"),
  },

  // --- Nunito segments (5 total) ---
  {
    input: join(
      excalidrawFontsDir,
      "Nunito/Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTQ3j6zbXWjgeg.woff2",
    ),
    output: join(outputDir, "Nunito.ttf"),
  },
  {
    input: join(
      excalidrawFontsDir,
      "Nunito/Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTo3j6zbXWjgevT5.woff2",
    ),
    output: join(outputDir, "Nunito-LatinExt.ttf"),
  },
  {
    input: join(
      excalidrawFontsDir,
      "Nunito/Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTA3j6zbXWjgevT5.woff2",
    ),
    output: join(outputDir, "Nunito-Cyrillic.ttf"),
  },
  {
    input: join(
      excalidrawFontsDir,
      "Nunito/Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTk3j6zbXWjgevT5.woff2",
    ),
    output: join(outputDir, "Nunito-CyrillicExt.ttf"),
  },
  {
    input: join(
      excalidrawFontsDir,
      "Nunito/Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTs3j6zbXWjgevT5.woff2",
    ),
    output: join(outputDir, "Nunito-Vietnamese.ttf"),
  },

  // --- Lilita One segments (2 total) ---
  {
    input: join(
      excalidrawFontsDir,
      "Lilita/Lilita-Regular-i7dPIFZ9Zz-WBtRtedDbYEF8RXi4EwQ.woff2",
    ),
    output: join(outputDir, "LilitaOne.ttf"),
  },
  {
    input: join(
      excalidrawFontsDir,
      "Lilita/Lilita-Regular-i7dPIFZ9Zz-WBtRtedDbYE98RXi4EwSsbg.woff2",
    ),
    output: join(outputDir, "LilitaOne-LatinExt.ttf"),
  },

  // --- ComicShanns segments (4 total) ---
  {
    input: join(
      excalidrawFontsDir,
      "ComicShanns/ComicShanns-Regular-279a7b317d12eb88de06167bd672b4b4.woff2",
    ),
    output: join(outputDir, "ComicShanns.ttf"),
  },
  {
    input: join(
      excalidrawFontsDir,
      "ComicShanns/ComicShanns-Regular-fcb0fc02dcbee4c9846b3e2508668039.woff2",
    ),
    output: join(outputDir, "ComicShanns-LatinExt.ttf"),
  },
  {
    input: join(
      excalidrawFontsDir,
      "ComicShanns/ComicShanns-Regular-dc6a8806fa96795d7b3be5026f989a17.woff2",
    ),
    output: join(outputDir, "ComicShanns-CombiningMarks.ttf"),
  },
  {
    input: join(
      excalidrawFontsDir,
      "ComicShanns/ComicShanns-Regular-6e066e8de2ac57ea9283adb9c24d7f0c.woff2",
    ),
    output: join(outputDir, "ComicShanns-GreekLambda.ttf"),
  },
];

async function convertFonts() {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  for (const font of fonts) {
    console.log(`Converting ${font.input}...`);
    try {
      const woff2Data = readFileSync(font.input);
      const ttfData = await decompress(woff2Data);
      writeFileSync(font.output, Buffer.from(ttfData));
      console.log(`  -> ${font.output}`);
    } catch (err) {
      console.error(`Failed to convert ${font.input}:`, err);
    }
  }

  console.log("Font conversion complete.");
}

convertFonts();
