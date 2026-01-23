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
import { readFileSync } from 'node:fs';
import {
  renderMarkdownContent,
  renderCursorrulesContent,
  renderCopilotContent,
} from './templates';

const VERCEL_SECTION_START = '<!-- VERCEL DEPLOYMENT GUIDE START -->';
const VERCEL_SECTION_END = '<!-- VERCEL DEPLOYMENT GUIDE END -->';

// Track if we've already prompted/generated in this CLI session
// This prevents duplicate prompts when commands chain (e.g., link -> env pull)
let sessionAlreadyHandled = false;

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
 * Read existing file and extract custom content outside Vercel section
 */
async function readExistingContent(filePath: string): Promise<{
  before: string;
  after: string;
} | null> {
  try {
    if (!existsSync(filePath)) {
      return null;
    }

    const content = await readFile(filePath, 'utf-8');

    // Check if file has our markers
    const startIndex = content.indexOf(VERCEL_SECTION_START);
    const endIndex = content.indexOf(VERCEL_SECTION_END);

    if (startIndex === -1 || endIndex === -1) {
      // No markers found - preserve entire existing content as "before"
      return { before: content.trim(), after: '' };
    }

    // Extract content before and after our section
    const before = content.substring(0, startIndex).trim();
    const after = content
      .substring(endIndex + VERCEL_SECTION_END.length)
      .trim();

    return { before, after };
  } catch {
    return null;
  }
}

/**
 * Wrap Vercel content with markers for incremental updates
 */
function wrapWithMarkers(content: string): string {
  return `${VERCEL_SECTION_START}\n${content}\n${VERCEL_SECTION_END}`;
}

/**
 * Merge existing content with new Vercel content
 */
function mergeContent(
  existing: { before: string; after: string } | null,
  vercelContent: string
): string {
  const wrappedContent = wrapWithMarkers(vercelContent);

  if (!existing) {
    return wrappedContent;
  }

  const parts: string[] = [];

  if (existing.before) {
    parts.push(existing.before);
    parts.push('');
  }

  parts.push(wrappedContent);

  if (existing.after) {
    parts.push('');
    parts.push(existing.after);
  }

  return parts.join('\n');
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
    const fileExists = existsSync(filePath);

    // Read existing content to preserve custom sections
    const existingContent = await readExistingContent(filePath);

    // If file exists without our markers and no force flag, skip
    // (unless it has our markers, then we update the Vercel section only)
    if (fileExists && !force && !existingContent) {
      continue;
    }

    // Render new Vercel content
    const vercelContent = renderContent(format, ctx);

    // Merge with existing content (preserves custom content)
    const finalContent = mergeContent(
      force ? null : existingContent,
      vercelContent
    );

    if (dryRun) {
      generatedFiles.push({
        path: filePath,
        format,
        content: finalContent,
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
      await writeFile(filePath, finalContent, 'utf-8');
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

/**
 * Check if agent files need updating (have Vercel markers that could be refreshed)
 */
function agentFilesNeedUpdate(cwd: string): boolean {
  const formats = ['markdown', 'cursorrules', 'copilot'] as const;

  for (const format of formats) {
    const formatConfig = getFormatConfig(format);
    const filePath = formatConfig.filePath(cwd);

    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        // File exists with our markers - can be updated
        if (
          content.includes(VERCEL_SECTION_START) &&
          content.includes(VERCEL_SECTION_END)
        ) {
          return true;
        }
        // File exists without markers - could add our section
        return true;
      } catch {
        continue;
      }
    }
  }

  // No agent files exist yet - should create
  return true;
}

export interface PromptAgentFilesOptions {
  cwd: string;
  projectName?: string;
  orgSlug?: string;
  client: {
    input: {
      confirm: (message: string, defaultValue: boolean) => Promise<boolean>;
    };
  };
}

/**
 * Prompt user to generate/update agent files when running from an AI agent
 * Returns the result if files were generated, or null if skipped/declined
 */
export async function promptAndGenerateAgentFiles(
  options: PromptAgentFilesOptions
): Promise<GenerateResult | null> {
  const { cwd, projectName, orgSlug, client } = options;

  // Skip if already handled in this CLI session (e.g., link -> env pull chain)
  if (sessionAlreadyHandled) {
    return null;
  }

  // Check if disabled
  if (isDisabled()) {
    return null;
  }

  // Only prompt if running from an agent
  const { isAgent } = await determineAgent();
  if (!isAgent) {
    return null;
  }

  // Check if there's anything to update
  if (!agentFilesNeedUpdate(cwd)) {
    return null;
  }

  // Mark as handled for this session (regardless of user's choice)
  sessionAlreadyHandled = true;

  // Prompt the agent to explicitly approve writing to AGENTS.md
  const shouldGenerate = await client.input.confirm(
    'May I write Vercel deployment instructions to AGENTS.md? (The AI agent must approve this)',
    true
  );

  if (!shouldGenerate) {
    return null;
  }

  // Generate files
  return generateAgentFiles({
    cwd,
    projectName,
    orgSlug,
  });
}

/**
 * Reset session tracking (for testing purposes)
 */
export function resetAgentFilesSession(): void {
  sessionAlreadyHandled = false;
}
