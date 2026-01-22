import type { ProjectContext } from '../types';

export function renderHeader(ctx: ProjectContext): string {
  const frameworkDisplay = ctx.framework || 'Unknown';
  const projectDisplay = ctx.projectName || 'Unnamed Project';

  return `# Vercel Deployment Guide for ${projectDisplay}

Framework: ${frameworkDisplay} | Regenerate: \`vercel agents init --force\`

`;
}

export function renderDeploymentCommands(): string {
  return `## Commands

\`\`\`bash
vercel              # Deploy to preview
vercel --prod       # Deploy to production
vercel logs <url>   # View logs
vercel env pull     # Sync env vars locally
vercel rollback     # Rollback deployment
\`\`\`

`;
}

export function renderEnvironmentVariables(): string {
  return `## Environment Variables

- \`vercel env pull\` - sync locally
- \`vercel env add <name>\` - add variable
- Never commit \`.env.local\` files

`;
}

export function renderProjectConfig(ctx: ProjectContext): string {
  if (!ctx.vercelConfig) {
    return '';
  }

  const sections: string[] = ['## Project Config (from vercel.json)\n\n'];
  const config = ctx.vercelConfig;

  if (config.crons && config.crons.length > 0) {
    sections.push('**Crons:** ');
    sections.push(
      config.crons.map(c => `\`${c.path}\` @ \`${c.schedule}\``).join(', ')
    );
    sections.push('\n\n');
  }

  if (config.functions && Object.keys(config.functions).length > 0) {
    sections.push(
      `**Functions:** ${Object.keys(config.functions).length} custom config(s)\n\n`
    );
  }

  if (config.redirects && config.redirects.length > 0) {
    sections.push(`**Redirects:** ${config.redirects.length} rule(s)\n\n`);
  }

  if (config.rewrites && config.rewrites.length > 0) {
    sections.push(`**Rewrites:** ${config.rewrites.length} rule(s)\n\n`);
  }

  if (sections.length === 1) {
    return '';
  }

  return sections.join('');
}

export function renderFooter(): string {
  return `---
<!-- Add project-specific rules below -->
`;
}
