import { defineConfig } from "vite";
import solid from "solid-start";
import vercel from "solid-start-vercel";

export default defineConfig({
  plugins: [solid({ adapter: vercel() })],
});
