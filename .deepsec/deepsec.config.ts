import { defineConfig, type DeepsecPlugin } from 'deepsec/config';
import { vercelApiHandlerEntrypoint } from './matchers/vercel-api-handler-entrypoint.js';
import { vercelCliCommandEntrypoint } from './matchers/vercel-cli-command-entrypoint.js';
import { vercelRuntimeBuilderEntrypoint } from './matchers/vercel-runtime-builder-entrypoint.js';

const vercelEntryPointPlugin: DeepsecPlugin = {
  name: 'vercel-entry-points',
  matchers: [
    vercelRuntimeBuilderEntrypoint,
    vercelCliCommandEntrypoint,
    vercelApiHandlerEntrypoint,
  ],
};

export default defineConfig({
  projects: [
    { id: 'vercel', root: '..' },
    // <deepsec:projects-insert-above>
  ],
  plugins: [vercelEntryPointPlugin],
});
