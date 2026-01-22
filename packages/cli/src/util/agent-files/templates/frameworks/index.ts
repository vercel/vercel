import { renderNextjsSection } from './nextjs';
import { renderGenericFrameworkSection } from './generic';

const NEXTJS_FRAMEWORKS = ['nextjs', 'blitzjs'];

export function renderFrameworkSection(framework: string | null): string {
  if (!framework) {
    return renderGenericFrameworkSection();
  }

  const normalized = framework.toLowerCase();

  if (NEXTJS_FRAMEWORKS.includes(normalized)) {
    return renderNextjsSection();
  }

  if (normalized.includes('remix') || normalized.includes('react-router')) {
    return renderRemixSection();
  }

  if (normalized.includes('astro')) {
    return renderAstroSection();
  }

  if (normalized.includes('svelte')) {
    return renderSvelteKitSection();
  }

  if (normalized.includes('nuxt')) {
    return renderNuxtSection();
  }

  return renderGenericFrameworkSection();
}

function renderRemixSection(): string {
  return `## Remix

**Routes:** \`app/routes/\` (file-based routing)

**Loader/Action:**
\`\`\`typescript
export async function loader({ request }: LoaderFunctionArgs) {
  return json({ data: await getData() });
}
export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  return json({ success: true });
}
\`\`\`

`;
}

function renderAstroSection(): string {
  return `## Astro

**SSR Config:** \`astro.config.mjs\`
\`\`\`javascript
import vercel from '@astrojs/vercel/serverless';
export default defineConfig({ output: 'server', adapter: vercel() });
\`\`\`

**API Routes:** \`src/pages/api/*.ts\`

`;
}

function renderSvelteKitSection(): string {
  return `## SvelteKit

**Adapter:** \`svelte.config.js\`
\`\`\`javascript
import adapter from '@sveltejs/adapter-vercel';
export default { kit: { adapter: adapter() } };
\`\`\`

**Load Functions:** \`+page.server.ts\`

`;
}

function renderNuxtSection(): string {
  return `## Nuxt

Auto-detected by Vercel. Server routes in \`server/api/\`.
\`\`\`typescript
// server/api/hello.ts
export default defineEventHandler(() => ({ message: 'Hello' }));
\`\`\`

`;
}
