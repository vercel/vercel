import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/edge';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
});
