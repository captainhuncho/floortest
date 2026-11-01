import localFont from "next/font/local";

/**
 * Home, Stage public page and the mobile app screens. JetBrains Mono is variable: one file per script covers every
 * weight. latin-ext and vietnamese carry accented names (ł ř ő, Yoruba ẹ ọ ṣ).
 *
 * The files are in the repo (src/app/fonts/, SIL Open Font License), so nothing is fetched from Google at build or in
 * the browser (1 Nov: a slow fonts.gstatic.com stopped two release builds). They are the same subset files and unicode
 * ranges next/font/google served: a page still downloads only the scripts it shows, and the same four files (latin,
 * latin-ext and vietnamese mono, latin serif) are preloaded. next/font/local sets one unicode-range per call, so each
 * subset is its own call under the real family name; globals.css sets --font-serif and --font-stage-mono and the
 * metric-matched fallback faces. The `variable` classes only keep these files on the page. next/font reads its options
 * at build time, so each range is written out in full rather than shared through a constant.
 */
const serifLatin = localFont({
  src: "./fonts/instrument-serif-italic-latin.woff2",
  weight: "400",
  style: "italic",
  display: "swap",
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Instrument Serif" },
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
  variable: "--ft-serif-latin",
});
const serifLatinExt = localFont({
  src: "./fonts/instrument-serif-italic-latin-ext.woff2",
  weight: "400",
  style: "italic",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Instrument Serif" },
    { prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" },
  ],
  variable: "--ft-serif-latin-ext",
});

const monoLatin = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "JetBrains Mono" },
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
  variable: "--ft-mono-latin",
});
const monoLatinExt = localFont({
  src: "./fonts/jetbrains-mono-latin-ext.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "JetBrains Mono" },
    { prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" },
  ],
  variable: "--ft-mono-latin-ext",
});
const monoVietnamese = localFont({
  src: "./fonts/jetbrains-mono-vietnamese.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "JetBrains Mono" },
    { prop: "unicode-range", value: "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB" },
  ],
  variable: "--ft-mono-vietnamese",
});
const monoCyrillic = localFont({
  src: "./fonts/jetbrains-mono-cyrillic.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "JetBrains Mono" },
    { prop: "unicode-range", value: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" },
  ],
  variable: "--ft-mono-cyrillic",
});
const monoCyrillicExt = localFont({
  src: "./fonts/jetbrains-mono-cyrillic-ext.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "JetBrains Mono" },
    { prop: "unicode-range", value: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F" },
  ],
  variable: "--ft-mono-cyrillic-ext",
});
const monoGreek = localFont({
  src: "./fonts/jetbrains-mono-greek.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "JetBrains Mono" },
    { prop: "unicode-range", value: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF" },
  ],
  variable: "--ft-mono-greek",
});

export const serif = { variable: [serifLatin, serifLatinExt].map((f) => f.variable).join(" ") };
export const mono = { variable: [monoLatin, monoLatinExt, monoVietnamese, monoCyrillic, monoCyrillicExt, monoGreek].map((f) => f.variable).join(" ") };
