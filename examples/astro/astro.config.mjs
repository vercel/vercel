import { defineConfig } from 'astro/config';
// Use Vercel Edge Functions (Recommended)
import vercel from '@astrojs/vercel/edge';
// Can also use Serverless Functions
// import vercel from '@astrojs/vercel/serverless';
// Or a completely static build
// import vercel from '@astrojs/vercel/static';

export default defineConfig({
  output: 'server',
  experimental: {
    assets: true
   },
  adapter: vercel({
    imageService: true,
  }),
});
