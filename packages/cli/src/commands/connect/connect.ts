import { join, resolve } from 'path';
import { execSync, spawn } from 'child_process';
import fs from 'fs-extra';

import type Client from '../../util/client';
import { getLinkedProject } from '../../util/projects/link';
import setupAndLink from '../../util/link/setup-and-link';
import { getCommandName } from '../../util/pkg-name';
import param from '../../util/output/param';
import { pullEnvRecords } from '../../util/env/get-env-records';
import output from '../../output-manager';
import { readAuthConfigFile } from '../../util/config/files';
import { parseListen } from '../../util/dev/parse-listen';

type Options = {
  '--listen': string;
  '--yes': boolean;
  '--dev': boolean;
  '--non-interactive': boolean;
  '--forward-domains': string;
};

// Default function URL for local development
const DEFAULT_FUNCTION_URL = 'localhost:3000';

// TODO: Make tunneld address configurable via flag or env var
const DEFAULT_TUNNELD_ADDR = 'http://localhost:18443';

/**
 * Convert localhost/loopback addresses to host.docker.internal for use inside containers
 */
function convertToDockerHost(addr: string): string {
  // Match localhost or loopback addresses (127.x.x.x) with optional protocol
  const localhostPattern =
    /^(https?:\/\/)?(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/;
  const match = addr.match(localhostPattern);
  if (match) {
    const protocol = match[1] || '';
    const port = match[3] || '';
    return `${protocol}host.docker.internal${port}`;
  }
  return addr;
}

interface DevContainerConfig {
  name?: string;
  image?: string;
  build?: {
    dockerfile?: string;
    context?: string;
  };
  features?: Record<string, Record<string, unknown>>;
  forwardPorts?: number[];
  appPort?: number[];
  postCreateCommand?: string | string[];
  postStartCommand?: string | string[];
  containerEnv?: Record<string, string>;
  capAdd?: string[];
}

// Default port for the devcontainer
const DEFAULT_PORT = 3000;

// Default devcontainer images by runtime
const DEFAULT_IMAGES: Record<string, string> = {
  node: 'mcr.microsoft.com/devcontainers/javascript-node:20',
  python: 'mcr.microsoft.com/devcontainers/python:3.11',
  go: 'mcr.microsoft.com/devcontainers/go:1.21',
  ruby: 'mcr.microsoft.com/devcontainers/ruby:3.2',
  default: 'mcr.microsoft.com/devcontainers/javascript-node:20',
};

// Map Vercel framework slugs to runtime types
const FRAMEWORK_TO_RUNTIME: Record<string, string> = {
  // Node.js frameworks
  nextjs: 'node',
  gatsby: 'node',
  remix: 'node',
  nuxtjs: 'node',
  vite: 'node',
  svelte: 'node',
  sveltekit: 'node',
  astro: 'node',
  solidstart: 'node',
  qwik: 'node',
  angular: 'node',
  ember: 'node',
  vue: 'node',
  preact: 'node',
  'create-react-app': 'node',
  hexo: 'node',
  eleventy: 'node',
  docusaurus: 'node',
  hugo: 'node',
  jekyll: 'ruby',
  brunch: 'node',
  middleman: 'ruby',
  zola: 'node',
  hydrogen: 'node',
  blitzjs: 'node',
  redwoodjs: 'node',
  // Python frameworks
  django: 'python',
  flask: 'python',
  fastapi: 'python',
  // Go frameworks
  go: 'go',
  // Ruby frameworks
  ruby: 'ruby',
};

/**
 * Detect the runtime from package.json or other project files
 */
async function detectRuntime(cwd: string): Promise<string> {
  // Check for package.json (Node.js)
  if (await fs.pathExists(join(cwd, 'package.json'))) {
    return 'node';
  }
  // Check for requirements.txt or pyproject.toml (Python)
  if (
    (await fs.pathExists(join(cwd, 'requirements.txt'))) ||
    (await fs.pathExists(join(cwd, 'pyproject.toml')))
  ) {
    return 'python';
  }
  // Check for go.mod (Go)
  if (await fs.pathExists(join(cwd, 'go.mod'))) {
    return 'go';
  }
  // Check for Gemfile (Ruby)
  if (await fs.pathExists(join(cwd, 'Gemfile'))) {
    return 'ruby';
  }
  return 'default';
}

/**
 * Get runtime from framework slug or detect from project files
 */
async function getRuntimeForProject(
  cwd: string,
  framework: string | null | undefined
): Promise<string> {
  // First try to use the framework from the API
  if (framework && FRAMEWORK_TO_RUNTIME[framework]) {
    output.debug(
      `Using runtime from API framework: ${framework} -> ${FRAMEWORK_TO_RUNTIME[framework]}`
    );
    return FRAMEWORK_TO_RUNTIME[framework];
  }

  // Fall back to local file detection
  output.debug(
    'No API framework found, detecting runtime from project files...'
  );
  return detectRuntime(cwd);
}

/**
 * Create a project-specific devcontainer config in .devcontainer/<project-name>/
 * If an existing .devcontainer/devcontainer.json exists, it will be used as a base
 * with paths adjusted to reference the parent directory.
 * If no config exists, a new one will be created.
 */
async function createProjectDevContainer(
  cwd: string,
  projectName: string,
  port: number,
  functionUrl: string,
  framework: string | null | undefined,
  forwardDomains: string[] | undefined
): Promise<{ path: string; config: DevContainerConfig }> {
  const projectDevcontainerDir = join(cwd, '.devcontainer', projectName);
  await fs.ensureDir(projectDevcontainerDir);

  const configPath = join(projectDevcontainerDir, 'devcontainer.json');
  const existingConfigPath = join(cwd, '.devcontainer', 'devcontainer.json');

  // Start with existing config or create a new one
  let config: DevContainerConfig;

  if (await fs.pathExists(existingConfigPath)) {
    // Copy existing devcontainer.json as base
    output.debug(
      `Using existing devcontainer config from ${existingConfigPath}`
    );
    try {
      config = await fs.readJson(existingConfigPath);

      // Adjust build paths to reference parent directory (since we're in a subdirectory now)
      if (config.build) {
        if (config.build.dockerfile) {
          config.build.dockerfile = `../${config.build.dockerfile}`;
          output.debug(
            `Adjusted dockerfile path to: ${config.build.dockerfile}`
          );
        }
        if (config.build.context) {
          config.build.context = `../${config.build.context}`;
          output.debug(`Adjusted context path to: ${config.build.context}`);
        }
      }
    } catch (err) {
      output.warn(
        `Failed to read existing devcontainer.json, creating new config`
      );
      config = {};
    }
  } else {
    // Create new config with default image based on runtime
    const runtime = await getRuntimeForProject(cwd, framework);
    output.debug(
      `Selected runtime: ${runtime} -> image: ${DEFAULT_IMAGES[runtime]}`
    );
    config = {
      image: DEFAULT_IMAGES[runtime],
    };
  }

  // Set name for this connect config
  config.name = `Vercel Connect - ${projectName}`;

  // Merge connect features into existing features
  const devconfeatConfig: Record<string, unknown> = {
    tunneldAddr: convertToDockerHost(DEFAULT_TUNNELD_ADDR),
    localTarget: `127.0.0.1:${port}`,
    vercelFunctionUrl: functionUrl,
  };

  if (forwardDomains && forwardDomains.length > 0) {
    devconfeatConfig.forwardDomains = forwardDomains.join(',');
  }

  config.features = {
    ...config.features,
    'ghcr.io/vercel-eddie/vercel-bridge/vercel-cli:latest': {
      envFile: '.env.development.local',
    },
    'ghcr.io/vercel-eddie/vercel-bridge/devconfeat:latest': devconfeatConfig,
  };

  // Ensure port is forwarded (merge with existing)
  const existingForwardPorts = config.forwardPorts || [];
  if (!existingForwardPorts.includes(port)) {
    config.forwardPorts = [...existingForwardPorts, port];
  }

  // Ensure appPort includes the port (merge with existing)
  const existingAppPorts = config.appPort || [];
  if (!existingAppPorts.includes(port)) {
    config.appPort = [...existingAppPorts, port];
  }

  // Ensure NET_ADMIN capability is added (merge with existing)
  const existingCapAdd = config.capAdd || [];
  if (!existingCapAdd.includes('NET_ADMIN')) {
    config.capAdd = [...existingCapAdd, 'NET_ADMIN'];
  }

  // Write the config
  await fs.writeJson(configPath, config, { spaces: 2 });
  output.log(`Created devcontainer config at ${configPath}`);

  return { path: configPath, config };
}

/**
 * Pull environment variables and add VERCEL_TOKEN
 */
async function pullEnvAndAddToken(
  client: Client,
  projectId: string,
  cwd: string
): Promise<void> {
  const envFilePath = join(cwd, '.env.development.local');

  output.log('Pulling environment variables...');

  // Pull env records (use 'vercel-cli:dev' as source since connect is similar)
  const records = (await pullEnvRecords(client, projectId, 'vercel-cli:dev'))
    .env;

  // Get the user's auth token
  let vercelToken: string | undefined;
  try {
    const authConfig = readAuthConfigFile();
    vercelToken = authConfig.token;
  } catch {
    output.warn('Could not read auth config to get VERCEL_TOKEN');
  }

  // Build env file contents
  const lines: string[] = ['# Created by Vercel CLI (connect)'];

  // Add VERCEL_TOKEN from auth config, overriding any existing value in records
  if (vercelToken) {
    records['VERCEL_TOKEN'] = vercelToken;
    output.debug('Added VERCEL_TOKEN to env file');
  } else if (!records['VERCEL_TOKEN']) {
    output.warn(
      'No VERCEL_TOKEN found. You may need to run `vercel login` first.'
    );
  }

  for (const [key, value] of Object.entries(records)) {
    lines.push(`${key}="${escapeEnvValue(value)}"`);
  }

  // Write env file
  await fs.writeFile(envFilePath, lines.join('\n') + '\n', 'utf-8');
  output.log(`Created ${envFilePath}`);

  // Add to .gitignore
  const gitignorePath = join(cwd, '.gitignore');
  try {
    let gitignore = '';
    if (await fs.pathExists(gitignorePath)) {
      gitignore = await fs.readFile(gitignorePath, 'utf-8');
    }
    if (!gitignore.includes('.env.development.local')) {
      gitignore += '\n# Vercel connect env\n.env.development.local\n';
      await fs.writeFile(gitignorePath, gitignore);
      output.debug('Added .env.development.local to .gitignore');
    }
    // Also add .devcontainer to gitignore
    if (!gitignore.includes('.devcontainer')) {
      gitignore += '\n# Vercel connect devcontainers\n.devcontainer/\n';
      await fs.writeFile(gitignorePath, gitignore);
      output.debug('Added .devcontainer/ to .gitignore');
    }
  } catch {
    output.debug('Could not update .gitignore');
  }
}

function escapeEnvValue(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * Start the devcontainer and exec into it (interactive mode)
 */
async function startAndExecDevContainer(
  cwd: string,
  configPath: string,
  startDev: boolean
): Promise<void> {
  output.log('Starting devcontainer...');

  // Use devcontainer CLI to start the container
  const upArgs = [
    'up',
    '--workspace-folder',
    cwd,
    '--config',
    configPath,
    '--remove-existing-container',
  ];

  output.debug(`Running: devcontainer ${upArgs.join(' ')}`);

  return new Promise((resolvePromise, reject) => {
    const proc = spawn('devcontainer', upArgs, {
      cwd,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      output.debug(data.toString().trim());
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const str = data.toString();
      stderr += str;
      // Only show errors, not progress
      if (str.includes('error') || str.includes('Error')) {
        output.error(str.trim());
      }
    });

    proc.on('close', code => {
      if (code === 0) {
        output.success('Devcontainer started successfully');

        // Now exec into the container
        output.log('Connecting to devcontainer...');

        const execArgs = [
          'exec',
          '--workspace-folder',
          cwd,
          '--config',
          configPath,
          ...(startDev ? ['/bin/bash', '-c', 'vc dev'] : ['/bin/bash']),
        ];

        output.debug(`Running: devcontainer ${execArgs.join(' ')}`);

        const execProc = spawn('devcontainer', execArgs, {
          cwd,
          stdio: 'inherit',
        });

        execProc.on('close', execCode => {
          if (execCode === 0) {
            resolvePromise();
          } else {
            reject(new Error(`devcontainer exec exited with code ${execCode}`));
          }
        });

        execProc.on('error', err => {
          reject(new Error(`Failed to exec into devcontainer: ${err.message}`));
        });
      } else {
        output.error(`Devcontainer failed to start (exit code ${code})`);
        output.debug(stderr);
        reject(new Error(`devcontainer up failed with exit code ${code}`));
      }
    });

    proc.on('error', err => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        output.error(
          'devcontainer CLI not found. Please install it with: npm install -g @devcontainers/cli'
        );
      } else {
        output.error(`Failed to start devcontainer: ${err.message}`);
      }
      reject(err);
    });
  });
}

