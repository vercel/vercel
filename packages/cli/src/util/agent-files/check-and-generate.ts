import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { determineAgent } from '@vercel/detect-agent';
import type { VercelConfig } from '@vercel/client';
import type {
  GenerateOptions,
  GenerateResult,
  GeneratedFile,
  ProjectContext,
} from './types';
import {
  parseFormatArgument,
  getFormatConfig,
  type AgentFileFormat,
} from './detect-format';
import {
  renderMarkdownContent,
  renderCursorrulesContent,
  renderCopilotContent,
} from './templates';

/**
 * Check if agent file generation is disabled
 */
function isDisabled(): boolean {
  return (
    process.env.VERCEL_AGENT_FILES_DISABLED === '1' ||
    process.env.VERCEL_AGENT_FILES_DISABLED === 'true'
  );
}

/**
 * Read and parse vercel.json if it exists
 */
async function readVercelConfig(cwd: string): Promise<VercelConfig | null> {
  const configPath = join(cwd, 'vercel.json');
  try {
    if (existsSync(configPath)) {
      const content = await readFile(configPath, 'utf-8');
      return JSON.parse(content) as VercelConfig;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Detect framework from package.json or vercel.json
 */
async function detectFramework(cwd: string): Promise<string | null> {
  // Check vercel.json first
  const vercelConfig = await readVercelConfig(cwd);
  if (vercelConfig?.framework) {
    return vercelConfig.framework;
  }

  // Try to detect from package.json
  const packageJsonPath = join(cwd, 'package.json');
  try {
    if (existsSync(packageJsonPath)) {
      const content = await readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      const deps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      if (deps['next']) return 'nextjs';
      if (deps['@remix-run/react']) return 'remix';
      if (deps['astro']) return 'astro';
      if (deps['@sveltejs/kit']) return 'sveltekit';
      if (deps['nuxt']) return 'nuxtjs';
      if (deps['vue']) return 'vue';
      if (deps['react']) return 'create-react-app';
      if (deps['@angular/core']) return 'angular';
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Check if API routes exist
 */
function hasApiRoutes(cwd: string): boolean {
  const apiPaths = [
    join(cwd, 'api'),
    join(cwd, 'pages', 'api'),
    join(cwd, 'app', 'api'),
    join(cwd, 'src', 'pages', 'api'),
    join(cwd, 'src', 'app', 'api'),
  ];

  return apiPaths.some(p => existsSync(p));
}

/**
 * Build project context from the current directory
 */
async function buildProjectContext(
  cwd: string,
  options: GenerateOptions
): Promise<ProjectContext> {
  const vercelConfig = await readVercelConfig(cwd);
  const framework = await detectFramework(cwd);

  return {
    framework,
    hasVercelJson: existsSync(join(cwd, 'vercel.json')),
    vercelConfig,
    hasApiRoutes: hasApiRoutes(cwd),
    projectName: options.projectName || 'Unnamed Project',
    orgSlug: options.orgSlug || '',
  };
}

/**
 * Render content for a specific format
 */
function renderContent(format: AgentFileFormat, ctx: ProjectContext): string {
  switch (format) {
    case 'markdown':
      return renderMarkdownContent(ctx);
    case 'cursorrules':
      return renderCursorrulesContent(ctx);
    case 'copilot':
      return renderCopilotContent(ctx);
    default:
      return renderMarkdownContent(ctx);
  }
}

/**
 * Generate agent configuration files
 */
export async function generateAgentFiles(
  options: GenerateOptions
): Promise<GenerateResult> {
  const { cwd, force = false, dryRun = false, silent = false } = options;

  // Check if disabled
  if (isDisabled()) {
    return {
      status: 'disabled',
      files: [],
      framework: null,
    };
  }

  // Detect agent
  const { isAgent, agent } = await determineAgent();

  // For auto-trigger (silent mode), only run if agent is detected
  if (silent && !isAgent) {
    return {
      status: 'skipped',
      files: [],
      framework: null,
    };
  }

  // Determine formats to generate
  const formats = parseFormatArgument(options.format, agent?.name);

  // Build project context
  const ctx = await buildProjectContext(cwd, options);

  const generatedFiles: GeneratedFile[] = [];
  let anyGenerated = false;

  for (const format of formats) {
    const formatConfig = getFormatConfig(format);
    const filePath = formatConfig.filePath(cwd);

    // Check if file exists
    if (existsSync(filePath) && !force) {
      // Skip silently
      continue;
    }

    // Render content
    const content = renderContent(format, ctx);

    if (dryRun) {
      generatedFiles.push({
        path: filePath,
        format,
        content,
      });
      anyGenerated = true;
      continue;
    }

    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write file
    try {
      await writeFile(filePath, content, 'utf-8');
      generatedFiles.push({
        path: filePath,
        format,
      });
      anyGenerated = true;
    } catch (error) {
      return {
        status: 'error',
        files: generatedFiles,
        framework: ctx.framework,
        error: `Failed to write ${filePath}: ${error}`,
      };
    }
  }

  if (!anyGenerated && !dryRun) {
    return {
      status: 'exists',
      files: [],
      framework: ctx.framework,
    };
  }

  return {
    status: 'generated',
    files: generatedFiles,
    framework: ctx.framework,
  };
}

/**
 * Auto-trigger agent file generation (for use in other commands)
 * Only generates if agent is detected and files don't exist
 */
export async function autoGenerateAgentFiles(
  cwd: string,
  projectName?: string,
  orgSlug?: string
): Promise<GenerateResult> {
  return generateAgentFiles({
    cwd,
    silent: true,
    projectName,
    orgSlug,
  });
}
