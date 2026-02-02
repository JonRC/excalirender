import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerFont } from "canvas";
// @ts-expect-error - Bun-specific import syntax for embedding files
import cascadiaPath from "../assets/fonts/Cascadia.ttf" with { type: "file" };
// Comic Shanns segments (Latin, Latin Extended, Combining Marks, Greek Lambda)
// @ts-expect-error - Bun-specific import syntax for embedding files
import comicShannsPath from "../assets/fonts/ComicShanns.ttf" with {
  type: "file",
};
// @ts-expect-error - Bun-specific import syntax for embedding files
import comicShannsCombiningMarksPath from "../assets/fonts/ComicShanns-CombiningMarks.ttf" with {
  type: "file",
};
// @ts-expect-error - Bun-specific import syntax for embedding files
import comicShannsGreekLambdaPath from "../assets/fonts/ComicShanns-GreekLambda.ttf" with {
  type: "file",
};
// @ts-expect-error - Bun-specific import syntax for embedding files
import comicShannsLatinExtPath from "../assets/fonts/ComicShanns-LatinExt.ttf" with {
  type: "file",
};
// Excalifont segments (Latin, Latin Extended, Cyrillic, Greek, Combining Marks, Cyrillic Ext, Diacritics)
// @ts-expect-error - Bun-specific import syntax for embedding files
import excalifontPath from "../assets/fonts/Excalifont.ttf" with {
  type: "file",
};
// @ts-expect-error - Bun-specific import syntax for embedding files
import excalifontCombiningMarksPath from "../assets/fonts/Excalifont-CombiningMarks.ttf" with {
  type: "file",
};
// @ts-expect-error - Bun-specific import syntax for embedding files
import excalifontCyrillicPath from "../assets/fonts/Excalifont-Cyrillic.ttf" with {
  type: "file",
};
// @ts-expect-error - Bun-specific import syntax for embedding files
import excalifontCyrillicExtPath from "../assets/fonts/Excalifont-CyrillicExt.ttf" with {
  type: "file",
};
// @ts-expect-error - Bun-specific import syntax for embedding files
import excalifontDiacriticsPath from "../assets/fonts/Excalifont-Diacritics.ttf" with {
  type: "file",
};
// @ts-expect-error - Bun-specific import syntax for embedding files
import excalifontGreekPath from "../assets/fonts/Excalifont-Greek.ttf" with {
  type: "file",
};
// @ts-expect-error - Bun-specific import syntax for embedding files
import excalifontLatinExtPath from "../assets/fonts/Excalifont-LatinExt.ttf" with {
  type: "file",
};
// @ts-expect-error - Bun-specific import syntax for embedding files
import liberationSansPath from "../assets/fonts/LiberationSans.ttf" with {
  type: "file",
};
// Lilita One segments (Latin, Latin Extended)
// @ts-expect-error - Bun-specific import syntax for embedding files
import lilitaOnePath from "../assets/fonts/LilitaOne.ttf" with { type: "file" };
// @ts-expect-error - Bun-specific import syntax for embedding files
import lilitaOneLatinExtPath from "../assets/fonts/LilitaOne-LatinExt.ttf" with {
  type: "file",
};
// Nunito segments (Latin, Latin Extended, Cyrillic, Cyrillic Ext, Vietnamese)
// @ts-expect-error - Bun-specific import syntax for embedding files
import nunitoPath from "../assets/fonts/Nunito.ttf" with { type: "file" };
// @ts-expect-error - Bun-specific import syntax for embedding files
import nunitoCyrillicPath from "../assets/fonts/Nunito-Cyrillic.ttf" with {
  type: "file",
};
// @ts-expect-error - Bun-specific import syntax for embedding files
import nunitoCyrillicExtPath from "../assets/fonts/Nunito-CyrillicExt.ttf" with {
  type: "file",
};
// @ts-expect-error - Bun-specific import syntax for embedding files
import nunitoLatinExtPath from "../assets/fonts/Nunito-LatinExt.ttf" with {
  type: "file",
};
// @ts-expect-error - Bun-specific import syntax for embedding files
import nunitoVietnamesePath from "../assets/fonts/Nunito-Vietnamese.ttf" with {
  type: "file",
};
// Embed fonts at compile time into the binary using Bun's file embedding
// Single-file fonts
// @ts-expect-error - Bun-specific import syntax for embedding files
import virgilPath from "../assets/fonts/Virgil.ttf" with { type: "file" };

interface FontConfig {
  path: string;
  family: string;
  fileName: string;
}