// Bridge repo configuration
const BRIDGE_REPO = 'vercel/bridge';
const BRIDGE_DIRECTORY = 'services/bridge';
const BRIDGE_REF = 'main';

/**
 * Search for a GitHub repository through Vercel's API
 * This works for private repos that the user has access to via Vercel's GitHub integration
 */
async function searchGitHubRepo(
  client: Client,
  repo: string
): Promise<{ id: number; defaultBranch: string }> {
  // Use Vercel's git namespace search API to find the repo
  const [owner, repoName] = repo.split('/');

  // First, get the git namespaces (organizations/users the user has access to)
  // Note: useCurrentTeam: false is required because this endpoint doesn't support teamId
  const namespacesResponse = await client.fetch<
    | { namespaces: Array<{ id: number; name: string; slug: string }> }
    | Array<{ id: number; name: string; slug: string }>
  >('/v1/integrations/git-namespaces?provider=github', {
    useCurrentTeam: false,
  });

  // Handle both response formats (array or object with namespaces property)
  const namespaces = Array.isArray(namespacesResponse)
    ? namespacesResponse
    : namespacesResponse.namespaces;

  output.debug(`Found ${namespaces?.length ?? 0} git namespaces`);

  if (!namespaces || namespaces.length === 0) {
    throw new Error(
      'No GitHub namespaces found. Make sure you have connected your GitHub account to Vercel.'
    );
  }

  // Find the namespace for the owner
  const namespace = namespaces.find(
    ns => ns.slug.toLowerCase() === owner.toLowerCase()
  );

  if (!namespace) {
    output.debug(
      `Available namespaces: ${namespaces.map(ns => ns.slug).join(', ')}`
    );
    throw new Error(
      `GitHub organization "${owner}" not found. Make sure you have access to the Vercel GitHub integration.`
    );
  }

  output.debug(`Found namespace: ${namespace.slug} (id: ${namespace.id})`);

  // Search for repos in that namespace
  const reposResponse = await client.fetch<
    | { repos: Array<{ id: number; name: string; defaultBranch: string }> }
    | Array<{ id: number; name: string; defaultBranch: string }>
  >(
    `/v1/integrations/search-repo?provider=github&namespaceId=${namespace.id}&query=${encodeURIComponent(repoName)}`,
    { useCurrentTeam: false }
  );

  // Handle both response formats
  const repos = Array.isArray(reposResponse)
    ? reposResponse
    : reposResponse.repos;

  output.debug(`Found ${repos?.length ?? 0} repos matching "${repoName}"`);

  if (!repos || repos.length === 0) {
    throw new Error(
      `Repository "${repo}" not found. Make sure you have access to it via Vercel's GitHub integration.`
    );
  }

  const foundRepo = repos.find(
    r => r.name.toLowerCase() === repoName.toLowerCase()
  );

  if (!foundRepo) {
    output.debug(`Available repos: ${repos.map(r => r.name).join(', ')}`);
    throw new Error(
      `Repository "${repo}" not found. Make sure you have access to it via Vercel's GitHub integration.`
    );
  }

  output.debug(`Found repo: ${foundRepo.name} (id: ${foundRepo.id})`);
  return { id: foundRepo.id, defaultBranch: foundRepo.defaultBranch };
}

