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
  '--tunnel': boolean;
  '--non-interactive': boolean;
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
  appPort?: number | number[];
  postCreateCommand?: string | string[];
  postStartCommand?: string | string[];
  containerEnv?: Record<string, string>;
  capAdd?: string[];
}

// Default devcontainer images by runtime
const DEFAULT_IMAGES: Record<string, string> = {
  node: 'mcr.microsoft.com/devcontainers/javascript-node:20',
  python: 'mcr.microsoft.com/devcontainers/python:3.11',
  go: 'mcr.microsoft.com/devcontainers/go:1.21',
  ruby: 'mcr.microsoft.com/devcontainers/ruby:3.2',
  default: 'mcr.microsoft.com/devcontainers/javascript-node:20',
};

// Default ports by framework
const DEFAULT_PORTS: Record<string, number> = {
  nextjs: 3000,
  nuxt: 3000,
  gatsby: 8000,
  vite: 5173,
  'create-react-app': 3000,
  remix: 3000,
  sveltekit: 5173,
  astro: 4321,
  django: 8000,
  flask: 5000,
  fastapi: 8000,
  express: 3000,
  default: 3000,
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
 * Detect the framework and default port
 */
async function detectFrameworkPort(cwd: string): Promise<number> {
  const packageJsonPath = join(cwd, 'package.json');
  if (await fs.pathExists(packageJsonPath)) {
    try {
      const pkg = await fs.readJson(packageJsonPath);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps['next']) return DEFAULT_PORTS['nextjs'];
      if (deps['nuxt']) return DEFAULT_PORTS['nuxt'];
      if (deps['gatsby']) return DEFAULT_PORTS['gatsby'];
      if (deps['vite']) return DEFAULT_PORTS['vite'];
      if (deps['react-scripts']) return DEFAULT_PORTS['create-react-app'];
      if (deps['@remix-run/dev']) return DEFAULT_PORTS['remix'];
      if (deps['@sveltejs/kit']) return DEFAULT_PORTS['sveltekit'];
      if (deps['astro']) return DEFAULT_PORTS['astro'];
      if (deps['express']) return DEFAULT_PORTS['express'];
    } catch {
      // Ignore parsing errors
    }
  }

  // Check for Python frameworks
  const requirementsPath = join(cwd, 'requirements.txt');
  if (await fs.pathExists(requirementsPath)) {
    try {
      const requirements = await fs.readFile(requirementsPath, 'utf-8');
      if (requirements.includes('django')) return DEFAULT_PORTS['django'];
      if (requirements.includes('flask')) return DEFAULT_PORTS['flask'];
      if (requirements.includes('fastapi')) return DEFAULT_PORTS['fastapi'];
    } catch {
      // Ignore parsing errors
    }
  }

  return DEFAULT_PORTS['default'];
}

/**
 * Find or create devcontainer.json
 */
async function findOrCreateDevContainerConfig(
  cwd: string
): Promise<{ path: string; config: DevContainerConfig; isNew: boolean }> {
  const possiblePaths = [
    join(cwd, '.devcontainer', 'devcontainer.json'),
    join(cwd, '.devcontainer.json'),
  ];

  // Try to find existing config
  for (const configPath of possiblePaths) {
    if (await fs.pathExists(configPath)) {
      try {
        const config = await fs.readJson(configPath);
        output.log(`Found existing devcontainer config: ${configPath}`);
        return { path: configPath, config, isNew: false };
      } catch (e) {
        output.warn(`Failed to parse devcontainer.json at ${configPath}`);
      }
    }
  }

  // Generate new config with sane defaults
  output.log('No devcontainer.json found, generating one...');

  const runtime = await detectRuntime(cwd);
  const port = await detectFrameworkPort(cwd);

  const config: DevContainerConfig = {
    name: 'Vercel Dev Container',
    image: DEFAULT_IMAGES[runtime],
    forwardPorts: [port],
    appPort: [port],
    features: {},
  };

  // Create .devcontainer directory
  const devcontainerDir = join(cwd, '.devcontainer');
  await fs.ensureDir(devcontainerDir);

  const configPath = join(devcontainerDir, 'devcontainer.json');
  return { path: configPath, config, isNew: true };
}

/**
 * Update devcontainer.json with required features
 */
