import { Instrument_Serif, JetBrains_Mono } from "next/font/google";

/** Home, Stage public page and the mobile app screens. */
export const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["italic"], variable: "--font-serif", display: "swap" });
export const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700", "800"], variable: "--font-stage-mono", display: "swap" });