/**
 * Deploy the bridge service to the user's project
 * Creates a preview deployment using the bridge repo as source
 */
async function deployBridgeService(
  client: Client,
  projectId: string,
  projectName: string
): Promise<string> {
  output.log('Deploying bridge service...');
  output.spinner('Fetching bridge repository info', 0);

  try {
    // Get the GitHub repo ID for the bridge repo via Vercel's API
    const repoInfo = await searchGitHubRepo(client, BRIDGE_REPO);
    output.debug(`Bridge repo ID: ${repoInfo.id}`);

    output.spinner('Creating bridge deployment', 0);

    // Create a deployment using git source from the bridge repo
    // Note: Don't specify target to create a preview deployment by default
    const deployment = await client.fetch<{
      id: string;
      url: string;
      readyState: string;
    }>('/v13/deployments', {
      method: 'POST',
      body: {
        name: projectName,
        project: projectId,
        gitSource: {
          type: 'github',
          repoId: repoInfo.id,
          ref: BRIDGE_REF,
          projectRootDirectory: BRIDGE_DIRECTORY,
        },
        meta: {
          action: 'bridge-connect',
        },
      },
    });

    output.stopSpinner();
    output.debug(`Bridge deployment created: ${deployment.id}`);

    // Wait for deployment to be ready
    if (deployment.readyState !== 'READY') {
      output.spinner('Building bridge service', 0);

      // Poll for deployment status
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

        const status = await client.fetch<{
          readyState: string;
          url: string;
        }>(`/v13/deployments/${deployment.id}`);

        if (status.readyState === 'READY') {
          output.stopSpinner();
          output.success(`Bridge deployed: https://${status.url}`);
          return `https://${status.url}`;
        }

        if (status.readyState === 'ERROR' || status.readyState === 'CANCELED') {
          output.stopSpinner();
          throw new Error(`Bridge deployment failed: ${status.readyState}`);
        }

        attempts++;
      }

      output.stopSpinner();
      throw new Error('Bridge deployment timed out');
    }

    output.success(`Bridge deployed: https://${deployment.url}`);
    return `https://${deployment.url}`;
  } catch (err) {
    output.stopSpinner();
    throw err;
  }
}

