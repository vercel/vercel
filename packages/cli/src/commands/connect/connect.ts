import { basename, join, relative, resolve } from 'path';
import { execSync, spawn } from 'child_process';
import fs from 'fs-extra';

import type Client from '../../util/client';
import type { ProjectLinked } from '@vercel-internals/types';
import { getLinkedProject } from '../../util/projects/link';
import setupAndLink from '../../util/link/setup-and-link';
import { getCommandName } from '../../util/pkg-name';
import param from '../../util/output/param';
import { pullEnvRecords } from '../../util/env/get-env-records';
import output from '../../output-manager';
import { readAuthConfigFile } from '../../util/config/files';
import { parseListen } from '../../util/dev/parse-listen';
import { addToGitIgnore } from '../../util/link/add-to-gitignore';
import { getOrCreateDeploymentProtectionToken } from '../curl/bypass-token';
import { provisionSandbox } from './sandbox';

type Options = {
  '--listen': string;
  '--yes': boolean;
  '--dev': boolean;
  '--ide': boolean;
  '--forward-domains': string;
  '--bridge-version': string;
};

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
  mounts?: (string | { source: string; target: string; type: string })[];
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
  sandboxUrl: string,
  framework: string | null | undefined,
  bridgeVersion: string,
  containerWorkspace: string,
  forwardDomains?: string
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
      // devcontainer.json uses JSONC (JSON with Comments) format,
      // so we strip comments before parsing to avoid losing the original config
      const raw = await fs.readFile(existingConfigPath, 'utf-8');
      config = JSON.parse(stripJsonComments(raw));

      // Adjust build paths since we're in a subdirectory now
      // Default context is "." and default dockerfile is "Dockerfile"
      // From the subdirectory, we need to prefix with "../" to reference the parent
      if (config.build) {
        config.build.context = config.build.context
          ? `../${config.build.context}`
          : '..';
        config.build.dockerfile = config.build.dockerfile
          ? `../${config.build.dockerfile}`
          : '../Dockerfile';
        output.debug(
          `Adjusted build paths - context: ${config.build.context}, dockerfile: ${config.build.dockerfile}`
        );
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
  // Options must match devcontainer-feature.json schema
  const envFile = '.env.development.local';
  const bridgeConfig: Record<string, unknown> = {
    sandboxUrl: sandboxUrl,
    functionUrl: functionUrl,
    sandboxName: projectName,
    bridgeVersion: bridgeVersion,
    envFile,
    workspacePath: '${containerWorkspaceFolder}',
    appPort: port,
    ...(forwardDomains ? { forwardDomains } : {}),
  };

  config.features = {
    ...config.features,
    'ghcr.io/vercel-eddie/bridge/vercel-cli:latest': {
      envFile,
      workspacePath: '${containerWorkspaceFolder}',
    },
    'ghcr.io/vercel-eddie/bridge/bridge:latest': bridgeConfig,
  };

  // Ensure .env file is mounted into the devcontainer
  const envFileHostPath = join(cwd, envFile);
  const envFileContainerPath = `\${containerWorkspaceFolder}/${envFile}`;
  const existingMounts = config.mounts || [];
  const envMountExists = existingMounts.some(m => {
    if (typeof m === 'string') {
      return m.includes(envFile);
    }
    return m.source.includes(envFile) || m.target.includes(envFile);
  });
  if (!envMountExists) {
    config.mounts = [
      ...existingMounts,
      {
        source: envFileHostPath,
        target: envFileContainerPath,
        type: 'bind',
      },
    ];
  }

  // Add DEPLOYMENT_URL to containerEnv (merge with existing)
  config.containerEnv = {
    ...config.containerEnv,
    DEPLOYMENT_URL: functionUrl,
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

  // Write the config
  await fs.writeJson(configPath, config, { spaces: 2 });
  output.log(`Created devcontainer config at ${configPath}`);

  // Add .devcontainer to .gitignore
  await addToGitIgnore(cwd, '.devcontainer');

  return { path: configPath, config };
}

/**
 * Pull environment variables and add VERCEL_TOKEN and bypass secret
 */
async function pullEnvAndAddToken(
  client: Client,
  link: ProjectLinked,
  cwd: string
): Promise<void> {
  const envFilePath = join(cwd, '.env.development.local');

  output.log('Pulling environment variables...');

  // Pull env records (use 'vercel-cli:dev' as source since connect is similar)
  const records = (
    await pullEnvRecords(client, link.project.id, 'vercel-cli:dev')
  ).env;

  // Get the user's auth token
  let vercelToken: string | undefined;
  try {
    const authConfig = readAuthConfigFile();
    vercelToken = authConfig.token;
  } catch {
    output.warn('Could not read auth config to get VERCEL_TOKEN');
  }

  // Add VERCEL_TOKEN from auth config, overriding any existing value in records
  if (vercelToken) {
    records['VERCEL_TOKEN'] = vercelToken;
    output.debug('Added VERCEL_TOKEN to env file');
  } else if (!records['VERCEL_TOKEN']) {
    output.warn(
      'No VERCEL_TOKEN found. You may need to run `vercel login` first.'
    );
  }

  // Generate a deployment protection bypass secret (only if not already set)
  if (!records['VERCEL_AUTOMATION_BYPASS_SECRET']) {
    try {
      const bypassSecret = await getOrCreateDeploymentProtectionToken(
        client,
        link
      );
      records['VERCEL_AUTOMATION_BYPASS_SECRET'] = bypassSecret;
      output.debug('Added VERCEL_AUTOMATION_BYPASS_SECRET to env file');
    } catch (err) {
      output.warn(
        `Could not generate deployment protection bypass secret: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Build env file contents
  const lines: string[] = ['# Created by Vercel CLI (connect)'];

  for (const [key, value] of Object.entries(records)) {
    lines.push(`${key}="${escapeEnvValue(value)}"`);
  }

  // Write env file
  await fs.writeFile(envFilePath, lines.join('\n') + '\n', 'utf-8');
  output.log(`Created ${envFilePath}`);

  // Add .env.development.local to .gitignore
  await addToGitIgnore(cwd, '.env.development.local');
}

/**
 * Strip single-line (//) and multi-line comments from JSONC,
 * while preserving '//' sequences inside string values (e.g. URLs).
 */
function stripJsonComments(input: string): string {
  let result = '';
  let i = 0;
  while (i < input.length) {
    // String literal — copy through including escaped characters
    if (input[i] === '"') {
      result += '"';
      i++;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\') {
          result += input[i++]; // backslash
          if (i < input.length) {
            result += input[i++]; // escaped char
          }
        } else {
          result += input[i++];
        }
      }
      if (i < input.length) {
        result += '"'; // closing quote
        i++;
      }
    } else if (input[i] === '/' && input[i + 1] === '/') {
      // Single-line comment — skip to end of line
      i += 2;
      while (i < input.length && input[i] !== '\n') {
        i++;
      }
    } else if (input[i] === '/' && input[i + 1] === '*') {
      // Multi-line comment — skip to closing */
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) {
        i++;
      }
      i += 2; // skip */
    } else {
      result += input[i++];
    }
  }
  return result;
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
 * Parse the devcontainer CLI output to extract a human-readable error message.
 * The CLI outputs JSON to stdout with fields like `outcome`, `message`, and `description`.
 * stderr contains Docker build logs which have the actual failure context.
 */
function parseDevContainerError(
  stdout: string,
  stderr: string,
  exitCode: number | null
): string {
  const lines: string[] = ['Devcontainer failed to start:'];

  // Try to get the high-level reason from the JSON stdout
  try {
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]) as {
        outcome?: string;
        message?: string;
        description?: string;
      };
      if (result.description) {
        lines.push(result.description);
      } else if (result.message) {
        lines.push(result.message);
      }
    }
  } catch {
    // JSON parsing failed, continue with stderr
  }

  // Include the tail of stderr which contains the actual build/runtime failure details
  if (stderr.trim()) {
    const stderrLines = stderr
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    // Show the last 20 lines of stderr for context
    const tail = stderrLines.slice(-20);
    lines.push('', ...tail);
  }

  if (lines.length === 1) {
    // No useful info found, fall back to exit code
    return `Devcontainer failed to start (exit code ${exitCode})`;
  }

  return lines.join('\n');
}

/**
 * Start the devcontainer and exec into it (interactive mode)
 */
async function startAndExecDevContainer(
  cwd: string,
  configPath: string,
  startDev: boolean
): Promise<void> {
  output.spinner('Starting devcontainer...', 0);

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

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      const str = data.toString();
      stdout += str;
      output.debug(str.trim());
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
        output.stopSpinner();
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
          if (execCode === 0 || execCode === 130) {
            // 130 = SIGINT (128 + 2), normal Ctrl+C exit
            resolvePromise();
          } else {
            reject(new Error(`devcontainer exec exited with code ${execCode}`));
          }
        });

        execProc.on('error', err => {
          reject(new Error(`Failed to exec into devcontainer: ${err.message}`));
        });
      } else {
        output.stopSpinner();

        // devcontainer CLI outputs JSON to stdout with error details
        const errorMessage = parseDevContainerError(stdout, stderr, code);
        output.error(errorMessage);
        reject(new Error(errorMessage));
      }
    });

    proc.on('error', err => {
      output.stopSpinner();
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

// Bridge dispatcher configuration
const BRIDGE_REPO_ID = 1148295019; // GitHub repo ID for vercel-eddie/bridge
const BRIDGE_DIRECTORY = 'services/dispatcher';
const BRIDGE_REF = 'main';

/**
 * Deploy the bridge dispatcher service
 * Creates a preview deployment using the bridge repo as source
 */
async function deployBridgeDispatcher(
  client: Client,
  projectId: string,
  projectName: string,
  sandboxUrl: string
): Promise<string> {
  output.spinner('Deploying dispatcher...', 0);

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
        repoId: BRIDGE_REPO_ID,
        ref: BRIDGE_REF,
      },
      projectSettings: {
        rootDirectory: BRIDGE_DIRECTORY,
      },
      env: {
        BRIDGE_SERVER_ADDR: sandboxUrl,
      },
      meta: {
        action: 'bridge-connect',
      },
    },
  });

  output.debug(`Dispatcher deployment created: ${deployment.id}`);

  // If already ready, return immediately
  if (deployment.readyState === 'READY') {
    return `https://${deployment.url}`;
  }

  // Poll for deployment to be ready
  output.spinner('Building dispatcher...', 0);
  const maxWaitTime = 5 * 60 * 1000; // 5 minutes
  const pollInterval = 2000; // 2 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const status = await client.fetch<{
      readyState: string;
      url: string;
      errorMessage?: string;
      errorCode?: string;
    }>(`/v13/deployments/${deployment.id}`);

    output.debug(`Deployment status: ${status.readyState}`);

    if (status.readyState === 'READY') {
      return `https://${status.url}`;
    }

    if (status.readyState === 'ERROR' || status.readyState === 'CANCELED') {
      const errorDetails =
        status.errorMessage || status.errorCode || 'Unknown error';
      throw new Error(
        `Deployment ${status.readyState.toLowerCase()}: ${errorDetails}`
      );
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Deployment timed out');
}

/**
 * Get function URL from environment variable or deploy dispatcher
 */
async function getOrDeployFunctionUrl(
  client: Client,
  projectId: string,
  projectName: string,
  sandboxUrl: string
): Promise<string> {
  const envFunctionUrl = process.env.VERCEL_FUNCTION_URL;
  if (envFunctionUrl) {
    output.debug(
      `Using VERCEL_FUNCTION_URL from environment: ${envFunctionUrl}`
    );
    return envFunctionUrl;
  }

  return deployBridgeDispatcher(client, projectId, projectName, sandboxUrl);
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
  const nonInteractive = opts['--ide'] === true;
  const startDev = opts['--dev'] === true;

  // Forward domains
  const forwardDomains = opts['--forward-domains'];

  // Bridge version (defaults to 'edge')
  const bridgeVersion = opts['--bridge-version'] || 'edge';

  // Check for devcontainer CLI unless non-interactive mode
  if (!nonInteractive && !checkDevContainerCli()) {
    output.error('devcontainer CLI is required. Install it with:');
    output.print('  npm install -g @devcontainers/cli\n');
    output.log(
      '\nAlternatively, run with --ide to just set up the devcontainer files.'
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
    // Only append rootDirectory if cwd doesn't already include it
    const expectedPath = join(cwd, project.rootDirectory);
    const originalCwd = resolve(dir);
    if (!originalCwd.endsWith(project.rootDirectory)) {
      cwd = expectedPath;
    } else {
      // User is already in the rootDirectory, use their original path
      cwd = originalCwd;
    }
  }

  // Compute the container workspace path: /workspaces/<repo-name>[/<rootDirectory>]
  const repoRoot = link.repoRoot || cwd;
  const containerWorkspace = link.repoRoot
    ? `/workspaces/${basename(repoRoot)}/${relative(repoRoot, cwd)}`.replace(
        /\/+$/,
        ''
      )
    : `/workspaces/${basename(cwd)}`;

  output.log(`Setting up connection for ${project.name}...`);

  // Provision sandbox first, then deploy dispatcher with sandbox URL
  let sandboxUrl: string;
  try {
    const provisioned = await provisionSandbox({
      teamId: client.config.currentTeam,
      projectId: project.id,
      token: client.authConfig.token!,
      proxyPort: port,
      sessionName: project.name,
      bridgeVersion,
    });
    sandboxUrl = provisioned.sandboxUrl;
    output.stopSpinner();
    output.success(`Sandbox ready: ${sandboxUrl}`);
  } catch (err) {
    output.stopSpinner();
    output.error(
      `Sandbox: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }

  let functionUrl: string;
  try {
    functionUrl = await getOrDeployFunctionUrl(
      client,
      project.id,
      project.name,
      sandboxUrl
    );
    output.stopSpinner();
    output.success(`Dispatcher deployed: ${functionUrl}`);
  } catch (err) {
    output.stopSpinner();
    output.error(
      `Dispatcher: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }

  // Update devcontainer config in-place
  output.spinner('Configuring devcontainer...', 0);
  const { path: configPath } = await createProjectDevContainer(
    cwd,
    project.name,
    port,
    functionUrl,
    sandboxUrl,
    project.framework,
    bridgeVersion,
    containerWorkspace,
    forwardDomains
  );

  // Pull environment variables, add VERCEL_TOKEN and bypass secret
  await pullEnvAndAddToken(client, link, cwd);
  output.stopSpinner();

  if (nonInteractive) {
    output.success('Devcontainer configuration complete!');
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
