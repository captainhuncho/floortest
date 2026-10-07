import { Instrument_Serif, JetBrains_Mono } from "next/font/google";

/** Home, Stage public page and the mobile app screens. JetBrains Mono is variable: one file covers every weight. */
export const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["italic"], variable: "--font-serif", display: "swap" });
export const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-stage-mono", display: "swap" });
