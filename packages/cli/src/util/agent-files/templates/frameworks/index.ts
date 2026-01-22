import { renderNextjsSection } from './nextjs';
import { renderGenericFrameworkSection } from './generic';

const NEXTJS_FRAMEWORKS = ['nextjs', 'blitzjs'];
const REMIX_FRAMEWORKS = ['remix', 'react-router'];
const ASTRO_FRAMEWORKS = ['astro'];
const SVELTEKIT_FRAMEWORKS = ['sveltekit', 'sveltekit-1'];
const NUXT_FRAMEWORKS = ['nuxtjs'];

export function renderFrameworkSection(framework: string | null): string {
  if (!framework) {
    return renderGenericFrameworkSection();
  }

  const normalizedFramework = framework.toLowerCase();

  if (NEXTJS_FRAMEWORKS.includes(normalizedFramework)) {
    return renderNextjsSection();
  }

  if (REMIX_FRAMEWORKS.includes(normalizedFramework)) {
    return renderRemixSection();
  }

  if (ASTRO_FRAMEWORKS.includes(normalizedFramework)) {
    return renderAstroSection();
  }

  if (SVELTEKIT_FRAMEWORKS.includes(normalizedFramework)) {
    return renderSvelteKitSection();
  }

  if (NUXT_FRAMEWORKS.includes(normalizedFramework)) {
    return renderNuxtSection();
  }

  return renderGenericFrameworkSection();
}

function renderRemixSection(): string {
  return `## Remix on Vercel

### Route Structure
Remix uses file-based routing in \`app/routes/\`:

\`\`\`
app/
├── routes/
│   ├── _index.tsx        # / route
│   ├── about.tsx         # /about route
│   └── blog.$slug.tsx    # /blog/:slug route
└── root.tsx
\`\`\`

### Loaders and Actions

\`\`\`typescript
// app/routes/posts.tsx
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';

export async function loader({ request }: LoaderFunctionArgs) {
  const posts = await getPosts();
  return json({ posts });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  // Handle form submission
  return json({ success: true });
}
\`\`\`

### Edge Runtime
Enable edge runtime for specific routes:

\`\`\`typescript
export const config = { runtime: 'edge' };
\`\`\`

`;
}

function renderAstroSection(): string {
  return `## Astro on Vercel

### SSR Configuration
Enable SSR with the Vercel adapter:

\`\`\`javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  output: 'server', // or 'hybrid'
  adapter: vercel(),
});
\`\`\`

### API Routes
Create API endpoints in \`src/pages/api/\`:

\`\`\`typescript
// src/pages/api/hello.ts
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  return new Response(JSON.stringify({ message: 'Hello!' }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
\`\`\`

### Edge Functions

\`\`\`javascript
// astro.config.mjs
export default defineConfig({
  adapter: vercel({
    edgeMiddleware: true,
  }),
});
\`\`\`

`;
}

function renderSvelteKitSection(): string {
  return `## SvelteKit on Vercel

### Adapter Configuration

\`\`\`javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-vercel';

export default {
  kit: {
    adapter: adapter({
      runtime: 'nodejs20.x', // or 'edge'
    }),
  },
};
\`\`\`

### Load Functions

\`\`\`typescript
// src/routes/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  return {
    posts: await getPosts(),
  };
};
\`\`\`

### Form Actions

\`\`\`typescript
// src/routes/+page.server.ts
import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    // Handle form submission
  },
};
\`\`\`

`;
}

function renderNuxtSection(): string {
  return `## Nuxt on Vercel

### Deployment
Nuxt 3 works out of the box with Vercel. The \`nuxt build\` command automatically detects Vercel.

### Server Routes
Create API routes in \`server/api/\`:

\`\`\`typescript
// server/api/hello.ts
export default defineEventHandler((event) => {
  return { message: 'Hello World' };
});
\`\`\`

### Route Rules
Configure caching and rendering per-route:

\`\`\`typescript
// nuxt.config.ts
export default defineNuxtConfig({
  routeRules: {
    '/': { prerender: true },
    '/api/**': { cors: true },
    '/admin/**': { ssr: false },
  },
});
\`\`\`

`;
}
