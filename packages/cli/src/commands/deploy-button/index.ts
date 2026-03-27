import { execSync } from 'node:child_process';
import { help } from '../help';
import { deployButtonCommand } from './command';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { ensureLink } from '../../util/link/ensure-link';
import { DeployButtonTelemetryClient } from '../../util/telemetry/commands/deploy-button';
import getEnvRecords from '../../util/env/get-env-records';
import { getResources } from '../../util/integration-resource/get-resources';
import type { Configuration } from '../../util/integration/types';

const GIT_PROVIDER_HOSTS: Record<string, string> = {
  github: 'https://github.com',
  gitlab: 'https://gitlab.com',
  bitbucket: 'https://bitbucket.org',
};

function buildRepoUrl(
  type: string,
  org: string | undefined,
  repo: string
): string | null {
  const host = GIT_PROVIDER_HOSTS[type];
  if (!host) return null;
  if (org) {
    return `${host}/${org}/${repo}`;
  }
  return `${host}/${repo}`;
}

interface RepoMeta {
  description: string;
  homepage: string;
  isPrivate: boolean;
}

async function fetchRepoMeta(
  type: string,
  repoOrg: string | undefined,
  repo: string
): Promise<RepoMeta | null> {
  if (!repoOrg) return null;
  try {
    let apiUrl: string;
    if (type === 'github') {
      apiUrl = `https://api.github.com/repos/${repoOrg}/${repo}`;
    } else if (type === 'gitlab') {
      apiUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${repoOrg}/${repo}`)}`;
    } else if (type === 'bitbucket') {
      apiUrl = `https://api.bitbucket.org/2.0/repositories/${repoOrg}/${repo}`;
    } else {
      return null;
    }
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'vercel-cli' },
    });
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      return { description: '', homepage: '', isPrivate: true };
    }
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;

    if (type === 'github') {
      return {
        description: (data.description as string) || '',
        homepage: (data.homepage as string) || '',
        isPrivate: data.private === true,
      };
    }
    if (type === 'gitlab') {
      return {
        description: (data.description as string) || '',
        homepage: ((data.external_url || data.web_url) as string) || '',
        isPrivate: data.visibility !== 'public',
      };
    }
    if (type === 'bitbucket') {
      return {
        description: (data.description as string) || '',
        homepage: (data.website as string) || '',
        isPrivate: data.is_private === true,
      };
    }
  } catch {
    // Non-critical; fall back to empty defaults
  }
  return null;
}

async function fetchOgImage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'vercel-cli' },
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const html = await res.text();
    const match =
      html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
      ) ||
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
      );
    return match?.[1] || '';
  } catch {
    return '';
  }
}

function copyToClipboard(text: string): boolean {
  try {
    const platform = process.platform;
    if (platform === 'darwin') {
      execSync('pbcopy', { input: text });
    } else if (platform === 'win32') {
      execSync('clip', { input: text });
    } else {
      execSync('xclip -selection clipboard', { input: text });
    }
    return true;
  } catch {
    return false;
  }
}

