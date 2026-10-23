import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// Build number shown in-game; bump the VERSION file for every release.
const version = readFileSync("VERSION", "utf-8").trim();

// GitHub Pages serves the site from /the-blacksmith/
export default defineConfig({
  base: "/the-blacksmith/",
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
});
