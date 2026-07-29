/**
 * Provenance metadata recorded in pulled env files.
 *
 * `.vercel/.env.<target>.local` encodes only the target in its filename, so a
 * file pulled with `--git-branch` is otherwise indistinguishable from a plain
 * pull of the same target. Recording what was actually requested lets
 * `vercel build` tell whether a local file answers the request it is about to
 * make, instead of silently using values resolved for something else.
 *
 * The metadata is written as a comment on the second line, so the
 * `# Created by Vercel CLI` first line stays byte-identical for the
 * fixed-length head read that detects CLI-authored files.
 */

const PROVENANCE_PREFIX = '# vercel-env:';

export interface EnvProvenance {
  target?: string;
  gitBranch?: string;
  pulledAt?: string;
}

/**
 * Renders a provenance comment line, including the trailing newline.
 * Values are encoded so a branch containing spaces or newlines can't produce
 * a line that parses as something else.
 */
export function formatEnvProvenance({
  target,
  gitBranch,
  pulledAt,
}: EnvProvenance): string {
  const parts: string[] = [];
  if (target) {
    parts.push(`target=${encodeURIComponent(target)}`);
  }
  if (gitBranch) {
    parts.push(`gitBranch=${encodeURIComponent(gitBranch)}`);
  }
  if (pulledAt) {
    parts.push(`pulledAt=${encodeURIComponent(pulledAt)}`);
  }
  if (parts.length === 0) {
    return '';
  }
  return `${PROVENANCE_PREFIX} ${parts.join(' ')}\n`;
}

/**
 * Reads provenance out of env file contents. Returns `undefined` when the file
 * has none, which is the case for files pulled by older CLI versions and for
 * hand-written files.
 */
export function parseEnvProvenance(
  contents: string
): EnvProvenance | undefined {
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    if (!line.startsWith('#')) {
      // Reached the first assignment; provenance only lives in the header.
      return undefined;
    }
    if (!line.startsWith(PROVENANCE_PREFIX)) continue;

    const provenance: EnvProvenance = {};
    const body = line.slice(PROVENANCE_PREFIX.length).trim();
    for (const token of body.split(/\s+/)) {
      const eq = token.indexOf('=');
      if (eq === -1) continue;
      const key = token.slice(0, eq);
      const value = decodeURIComponent(token.slice(eq + 1));
      if (value === '') continue;
      if (key === 'target') provenance.target = value;
      else if (key === 'gitBranch') provenance.gitBranch = value;
      else if (key === 'pulledAt') provenance.pulledAt = value;
    }
    return provenance;
  }
  return undefined;
}

export interface EnvProvenanceRequest {
  target: string;
  gitBranch?: string;
}

export type EnvProvenanceComparison =
  | { status: 'unknown' }
  | { status: 'match' }
  | { status: 'mismatch'; reason: string };

/**
 * Compares recorded provenance against the env resolution a command is about to
 * perform. `unknown` means the file predates provenance, so callers should fall
 * back to their previous behavior rather than treating it as a mismatch.
 */
export function compareEnvProvenance(
  provenance: EnvProvenance | undefined,
  request: EnvProvenanceRequest
): EnvProvenanceComparison {
  if (!provenance || (!provenance.target && !provenance.gitBranch)) {
    return { status: 'unknown' };
  }

  if (provenance.target && provenance.target !== request.target) {
    return {
      status: 'mismatch',
      reason: `it was pulled for the \`${provenance.target}\` Environment, not \`${request.target}\``,
    };
  }

  const pulledBranch = provenance.gitBranch;
  const wantedBranch = request.gitBranch;
  if (pulledBranch !== wantedBranch) {
    if (pulledBranch && !wantedBranch) {
      return {
        status: 'mismatch',
        reason: `it was pulled with overrides for branch \`${pulledBranch}\``,
      };
    }
    if (!pulledBranch && wantedBranch) {
      return {
        status: 'mismatch',
        reason: `it was pulled without overrides for branch \`${wantedBranch}\``,
      };
    }
    return {
      status: 'mismatch',
      reason: `it was pulled for branch \`${pulledBranch}\`, not \`${wantedBranch}\``,
    };
  }

  return { status: 'match' };
}
