import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static build for GitHub Pages. base "./" keeps every path relative, so the site works under
// https://<user>.github.io/neostay-insights/. Data files in public/data/ are encrypted (npm run encrypt).
export default defineConfig({
  plugins: [react()],
  base: "./",
});
