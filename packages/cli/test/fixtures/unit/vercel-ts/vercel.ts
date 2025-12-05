import { VercelConfig, routes } from '@vercel/config/v1';

export const config: VercelConfig = {
  redirects: [
    routes.redirect('/region', `https://${process.env.REGION}-staging.example.com`),
  ],

  build: {
    env: {
      "VERCEL_DEBUG": process.env.NODE_ENV === 'production' ? "0" : "1",
    }
  },
};