const fonts: FontConfig[] = [
  // Single-file fonts
  { path: virgilPath, family: "Virgil", fileName: "Virgil.ttf" },
  { path: cascadiaPath, family: "Cascadia", fileName: "Cascadia.ttf" },
  {
    path: liberationSansPath,
    family: "Liberation Sans",
    fileName: "LiberationSans.ttf",
  },

  // Excalifont — all unicode segments registered under same family
  { path: excalifontPath, family: "Excalifont", fileName: "Excalifont.ttf" },
  {
    path: excalifontLatinExtPath,
    family: "Excalifont",
    fileName: "Excalifont-LatinExt.ttf",
  },
  {
    path: excalifontCyrillicPath,
    family: "Excalifont",
    fileName: "Excalifont-Cyrillic.ttf",
  },
  {
    path: excalifontGreekPath,
    family: "Excalifont",
    fileName: "Excalifont-Greek.ttf",
  },
  {
    path: excalifontCombiningMarksPath,
    family: "Excalifont",
    fileName: "Excalifont-CombiningMarks.ttf",
  },
  {
    path: excalifontCyrillicExtPath,
    family: "Excalifont",
    fileName: "Excalifont-CyrillicExt.ttf",
  },
  {
    path: excalifontDiacriticsPath,
    family: "Excalifont",
    fileName: "Excalifont-Diacritics.ttf",
  },

  // Nunito — all unicode segments
  { path: nunitoPath, family: "Nunito", fileName: "Nunito.ttf" },
  {
    path: nunitoLatinExtPath,
    family: "Nunito",
    fileName: "Nunito-LatinExt.ttf",
  },
  {
    path: nunitoCyrillicPath,
    family: "Nunito",
    fileName: "Nunito-Cyrillic.ttf",
  },
  {
    path: nunitoCyrillicExtPath,
    family: "Nunito",
    fileName: "Nunito-CyrillicExt.ttf",
  },
  {
    path: nunitoVietnamesePath,
    family: "Nunito",
    fileName: "Nunito-Vietnamese.ttf",
  },

  // Lilita One — all unicode segments
  { path: lilitaOnePath, family: "Lilita One", fileName: "LilitaOne.ttf" },
  {
    path: lilitaOneLatinExtPath,
    family: "Lilita One",
    fileName: "LilitaOne-LatinExt.ttf",
  },

  // Comic Shanns — all unicode segments
  {
    path: comicShannsPath,
    family: "Comic Shanns",
    fileName: "ComicShanns.ttf",
  },
  {
    path: comicShannsLatinExtPath,
    family: "Comic Shanns",
    fileName: "ComicShanns-LatinExt.ttf",
  },
  {
    path: comicShannsCombiningMarksPath,
    family: "Comic Shanns",
    fileName: "ComicShanns-CombiningMarks.ttf",
  },
  {
    path: comicShannsGreekLambdaPath,
    family: "Comic Shanns",
    fileName: "ComicShanns-GreekLambda.ttf",
  },
];

// Font family ID → font segments with unicode-range for SVG @font-face embedding.
// Unicode ranges sourced from excalidraw/packages/excalidraw/fonts/*/index.ts
interface FontSegment {
  path: string;
  family: string;
  unicodeRange?: string;
}

