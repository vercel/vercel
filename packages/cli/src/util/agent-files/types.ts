import type { VercelConfig } from '@vercel/client';

export interface ProjectContext {
  framework: string | null;
  hasVercelJson: boolean;
  vercelConfig: VercelConfig | null;
  hasApiRoutes: boolean;
  projectName: string;
  orgSlug: string;
}

export interface GenerateOptions {
  cwd: string;
  format?: 'markdown' | 'cursorrules' | 'copilot' | 'all' | 'auto';
  force?: boolean;
  dryRun?: boolean;
  silent?: boolean;
  projectName?: string;
  orgSlug?: string;
}

export interface GenerateResult {
  status: 'generated' | 'exists' | 'skipped' | 'disabled' | 'error';
  files: GeneratedFile[];
  framework: string | null;
  error?: string;
}

export interface GeneratedFile {
  path: string;
  format: string;
  content?: string;
}
