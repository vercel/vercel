import type { ProjectContext } from '../types';
import {
  renderHeader,
  renderDeploymentCommands,
  renderEnvironmentVariables,
  renderProjectConfig,
  renderFooter,
} from './base';
import { renderFrameworkSection } from './frameworks';
import { renderServicesSection } from './services';

export function renderMarkdownContent(ctx: ProjectContext): string {
  const sections = [
    renderHeader(ctx),
    renderDeploymentCommands(),
    renderFrameworkSection(ctx.framework),
    renderProjectConfig(ctx),
    renderEnvironmentVariables(),
    renderServicesSection(),
    renderFooter(),
  ];

  return sections.filter(Boolean).join('\n');
}

export function renderCursorrulesContent(ctx: ProjectContext): string {
  // .cursorrules uses the same markdown content but without HTML comments
  let content = renderMarkdownContent(ctx);

  // Remove HTML comments
  content = content.replace(/<!--[\s\S]*?-->/g, '');

  // Clean up extra newlines
  content = content.replace(/\n{3,}/g, '\n\n');

  return content.trim() + '\n';
}

export function renderCopilotContent(ctx: ProjectContext): string {
  // GitHub Copilot instructions use the same format as markdown
  return renderMarkdownContent(ctx);
}
