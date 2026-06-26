import chalk from 'chalk';
import { maskSecret } from './gateway';

interface DiffLine {
  type: ' ' | '-' | '+';
  text: string;
}

/** Line-based LCS diff. Small config files, so an O(n*m) table is fine. */
function diffLines(before: string, after: string): DiffLine[] {
  const a = before.length ? before.split('\n') : [];
  const b = after.length ? after.split('\n') : [];
  const m = a.length;
  const n = b.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: ' ', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: '-', text: a[i] });
      i++;
    } else {
      out.push({ type: '+', text: b[j] });
      j++;
    }
  }
  while (i < m) out.push({ type: '-', text: a[i++] });
  while (j < n) out.push({ type: '+', text: b[j++] });
  return out;
}

/** Replaces each known secret with its masked form so diffs never leak the value. */
function maskKnownSecrets(text: string, secrets: string[]): string {
  let masked = text;
  for (const secret of secrets) {
    if (secret) {
      masked = masked.split(secret).join(maskSecret(secret));
    }
  }
  return masked;
}

/**
 * Redacts the value of secret-bearing fields regardless of whether we know it,
 * so a previously-stored key on a removed (`-`) line is never printed. Empty
 * values (e.g. `ANTHROPIC_API_KEY: ""`) are left as-is.
 */
function redactSecretFields(text: string): string {
  return (
    text
      // JSON: "ANTHROPIC_AUTH_TOKEN"/"apiKey"/"key": "<value>" — value may contain \"-escaped quotes.
      .replace(
        /("(?:ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY|apiKey|key)"\s*:\s*)"((?:[^"\\]|\\.)+)"/g,
        (_match, prefix, value) => `${prefix}"${maskSecret(value)}"`
      )
      // Shell: export AI_GATEWAY_API_KEY=<value>, single- or double-quoted.
      .replace(
        /(export\s+AI_GATEWAY_API_KEY=)(["'])((?:(?!\2).)+)(\2)/g,
        (_match, prefix, quote, value, close) =>
          `${prefix}${quote}${maskSecret(value)}${close}`
      )
  );
}

function mask(text: string, secrets: string[]): string {
  return redactSecretFields(maskKnownSecrets(text, secrets));
}

export interface RenderDiffOptions {
  /** Secret values to mask wherever they appear in the diff. */
  secrets?: string[];
  /** Lines of unchanged context to keep around each change (default 2). */
  context?: number;
  /** Indent applied to every rendered line. */
  indent?: string;
}

/**
 * Renders a unified-style, colorized diff with unchanged regions collapsed.
 * Returns an empty string when there is no change.
 */
export function renderDiff(
  before: string,
  after: string,
  options: RenderDiffOptions = {}
): string {
  const { secrets = [], context = 2, indent = '  ' } = options;
  const lines = diffLines(before, after);
  if (!lines.some(l => l.type !== ' ')) {
    return '';
  }

  // Mark unchanged lines within `context` of a change as worth keeping.
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, idx) => {
    if (line.type !== ' ') {
      for (
        let k = Math.max(0, idx - context);
        k <= Math.min(lines.length - 1, idx + context);
        k++
      ) {
        keep[k] = true;
      }
    }
  });

  const rendered: string[] = [];
  let collapsed = false;
  lines.forEach((line, idx) => {
    if (!keep[idx]) {
      if (!collapsed) {
        rendered.push(chalk.dim(`${indent}  ⋯`));
        collapsed = true;
      }
      return;
    }
    collapsed = false;
    const text = mask(line.text, secrets);
    if (line.type === '+') {
      rendered.push(chalk.green(`${indent}+ ${text}`));
    } else if (line.type === '-') {
      rendered.push(chalk.red(`${indent}- ${text}`));
    } else {
      rendered.push(chalk.dim(`${indent}  ${text}`));
    }
  });
  return rendered.join('\n');
}
