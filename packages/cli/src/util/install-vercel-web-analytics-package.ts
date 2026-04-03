import { dirname } from 'path';
import execa from 'execa';
import { scanParentDirs, type CliType } from '@vercel/build-utils';

export const VERCEL_WEB_ANALYTICS_PACKAGE = '@vercel/analytics';

const ANALYTICS_QUICKSTART_URL = 'https://vercel.com/docs/analytics/quickstart';

/** Human- and agent-oriented hint aligned with the dashboard quickstart. */
export const WEB_ANALYTICS_INTEGRATE_HINT =
  'Add the Analytics component to your app root (for Next.js App Router: import { Analytics } from "@vercel/analytics/next" in app/layout.tsx and render <Analytics />). See the quickstart for other frameworks.';

export type WebAnalyticsPackageInstallResult = {
  ran: boolean;
  success: boolean;
  command?: string;
  error?: string;
};

function getAddInvocation(
  cliType: CliType,
  packageName: string
): { bin: string; args: string[] } | null {
  switch (cliType) {
    case 'npm':
      return { bin: 'npm', args: ['install', packageName] };
    case 'yarn':
      return { bin: 'yarn', args: ['add', packageName] };
    case 'pnpm':
      return { bin: 'pnpm', args: ['add', packageName] };
    case 'bun':
      return { bin: 'bun', args: ['add', packageName] };
    default:
      return null;
  }
}

/**
 * Installs `@vercel/analytics` from the directory that contains the resolved
 * package.json (same discovery rules as builds).
 */
export async function installVercelWebAnalyticsPackage(options: {
  cwd: string;
  /** When true, hide child process stdio (e.g. non-interactive / agents). */
  pipeStdio: boolean;
}): Promise<WebAnalyticsPackageInstallResult> {
  const { cwd, pipeStdio } = options;
  const { cliType, packageJsonPath } = await scanParentDirs(cwd);
  if (!packageJsonPath) {
    return {
      ran: true,
      success: false,
      error:
        'No package.json found in this directory or parent folders. Run this command from your app root or install @vercel/analytics manually.',
    };
  }
  const invocation = getAddInvocation(cliType, VERCEL_WEB_ANALYTICS_PACKAGE);
  if (!invocation) {
    return {
      ran: true,
      success: false,
      error: `Automatic install is not supported for package manager "${cliType}". Add ${VERCEL_WEB_ANALYTICS_PACKAGE} manually (see ${ANALYTICS_QUICKSTART_URL}).`,
    };
  }
  const installCwd = dirname(packageJsonPath);
  const command = `${invocation.bin} ${invocation.args.join(' ')}`;
  try {
    await execa(invocation.bin, invocation.args, {
      cwd: installCwd,
      stdio: pipeStdio ? 'pipe' : 'inherit',
    });
    return { ran: true, success: true, command };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ran: true, success: false, command, error: message };
  }
}

export function webAnalyticsIntegratePayloadForJson(): {
  summary: string;
  docsUrl: string;
  nextExample: string;
} {
  return {
    summary: WEB_ANALYTICS_INTEGRATE_HINT,
    docsUrl: ANALYTICS_QUICKSTART_URL,
    nextExample:
      'import { Analytics } from "@vercel/analytics/next";\n\n// In app/layout.tsx:\nexport default function RootLayout({ children }) {\n  return (\n    <html lang="en">\n      <body>{children}<Analytics /></body>\n    </html>\n  );\n}',
  };
}
