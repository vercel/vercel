export function renderMarketplaceSection(): string {
  return `## Marketplace Integrations

Vercel Marketplace offers pre-built integrations for common services:

### Databases
- **Vercel Postgres** - Serverless PostgreSQL
- **Neon** - Serverless Postgres with branching
- **PlanetScale** - MySQL-compatible serverless database
- **Supabase** - Postgres with Auth, Realtime, and Storage
- **Upstash** - Serverless Redis and Kafka
- **MongoDB Atlas** - Document database

### Authentication
- **Clerk** - Complete user management
- **Auth0** - Identity platform
- **Supabase Auth** - Open source auth

### Analytics & Monitoring
- **Vercel Analytics** - Web analytics
- **Vercel Speed Insights** - Performance monitoring
- **Axiom** - Log management
- **Sentry** - Error tracking
- **Datadog** - APM and monitoring
- **LogDNA** - Log analysis

### CMS & Content
- **Sanity** - Structured content
- **Contentful** - Headless CMS
- **Storyblok** - Visual CMS

### Email
- **Resend** - Email API
- **SendGrid** - Email delivery
- **Postmark** - Transactional email

### Payments
- **Stripe** - Payment processing
- **LemonSqueezy** - Payments for SaaS

### Search
- **Algolia** - Search and discovery
- **Typesense** - Open source search

### AI/ML
- **OpenAI** - GPT and embeddings
- **Replicate** - ML model hosting

Browse all integrations: https://vercel.com/marketplace

### Installing Integrations
1. Visit https://vercel.com/marketplace
2. Select the integration
3. Click "Add Integration"
4. Configure and connect to your project
5. Environment variables are automatically added

`;
}
