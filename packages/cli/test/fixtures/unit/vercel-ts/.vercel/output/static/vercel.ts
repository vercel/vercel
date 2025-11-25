import { VercelConfig, createRouter } from '@vercel/config/v1';

const router = createRouter();

export const config: VercelConfig = {
  redirects: [
    router.redirect('/region', `https://${process.env.REGION}-staging.example.com`),
  ],

  build: {
    env: {
      "VERCEL_DEBUG": process.env.NODE_ENV === 'production' ? "0" : "1",
    }
  },
};