export default async function deployButton(client: Client): Promise<number> {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(deployButtonCommand.options);

  const telemetry = new DeployButtonTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('deploy-button');
    output.print(help(deployButtonCommand, { columns: client.stderr.columns }));
    return 0;
  }

  const copyFlag = !!parsedArgs.flags['--copy'];
  const markdownFlag = !!parsedArgs.flags['--markdown'];
  const autoConfirm = !!parsedArgs.flags['--yes'];

  telemetry.trackCliFlagCopy(parsedArgs.flags['--copy']);
  telemetry.trackCliFlagMarkdown(parsedArgs.flags['--markdown']);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);

  const link = await ensureLink('deploy-button', client, client.cwd, {
    autoConfirm,
  });

  if (typeof link === 'number') {
    return link;
  }

  if (link.status !== 'linked' || !link.org || !link.project) {
    output.error(
      'No linked project found. Run `vercel link` to link a project.'
    );
    return 1;
  }

  const { org, project } = link;

  if (!project.link) {
    output.error(
      'No Git repository connected to this project. Connect one with `vercel git connect`.'
    );
    return 1;
  }

  const repoUrl = buildRepoUrl(
    project.link.type,
    project.link.org,
    project.link.repo
  );
  if (!repoUrl) {
    output.error(
      `Unsupported Git provider "${project.link.type}". Deploy buttons support GitHub, GitLab, and Bitbucket.`
    );
    return 1;
  }

  output.spinner('Fetching project details…');

  const accountId = org.id;
  const repoMetaPromise = fetchRepoMeta(
    project.link.type,
    project.link.org,
    project.link.repo
  );
  const envKeys: string[] = [];

  try {
    const { envs } = await getEnvRecords(
      client,
      project.id,
      'vercel-cli:env:ls'
    );
    for (const env of envs) {
      if (!(env as unknown as Record<string, unknown>).contentHint) {
        envKeys.push(env.key);
      }
    }
  } catch {
    output.debug('Failed to fetch environment variables, skipping.');
  }

  type StoreEntry =
    | { type: 'blob' }
    | {
        type: 'integration';
        integrationSlug: string;
        productSlug: string;
        protocol: string;
      };

  let stores: StoreEntry[] = [];
  let integrationIds: { id: string; name: string }[] = [];

  try {
    const [resources, configurations] = await Promise.all([
      getResources(client),
      client.fetch<Configuration[]>(
        `/v2/integrations/configurations?view=account`,
        { accountId }
      ),
    ]);

    const projectResources = resources.filter(r =>
      r.projectsMetadata?.some(p => p.projectId === project.id)
    );

    const storeConfigIds = new Set<string>();
    const configMap = new Map<string, Configuration>();
    for (const config of configurations) {
      configMap.set(config.id, config);
    }

    const seen = new Set<string>();
    for (const r of projectResources) {
      if (r.type === 'blob') {
        if (!seen.has('blob')) {
          seen.add('blob');
          stores.push({ type: 'blob' });
        }
      } else if (r.type === 'integration' && r.product) {
        const configId = r.product.integrationConfigurationId;
        const productSlug = r.product.slug;
        const protocol = r.product.primaryProtocol;
        if (!configId || !productSlug || !protocol) continue;

        const cfg = configMap.get(configId);
        if (!cfg) continue;

        storeConfigIds.add(configId);

        const key = `${cfg.slug}/${productSlug}`;
        if (seen.has(key)) continue;
        seen.add(key);

        stores.push({
          type: 'integration',
          integrationSlug: cfg.slug,
          productSlug,
          protocol,
        });
      }
    }

    for (const config of configurations) {
      if (storeConfigIds.has(config.id)) continue;
      if (config.installationType !== 'marketplace') continue;

      const isProjectScoped =
        config.projectSelection === 'all' ||
        config.projects.includes(project.id);
      if (!isProjectScoped) continue;

      integrationIds.push({
        id: config.integrationId,
        name: config.integration?.name || config.slug,
      });
    }
  } catch {
    output.debug('Failed to fetch integration resources, skipping.');
  }

  const repoMeta = await repoMetaPromise;

  output.stopSpinner();

  if (repoMeta?.isPrivate) {
    output.error(
      'The linked repository is private. Deploy buttons only work with public repositories.'
    );
    return 1;
  }

  const repoName = project.link.repo || project.name;

  let demoTitle = '';
  let demoDescription = '';
  let demoUrl = '';
  let demoImage = '';

  if (client.stdin.isTTY) {
    demoTitle = await client.input.text({
      message: 'Demo title',
      default: project.name,
    });

    demoDescription = await client.input.text({
      message: 'Demo description',
      default: repoMeta?.description || undefined,
    });

    demoUrl = await client.input.text({
      message: 'Demo URL',
      default: repoMeta?.homepage || undefined,
    });

    let defaultImage: string | undefined;
    if (demoUrl) {
      output.spinner('Fetching OpenGraph image…');
      defaultImage = (await fetchOgImage(demoUrl)) || undefined;
      output.stopSpinner();
    }

    demoImage = await client.input.text({
      message: 'Demo image URL',
      default: defaultImage,
    });

    if (envKeys.length > 0) {
      const selectedEnvs = await client.input.checkbox<string>({
        message: 'Select environment variables to include',
        choices: envKeys.map(key => ({
          name: key,
          value: key,
          checked: true,
        })),
      });
      envKeys.length = 0;
      envKeys.push(...selectedEnvs);
    }

    if (stores.length > 0) {
      const selectedIndices = await client.input.checkbox<number>({
        message: 'Select stores to provision',
        choices: stores.map((s, i) => ({
          name:
            s.type === 'blob'
              ? 'Vercel Blob'
              : `${s.integrationSlug}/${s.productSlug} (${s.protocol})`,
          value: i,
          checked: true,
        })),
      });
      stores = selectedIndices.map(i => stores[i]);
    }

    if (integrationIds.length > 0) {
      const selectedIds = await client.input.checkbox<string>({
        message: 'Select integrations to require',
        choices: integrationIds.map(i => ({
          name: i.name,
          value: i.id,
          checked: false,
        })),
      });
      integrationIds = integrationIds.filter(i => selectedIds.includes(i.id));
    }
  } else {
    integrationIds = [];
  }

  const url = new URL('https://vercel.com/new/clone');
  url.searchParams.set('repository-url', repoUrl);
  url.searchParams.set('repository-name', repoName);

  if (envKeys.length > 0) {
    url.searchParams.set('env', envKeys.join(','));
  }
  if (stores.length > 0) {
    url.searchParams.set('stores', JSON.stringify(stores));
  }
  if (integrationIds.length > 0) {
    url.searchParams.set(
      'integration-ids',
      integrationIds.map(i => i.id).join(',')
    );
  }
  if (demoTitle) {
    url.searchParams.set('demo-title', demoTitle);
  }
  if (demoDescription) {
    url.searchParams.set('demo-description', demoDescription);
  }
  if (demoUrl) {
    url.searchParams.set('demo-url', demoUrl);
  }
  if (demoImage) {
    url.searchParams.set('demo-image', demoImage);
  }

  const deployUrl = url.toString();
  const markdown = `[![Deploy with Vercel](https://vercel.com/button)](${deployUrl})`;

  if (markdownFlag) {
    output.print(`${markdown}\n`);
  } else {
    output.log(`Deploy URL:\n`);
    output.print(`${deployUrl}\n\n`);
    output.log(`Markdown:\n`);
    output.print(`${markdown}\n`);
  }

  if (copyFlag) {
    if (copyToClipboard(markdownFlag ? markdown : deployUrl)) {
      output.success('Copied to clipboard!');
    } else {
      output.warn('Could not copy to clipboard. Please copy the URL manually.');
    }
  }

  return 0;
}
