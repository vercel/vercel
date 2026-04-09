import chalk from 'chalk';
import { frameworkList, type Framework } from '@vercel/frameworks';

/** Matches `display-services` / detected-services output. */
const frameworkColors: Record<string, (text: string) => string> = {
  nextjs: chalk.white,
  vite: chalk.magenta,
  nuxtjs: chalk.green,
  remix: chalk.cyan,
  astro: chalk.magenta,
  gatsby: chalk.magenta,
  svelte: chalk.red,
  sveltekit: chalk.red,
  solidstart: chalk.blue,
  angular: chalk.red,
  vue: chalk.green,
  ember: chalk.red,
  preact: chalk.magenta,
  fastapi: chalk.green,
  flask: chalk.cyan,
  express: chalk.yellow,
  nest: chalk.red,
  hono: chalk.yellowBright,
};

function resolveFramework(
  frameworkSlug: string | null | undefined,
  displayName?: string | null
): Framework | undefined {
  if (frameworkSlug != null && frameworkSlug !== '') {
    return frameworkList.find(f => f.slug === frameworkSlug);
  }
  if (displayName) {
    return frameworkList.find(f => f.name === displayName);
  }
  return undefined;
}

/**
 * Styled framework label for terminal output (matches project settings + service detection UX).
 */
export function formatFrameworkLabel(
  frameworkSlug: string | null | undefined,
  displayName?: string | null
): string {
  const fw = resolveFramework(frameworkSlug, displayName);
  const label = fw?.name ?? displayName ?? frameworkSlug;
  if (!label) {
    return chalk.dim('—');
  }

  const slug = fw?.slug ?? frameworkSlug ?? undefined;

  if (fw?.name === 'Hono' || label === 'Hono') {
    return chalk.bold(chalk.hex('#FFA500')(`🔥 ${fw?.name ?? label}`));
  }

  if (slug === 'nextjs') {
    return chalk.bold(chalk.white(`▲ ${fw?.name ?? label}`));
  }

  if (slug != null && slug !== '') {
    const colorFn = frameworkColors[slug] ?? chalk.blue;
    return chalk.bold(colorFn(fw?.name ?? label));
  }

  return chalk.bold(chalk.blue(label));
}

export function formatFrameworkLabelFromFramework(fw: Framework): string {
  return formatFrameworkLabel(fw.slug, fw.name);
}
