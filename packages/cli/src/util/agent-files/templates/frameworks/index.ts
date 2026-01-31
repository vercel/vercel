import { renderNextjsSection } from './nextjs';
import { renderGenericFrameworkSection } from './generic';

export function renderFrameworkSection(framework: string | null): string {
  if (!framework) return renderGenericFrameworkSection();
  const f = framework.toLowerCase();
  if (f.includes('next') || f.includes('blitz')) return renderNextjsSection();
  if (f.includes('remix') || f.includes('react-router'))
    return renderRemixSection();
  if (f.includes('astro')) return renderAstroSection();
  if (f.includes('svelte')) return renderSvelteSection();
  if (f.includes('nuxt')) return renderNuxtSection();
  return renderGenericFrameworkSection();
}

const renderRemixSection = () => `## Remix
\`\`\`typescript
// app/routes/*.tsx
export async function loader({ request }) { return json({ data }); }
export async function action({ request }) { return json({ ok: true }); }
\`\`\`

`;

const renderAstroSection = () => `## Astro
\`\`\`javascript
// astro.config.mjs - add: adapter: vercel(), output: 'server'
// API: src/pages/api/*.ts
\`\`\`

`;

const renderSvelteSection = () => `## SvelteKit
\`\`\`javascript
// svelte.config.js - add: adapter: adapter-vercel()
// Load: +page.server.ts
\`\`\`

`;

const renderNuxtSection = () => `## Nuxt
\`\`\`typescript
// server/api/*.ts
export default defineEventHandler(() => ({ message: 'Hello' }));
\`\`\`

`;
