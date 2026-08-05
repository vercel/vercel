/**
 * Vercel deployment hosts. Preview and production deployments both land on
 * `*.vercel.app`; a custom domain is only ever aliased to one, so the generated
 * URL is what a session can reliably observe.
 */
const DEPLOYMENT_URL = /https:\/\/[a-z0-9][a-z0-9-]*\.vercel\.app\b/gi;

/** The dashboard URL a deploy prints alongside the deployment itself. */
const INSPECT_URL =
  /https:\/\/vercel\.com\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9]+\b/gi;

/**
 * Commands that create a deployment.
 *
 * `vercel` with no subcommand deploys, which is why a bare invocation counts.
 * Matching the command rather than scanning every tool result is what keeps a
 * URL the agent merely listed or read from documentation out of the summary.
 */
const DEPLOY_COMMAND =
  /(^|[\s;&|(])(vercel|vc)(\s+deploy\b|\s+redeploy\b|(?!\s+[a-z]).*)/i;

/** Flags that mean the deployment is the production one. */
const PRODUCTION_FLAG = /\s(--prod\b|--target[= ]production\b)/i;

export interface ObservedDeployment {
  url: string;
  /** Dashboard URL for the same deployment, when the command printed one. */
  inspectUrl?: string;
  production: boolean;
}

/**
 * Collects the deployments a session created.
 *
 * The agent runs `vercel deploy` inside a tool call, so the URL exists only in
 * that command's output. Without capturing it the run ends having deployed
 * something the user then has to go and find, which is the one piece of
 * information the whole session was for.
 */
export class DeploymentTracker {
  private readonly seen = new Map<string, ObservedDeployment>();

  /**
   * Inspect one finished tool call.
   *
   * `command` is the shell command that ran, or undefined for tools that are
   * not shell commands, which cannot deploy.
   */
  observe(command: string | undefined, output: string): void {
    if (!command || !DEPLOY_COMMAND.test(command)) {
      return;
    }

    const urls = match(output, DEPLOYMENT_URL);
    if (urls.length === 0) {
      return;
    }

    const [inspectUrl] = match(output, INSPECT_URL);
    const production = PRODUCTION_FLAG.test(command);

    for (const url of urls) {
      // A deploy prints its URL more than once, and a later mention may be the
      // one carrying the inspect link, so an existing entry is filled in rather
      // than replaced.
      const existing = this.seen.get(url);
      if (existing) {
        existing.inspectUrl ??= inspectUrl;
        existing.production ||= production;
        continue;
      }
      this.seen.set(url, {
        url,
        ...(inspectUrl ? { inspectUrl } : {}),
        production,
      });
    }
  }

  /** Every deployment observed, in the order it first appeared. */
  list(): ObservedDeployment[] {
    return [...this.seen.values()];
  }

  /**
   * The deployment worth showing when only one can be.
   *
   * The last one created, since a session that deploys twice does so because
   * the first attempt was wrong.
   */
  latest(): ObservedDeployment | undefined {
    return this.list().at(-1);
  }
}

function match(text: string, pattern: RegExp): string[] {
  // `matchAll` needs a fresh lastIndex; the patterns are module-level and
  // global, so they are shared across calls.
  pattern.lastIndex = 0;
  return [...new Set(text.match(pattern) ?? [])];
}
