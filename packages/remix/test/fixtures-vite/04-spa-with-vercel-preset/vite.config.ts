import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { vercelPreset } from "@vercel/remix/vite";

export default defineConfig({
  build: {
    assetsDir: 'remix-assets'
  },
  plugins: [
    remix({
      ssr: false,
      buildDirectory: 'dist',
      presets: [vercelPreset()]
    }),
    tsconfigPaths(),
  ],
});
