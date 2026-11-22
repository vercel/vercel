import { maskSecret } from './gateway';

export interface DiffLine {
  type: ' ' | '-' | '+';
  text: string;
}

/** A run of unchanged lines folded away between kept context. */
export interface DiffGap {
  type: 'gap';
}

// Above this many table cells, the changed middle shows as removed then added.
const MAX_TABLE_CELLS = 4_000_000;

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.length ? before.split('\n') : [];
  const b = after.length ? after.split('\n') : [];
  // Matching ends are unchanged, so only the middle needs the table.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  ) {
    end++;
  }
  const same = (lines: string[]): DiffLine[] =>
    lines.map(text => ({ type: ' ', text }));
  return [
    ...same(a.slice(0, start)),
    ...diffMiddle(
      a.slice(start, a.length - end),
      b.slice(start, b.length - end)
    ),
    ...same(a.slice(a.length - end)),
  ];
}

function diffMiddle(a: string[], b: string[]): DiffLine[] {
  const m = a.length;
  const n = b.length;
  if ((m + 1) * (n + 1) > MAX_TABLE_CELLS) {
    return [
      ...a.map(text => ({ type: '-' as const, text })),
      ...b.map(text => ({ type: '+' as const, text })),
    ];
  }
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

function maskKnownSecrets(text: string, secrets: string[]): string {
  let masked = text;
  for (const secret of secrets) {
    if (secret) {
      masked = masked.split(secret).join(maskSecret(secret));
    }
  }
  return masked;
}

// Field and variable names that hold credentials, like `apiKey`,
// `api_key`, `ANTHROPIC_AUTH_TOKEN` or `GROK_CODE_XAI_API_KEY`.
const SECRET_NAME = String.raw`(?:[\w-]*(?:api[_-]?key|auth[_-]?token)|key)`;
const SECRET_FIELDS: RegExp[] = [
  // JSON: "apiKey": "…"
  new RegExp(
    String.raw`("${SECRET_NAME}"\s*:\s*)(")(?!\$)((?:[^"\\]|\\.)+)(")`,
    'gi'
  ),
  // TOML and YAML: api_key = "…"
  new RegExp(
    String.raw`^(\s*${SECRET_NAME}\s*[=:]\s*)(["'])(?!\$)((?:(?!\2)[^\\]|\\.)+)(\2)`,
    'gim'
  ),
  // sh and fish exports. `(?!\$)` keeps Keychain lookups and variable
  // references readable: they are not secrets.
  new RegExp(
    String.raw`((?:export\s+|set\s+-gx\s+)\w*(?:API_KEY|TOKEN)[= ])(["'])(?!\$)((?:(?!\2).)+)(\2)`,
    'g'
  ),
];
// AI Gateway keys, wherever they appear.
const GATEWAY_KEY = /\bvck_[\w-]{8,}/g;

function redactSecretFields(text: string): string {
  let masked = text;
  for (const pattern of SECRET_FIELDS) {
    masked = masked.replace(
      pattern,
      (_match, prefix, open, value, close) =>
        `${prefix}${open}${maskSecret(value)}${close}`
    );
  }
  return masked.replace(GATEWAY_KEY, key => maskSecret(key));
}

/** Masks the given secrets and any recognizable key fields, for display. */
export function maskDiffText(text: string, secrets: string[] = []): string {
  return redactSecretFields(maskKnownSecrets(text, secrets));
}

export interface DiffPreviewOptions {
  secrets?: string[];
  context?: number;
}

/**
 * The lines a preview shows: changes with `context` lines around them, the
 * rest folded into gaps, secrets masked. Empty when nothing changes. Hosts
 * render it however they like; `renderDiff` is the plain-text rendering.
 */
export function diffPreview(
  before: string,
  after: string,
  options: DiffPreviewOptions = {}
): Array<DiffLine | DiffGap> {
  const { secrets = [], context = 2 } = options;
  const lines = diffLines(before, after);
  if (!lines.some(l => l.type !== ' ')) {
    return [];
  }
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
  const out: Array<DiffLine | DiffGap> = [];
  let collapsed = false;
  lines.forEach((line, idx) => {
    if (!keep[idx]) {
      if (!collapsed) {
        out.push({ type: 'gap' });
        collapsed = true;
      }
      return;
    }
    collapsed = false;
    out.push({ type: line.type, text: maskDiffText(line.text, secrets) });
  });
  return out;
}

export interface DiffColors {
  dim(text: string): string;
  added(text: string): string;
  removed(text: string): string;
}

export interface RenderDiffOptions extends DiffPreviewOptions {
  indent?: string;
  /** Styling for each kind of line; plain text without it. */
  colors?: DiffColors;
}

const plain = (text: string) => text;

export function renderDiff(
  before: string,
  after: string,
  options: RenderDiffOptions = {}
): string {
  const { indent = '  ', colors } = options;
  const dim = colors?.dim ?? plain;
  const added = colors?.added ?? plain;
  const removed = colors?.removed ?? plain;
  return diffPreview(before, after, options)
    .map(line => {
      if (line.type === 'gap') return dim(`${indent}  ⋯`);
      if (line.type === '+') return added(`${indent}+ ${line.text}`);
      if (line.type === '-') return removed(`${indent}- ${line.text}`);
      return dim(`${indent}  ${line.text}`);
    })
    .join('\n');
}
