export function renderMarketplaceSection(): string {
  return `## Integrations (vercel.com/marketplace)

| Category | Recommended |
|----------|-------------|
| Database | Vercel Postgres, Neon, Supabase, PlanetScale |
| Redis | **Upstash** (not Vercel KV) |
| Auth | Clerk, Auth0, Supabase Auth |
| Email | Resend, SendGrid |
| Monitoring | Sentry, Axiom |
| CMS | Sanity, Contentful |
| AI | OpenAI, Replicate |

`;
}
