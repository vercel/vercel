import type { ProjectContext } from '../types';

export function renderHeader(ctx: ProjectContext): string {
  const framework = ctx.framework || 'Unknown';
  const project = ctx.projectName || 'Project';
  return `# Vercel Guide: ${project} (${framework})

`;
}

export function renderDeploymentCommands(): string {
  return `## Deploy
\`\`\`bash
vercel            # preview
vercel --prod     # production
vercel env pull   # sync env vars
\`\`\`

`;
}

export function renderEnvironmentVariables(): string {
  return ''; // Merged into deploy section
}

export function renderProjectConfig(ctx: ProjectContext): string {
  if (!ctx.vercelConfig) return '';

  const parts: string[] = [];
  const config = ctx.vercelConfig;

  if (config.crons?.length) {
    parts.push(
      `**Crons:** ${config.crons.map(c => `\`${c.path}\` @ \`${c.schedule}\``).join(', ')}`
    );
  }
  if (config.redirects?.length) {
    parts.push(`**Redirects:** ${config.redirects.length}`);
  }
  if (config.rewrites?.length) {
    parts.push(`**Rewrites:** ${config.rewrites.length}`);
  }

  return parts.length
    ? `## Config (vercel.json)\n${parts.join(' | ')}\n\n`
    : '';
}

export function renderFooter(): string {
  return `---
<!-- Custom rules below -->
`;
}
