import { join } from 'node:path';
import type { KnownAgentNames } from '@vercel/detect-agent';

export type AgentFileFormat = 'markdown' | 'cursorrules' | 'copilot';

export interface FormatConfig {
  format: AgentFileFormat;
  fileName: string;
  filePath: (cwd: string) => string;
  description: string;
}

const FORMAT_CONFIGS: Record<AgentFileFormat, FormatConfig> = {
  markdown: {
    format: 'markdown',
    fileName: 'AGENTS.md',
    filePath: (cwd: string) => join(cwd, 'AGENTS.md'),
    description: 'Universal markdown format (Claude Code, Gemini, Codex, etc.)',
  },
  cursorrules: {
    format: 'cursorrules',
    fileName: '.cursorrules',
    filePath: (cwd: string) => join(cwd, '.cursorrules'),
    description: 'Cursor-specific rules file',
  },
  copilot: {
    format: 'copilot',
    fileName: 'copilot-instructions.md',
    filePath: (cwd: string) => join(cwd, '.github', 'copilot-instructions.md'),
    description: 'GitHub Copilot instructions',
  },
};

const AGENT_FORMAT_MAP: Record<string, AgentFileFormat[]> = {
  cursor: ['cursorrules', 'markdown'],
  'cursor-cli': ['cursorrules', 'markdown'],
  claude: ['markdown'],
  devin: ['markdown'],
  replit: ['markdown'],
  gemini: ['markdown'],
  codex: ['markdown'],
};

/**
 * Get the format configuration for a specific format
 */
export function getFormatConfig(format: AgentFileFormat): FormatConfig {
  return FORMAT_CONFIGS[format];
}

/**
 * Get all available format configurations
 */
export function getAllFormatConfigs(): FormatConfig[] {
  return Object.values(FORMAT_CONFIGS);
}

/**
 * Detect which formats to generate based on the agent
 */
export function detectFormatsForAgent(
  agentName?: KnownAgentNames | string
): AgentFileFormat[] {
  if (!agentName) {
    // Default to markdown if no agent detected
    return ['markdown'];
  }

  const formats = AGENT_FORMAT_MAP[agentName];
  if (formats) {
    return formats;
  }

  // Unknown agent, default to markdown
  return ['markdown'];
}

/**
 * Parse the format argument from CLI
 */
export function parseFormatArgument(
  formatArg: string | undefined,
  agentName?: KnownAgentNames | string
): AgentFileFormat[] {
  if (!formatArg || formatArg === 'auto') {
    return detectFormatsForAgent(agentName);
  }

  if (formatArg === 'all') {
    return ['markdown', 'cursorrules', 'copilot'];
  }

  const validFormats: AgentFileFormat[] = [
    'markdown',
    'cursorrules',
    'copilot',
  ];
  if (validFormats.includes(formatArg as AgentFileFormat)) {
    return [formatArg as AgentFileFormat];
  }

  // Invalid format, default to markdown
  return ['markdown'];
}
