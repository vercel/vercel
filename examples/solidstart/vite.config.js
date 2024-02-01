import { defineConfig } from "vite";
import solid from "solid-start/vite";
import vercel from "solid-start-vercel";

export default defineConfig({
  plugins: [solid({ adapter: vercel() })],
});