/**
 * Get function URL from environment variable or deploy bridge
 * Returns the URL where the function/bridge is accessible
 */
async function getOrDeployFunctionUrl(
  client: Client,
  projectId: string,
  projectName: string
): Promise<string> {
  // Check if VERCEL_FUNCTION_URL is set in environment
  const envFunctionUrl = process.env.VERCEL_FUNCTION_URL;
  if (envFunctionUrl) {
    output.debug(
      `Using VERCEL_FUNCTION_URL from environment: ${envFunctionUrl}`
    );
    return envFunctionUrl;
  }

  // Deploy the bridge service
  try {
    return await deployBridgeService(client, projectId, projectName);
  } catch (err) {
    output.warn(
      `Failed to deploy bridge service: ${err instanceof Error ? err.message : String(err)}`
    );
    output.warn(
      'Falling back to localhost. Set VERCEL_FUNCTION_URL to use a custom bridge URL.'
    );
    return DEFAULT_FUNCTION_URL;
  }
}

/**
 * Check if devcontainer CLI is installed
 */
function checkDevContainerCli(): boolean {
  try {
    execSync('devcontainer --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export default async function connect(
  client: Client,
  opts: Partial<Options>,
  args: string[]
) {
  const [dir = '.'] = args;
  let cwd = resolve(dir);
  const listen = parseListen(opts['--listen'] || '3000');

  // Parse listen spec to get port (use DEFAULT_PORT if socket path is provided)
  const [portOrSocket] = listen;
  const port = typeof portOrSocket === 'number' ? portOrSocket : DEFAULT_PORT;

  // Interactive mode is default, use --non-interactive to opt out
  const nonInteractive = opts['--non-interactive'] === true;
  const startDev = opts['--dev'] === true;

  // Parse forward domains from comma-separated string
  const forwardDomains = opts['--forward-domains']
    ? opts['--forward-domains']
        .split(',')
        .map(d => d.trim())
        .filter(Boolean)
    : undefined;

  // Check for devcontainer CLI unless non-interactive mode
  if (!nonInteractive && !checkDevContainerCli()) {
    output.error('devcontainer CLI is required. Install it with:');
    output.print('  npm install -g @devcontainers/cli\n');
    output.log(
      '\nAlternatively, run with --non-interactive to just set up the devcontainer files.'
    );
    return 1;
  }

  // Link project
  let link = await getLinkedProject(client, cwd);

  if (link.status === 'not_linked' && !process.env.__VERCEL_SKIP_DEV_CMD) {
    link = await setupAndLink(client, cwd, {
      autoConfirm: opts['--yes'],
      link,
      successEmoji: 'link',
      setupMsg: 'Set up and connect',
    });

    if (link.status === 'not_linked') {
      return 0;
    }
  }

  if (link.status === 'error') {
    if (link.reason === 'HEADLESS') {
      output.error(
        `Command ${getCommandName(
          'connect'
        )} requires confirmation. Use option ${param('--yes')} to confirm.`
      );
    }
    return link.exitCode;
  }

  if (link.status !== 'linked') {
    output.error('Project must be linked to use connect.');
    return 1;
  }

  const { project, org } = link;

  // If repo linked, update `cwd` to the repo root
  if (link.repoRoot) {
    cwd = link.repoRoot;
  }

  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  if (project.rootDirectory) {
    cwd = join(cwd, project.rootDirectory);
  }

  output.log(`Setting up connection for ${project.name}...`);

  // Get function URL from env var or deploy bridge
  const functionUrl = await getOrDeployFunctionUrl(
    client,
    project.id,
    project.name
  );
  output.debug(`Using function URL: ${functionUrl}`);

  // Update devcontainer config in-place
  const { path: configPath } = await createProjectDevContainer(
    cwd,
    project.name,
    port,
    functionUrl,
    project.framework,
    forwardDomains
  );

  // Pull environment variables and add VERCEL_TOKEN
  await pullEnvAndAddToken(client, project.id, cwd);

  if (nonInteractive) {
    // Non-interactive mode: just print instructions
    output.success('Devcontainer configuration complete!');
    output.print('\n');
    output.log('You can now connect to the devcontainer using:');
    output.print('\n');
    output.log('  VSCode:');
    output.print(
      '    Open the folder in VSCode and use "Dev Containers: Reopen in Container"\n'
    );
    output.print(`    Select the "${project.name}" configuration\n`);
    output.print('\n');
    output.log('  IntelliJ/JetBrains:');
    output.print('    Use "Dev Containers" plugin to open the project\n');
    output.print('\n');
    output.log('  Command line:');
    output.print(`    cd ${cwd}\n`);
    output.print(
      `    devcontainer up --workspace-folder . --config ${configPath}\n`
    );
    output.print(
      `    devcontainer exec --workspace-folder . --config ${configPath} /bin/bash\n`
    );
    output.print('\n');
  } else {
    // Interactive mode (default): use devcontainer CLI and exec into container
    try {
      await startAndExecDevContainer(cwd, configPath, startDev);
    } catch (err) {
      output.error(
        `Failed to start devcontainer: ${err instanceof Error ? err.message : String(err)}`
      );
      return 1;
    }
  }

  return 0;
}
