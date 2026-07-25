import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from a GitHub Pages project subpath. The data loader reads import.meta.env.BASE_URL,
// so switching to "/" for a custom domain needs no code change.
export default defineConfig({
  base: "/yahtzee-optimizer/",
  plugins: [react()],
});