async function updateDevContainerConfig(
  configPath: string,
  config: DevContainerConfig,
  port: number,
  functionUrl: string,
  featurePaths: { vercelCliPath: string; devconfeatPath: string }
): Promise<DevContainerConfig> {
  // Ensure features object exists
  config.features = config.features || {};

  // Add vercel-cli feature
  config.features[featurePaths.vercelCliPath] = {
    version: 'latest',
    envFile: '.env.development.local',
  };

  // Add devconfeat feature with tunneldAddr, localTarget, and vercelFunctionUrl
  // Convert localhost/loopback to host.docker.internal for container access
  config.features[featurePaths.devconfeatPath] = {
    tunneldAddr: convertToDockerHost(DEFAULT_TUNNELD_ADDR),
    localTarget: `127.0.0.1:${port}`,
    vercelFunctionUrl: functionUrl,
  };

  // Add port to forwardPorts if not already present
  config.forwardPorts = config.forwardPorts || [];
  if (!config.forwardPorts.includes(port)) {
    config.forwardPorts.push(port);
  }

  // Set appPort as array
  config.appPort = [port];

  // Ensure NET_ADMIN capability for devconfeat
  config.capAdd = config.capAdd || [];
  if (!config.capAdd.includes('NET_ADMIN')) {
    config.capAdd.push('NET_ADMIN');
  }

  // Write updated config
  await fs.writeJson(configPath, config, { spaces: 2 });
  output.log(`Updated devcontainer.json at ${configPath}`);

  return config;
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

  // Pull env records
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
  const lines: string[] = ['# Created by Vercel CLI (dev --tunnel)'];

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
      gitignore += '\n# Vercel dev tunnel env\n.env.development.local\n';
      await fs.writeFile(gitignorePath, gitignore);
      output.debug('Added .env.development.local to .gitignore');
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
  configPath: string
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

  return new Promise((resolve, reject) => {
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
          '/bin/bash',
        ];

        output.debug(`Running: devcontainer ${execArgs.join(' ')}`);

        const execProc = spawn('devcontainer', execArgs, {
          cwd,
          stdio: 'inherit',
        });

        execProc.on('close', execCode => {
          if (execCode === 0) {
            resolve();
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

/**
 * Get function URL from environment variable or deploy bridge
 * Returns the URL where the function/bridge is accessible
 */
async function getOrDeployFunctionUrl(): Promise<string> {
  // Check if VERCEL_FUNCTION_URL is set in environment
  const envFunctionUrl = process.env.VERCEL_FUNCTION_URL;
  if (envFunctionUrl) {
    output.debug(
      `Using VERCEL_FUNCTION_URL from environment: ${envFunctionUrl}`
    );
    return envFunctionUrl;
  }

  // TODO: Implement bridge deployment
  // When VERCEL_FUNCTION_URL is not set, we should:
  // 1. Deploy the bridge service to Vercel infrastructure
  // 2. Return the deployed URL
  // For now, fall back to default localhost URL
  output.warn(
    'VERCEL_FUNCTION_URL not set. Using default localhost:3000. ' +
      'Set VERCEL_FUNCTION_URL environment variable or bridge deployment will be implemented.'
  );

  return DEFAULT_FUNCTION_URL;
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

export default async function devTunnel(
  client: Client,
  opts: Partial<Options>,
  args: string[]
) {
  const [dir = '.'] = args;
  let cwd = resolve(dir);
  const listen = parseListen(opts['--listen'] || '3000');

  // Parse listen spec to get port
  const [portOrSocket] = listen;
  const port =
    typeof portOrSocket === 'number'
      ? portOrSocket
      : await detectFrameworkPort(cwd);

  // Interactive mode is default, use --non-interactive to opt out
  const nonInteractive = opts['--non-interactive'] === true;

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
      setupMsg: 'Set up and develop',
    });

    if (link.status === 'not_linked') {
      return 0;
    }
  }

  if (link.status === 'error') {
    if (link.reason === 'HEADLESS') {
      output.error(
        `Command ${getCommandName(
          'dev'
        )} requires confirmation. Use option ${param('--yes')} to confirm.`
      );
    }
    return link.exitCode;
  }

  if (link.status !== 'linked') {
    output.error('Project must be linked to use tunnel mode.');
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

  output.log(`Setting up dev tunnel for ${project.name}...`);

  // Find or create devcontainer.json
  const { path: configPath, config } =
    await findOrCreateDevContainerConfig(cwd);

  // Feature paths - using local references until officially published
  // TODO: Update to use published feature URLs once available
  // e.g., 'ghcr.io/vercel/devcontainer-features/vercel-cli:1'
  const featurePaths = {
    vercelCliPath: './vercel-cli',
    devconfeatPath: './devconfeat',
  };

  // Get function URL from env var or deploy bridge
  const functionUrl = await getOrDeployFunctionUrl();
  output.debug(`Using function URL: ${functionUrl}`);

  // Update devcontainer.json with required features
  await updateDevContainerConfig(
    configPath,
    config,
    port,
    functionUrl,
    featurePaths
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
    output.print('\n');
    output.log('  IntelliJ/JetBrains:');
    output.print('    Use "Dev Containers" plugin to open the project\n');
    output.print('\n');
    output.log('  Command line:');
    output.print(`    cd ${cwd}\n`);
    output.print('    devcontainer up --workspace-folder .\n');
    output.print('    devcontainer exec --workspace-folder . /bin/bash\n');
    output.print('\n');
  } else {
    // Interactive mode (default): use devcontainer CLI and exec into container
    try {
      await startAndExecDevContainer(cwd, configPath);
    } catch (err) {
      output.error(
        `Failed to start devcontainer: ${err instanceof Error ? err.message : String(err)}`
      );
      return 1;
    }
  }

  return 0;
}