const svgFontSegments: Record<number, FontSegment[]> = {
  1: [{ path: virgilPath, family: "Virgil" }],
  3: [{ path: cascadiaPath, family: "Cascadia" }],
  5: [
    {
      path: excalifontPath,
      family: "Excalifont",
      unicodeRange:
        "U+20-7e,U+a0-a3,U+a5-a6,U+a8-ab,U+ad-b1,U+b4,U+b6-b8,U+ba-ff,U+131,U+152-153,U+2bc,U+2c6,U+2da,U+2dc,U+304,U+308,U+2013-2014,U+2018-201a,U+201c-201e,U+2020,U+2022,U+2024-2026,U+2030,U+2039-203a,U+20ac,U+2122,U+2212",
    },
    {
      path: excalifontLatinExtPath,
      family: "Excalifont",
      unicodeRange:
        "U+100-130,U+132-137,U+139-149,U+14c-151,U+154-17e,U+192,U+1fc-1ff,U+218-21b,U+237,U+1e80-1e85,U+1ef2-1ef3,U+2113",
    },
    {
      path: excalifontCyrillicPath,
      family: "Excalifont",
      unicodeRange: "U+400-45f,U+490-491,U+2116",
    },
    {
      path: excalifontGreekPath,
      family: "Excalifont",
      unicodeRange:
        "U+37e,U+384-38a,U+38c,U+38e-393,U+395-3a1,U+3a3-3a8,U+3aa-3cf,U+3d7",
    },
    {
      path: excalifontCombiningMarksPath,
      family: "Excalifont",
      unicodeRange:
        "U+2c7,U+2d8-2d9,U+2db,U+2dd,U+302,U+306-307,U+30a-30c,U+326-328,U+212e,U+2211,U+fb01-fb02",
    },
    {
      path: excalifontCyrillicExtPath,
      family: "Excalifont",
      unicodeRange:
        "U+462-463,U+472-475,U+4d8-4d9,U+4e2-4e3,U+4e6-4e9,U+4ee-4ef",
    },
    {
      path: excalifontDiacriticsPath,
      family: "Excalifont",
      unicodeRange: "U+300-301,U+303",
    },
  ],
  6: [
    {
      path: nunitoPath,
      family: "Nunito",
      unicodeRange:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
    {
      path: nunitoLatinExtPath,
      family: "Nunito",
      unicodeRange:
        "U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
    {
      path: nunitoCyrillicPath,
      family: "Nunito",
      unicodeRange: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
    },
    {
      path: nunitoCyrillicExtPath,
      family: "Nunito",
      unicodeRange:
        "U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F",
    },
    {
      path: nunitoVietnamesePath,
      family: "Nunito",
      unicodeRange:
        "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB",
    },
  ],
  7: [
    {
      path: lilitaOnePath,
      family: "Lilita One",
      unicodeRange:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
    {
      path: lilitaOneLatinExtPath,
      family: "Lilita One",
      unicodeRange:
        "U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    },
  ],
  8: [
    {
      path: comicShannsPath,
      family: "Comic Shanns",
      unicodeRange:
        "U+20-7e,U+a1-a6,U+a8,U+ab-ac,U+af-b1,U+b4,U+b8,U+bb-bc,U+bf-cf,U+d1-d7,U+d9-de,U+e0-ef,U+f1-f7,U+f9-ff,U+131,U+152-153,U+2c6,U+2da,U+2dc,U+2013-2014,U+2018-201a,U+201c-201d,U+2020-2022,U+2026,U+2039-203a,U+2044,U+20ac,U+2191,U+2193,U+2212",
    },
    {
      path: comicShannsLatinExtPath,
      family: "Comic Shanns",
      unicodeRange:
        "U+100-10f,U+112-125,U+128-130,U+134-137,U+139-13c,U+141-148,U+14c-151,U+154-161,U+164-165,U+168-17f,U+1bf,U+1f7,U+218-21b,U+237,U+1e80-1e85,U+1ef2-1ef3,U+a75b",
    },
    {
      path: comicShannsCombiningMarksPath,
      family: "Comic Shanns",
      unicodeRange:
        "U+2c7,U+2d8-2d9,U+2db,U+2dd,U+315,U+2190,U+2192,U+2200,U+2203-2204,U+2264-2265,U+f6c3",
    },
    {
      path: comicShannsGreekLambdaPath,
      family: "Comic Shanns",
      unicodeRange: "U+3bb",
    },
  ],
  9: [{ path: liberationSansPath, family: "Liberation Sans" }],
};

/**
 * Generate CSS @font-face rules with base64-embedded TTF data for SVG export.
 * Only includes fonts for the requested family IDs.
 */
export function generateFontFaceCSS(usedFamilyIds: Set<number>): string {
  let css = "";

  for (const familyId of usedFamilyIds) {
    const segments = svgFontSegments[familyId];
    if (!segments) continue;

    for (const seg of segments) {
      try {
        const data = readFileSync(seg.path);
        const b64 = Buffer.from(data).toString("base64");
        const unicodeRange = seg.unicodeRange
          ? `\n    unicode-range: ${seg.unicodeRange};`
          : "";
        css += `@font-face {\n    font-family: "${seg.family}";\n    src: url("data:font/ttf;base64,${b64}") format("truetype");${unicodeRange}\n  }\n  `;
      } catch {
        // Font not available — skip silently
      }
    }
  }

  return css;
}

let fontsRegistered = false;

/**
 * Extract an embedded font to a real temp file if the path is in Bun's virtual filesystem.
 * node-canvas's native registerFont cannot access /$bunfs/ paths, so we need real files.
 */
function resolveFont(font: FontConfig): string {
  if (!font.path.startsWith("/$bunfs/")) {
    return font.path;
  }

  const tempFontsDir = join(tmpdir(), "excalirender-fonts");
  if (!existsSync(tempFontsDir)) {
    mkdirSync(tempFontsDir, { recursive: true });
  }

  const tempPath = join(tempFontsDir, font.fileName);
  if (!existsSync(tempPath)) {
    const data = readFileSync(font.path);
    writeFileSync(tempPath, data);
  }
  return tempPath;
}

export function registerFonts(): void {
  if (fontsRegistered) {
    return;
  }

  for (const font of fonts) {
    try {
      const realPath = resolveFont(font);
      registerFont(realPath, { family: font.family });
    } catch (error) {
      console.warn(
        `Failed to register font ${font.family} (${font.fileName}):`,
        error,
      );
    }
  }

  fontsRegistered = true;
}
