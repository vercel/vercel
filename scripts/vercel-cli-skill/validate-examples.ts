import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildAliasResolver } from './load-command-model.js';
import { skillDir, validationExceptionsPath } from './paths.js';
import type {
  GeneratedCommand,
  GeneratedManifest,
  GeneratedOption,
  ValidationExceptions,
} from './types.js';

export interface ExtractedExample {
  file: string;
  line: number;
  raw: string;
  /** Tokens after vercel/vc, before `--` forwarding. */
  tokens: string[];
}

export interface ExampleValidationFailure {
  file: string;
  line: number;
  raw: string;
  message: string;
  /** Attempted command path used for exception matching. */
  attemptedPath: string;
}

function stripCommentsAndContinue(block: string): string {
  const joined = block.replace(/\\\r?\n/g, ' ');
  return joined
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) return '';
      const hash = trimmed.search(/\s+#/);
      if (hash === -1) return trimmed;
      const before = trimmed.slice(0, hash);
      const doubleQuotes = (before.match(/"/g) || []).length;
      const singleQuotes = (before.match(/'/g) || []).length;
      if (doubleQuotes % 2 === 0 && singleQuotes % 2 === 0) {
        return before.trim();
      }
      return trimmed;
    })
    .filter(Boolean)
    .join('\n');
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  // A token is any run of unquoted characters and/or quoted segments, so
  // `--name="a b"` stays one token instead of splitting at the quote.
  const re = /(?:[^\s"']|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(command)) !== null) {
    const token = match[0]
      .replace(/"((?:[^"\\]|\\.)*)"/g, '$1')
      .replace(/'((?:[^'\\]|\\.)*)'/g, '$1');
    tokens.push(token);
  }
  return tokens;
}

function extractFromSubstitutions(text: string): string[] {
  const found: string[] = [];
  const re = /\$\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    found.push(match[1].trim());
  }
  return found;
}

function normalizeInvocation(text: string): string | null {
  let s = text.trim();
  s = s.replace(/^\$\s+/, '');
  // Leading environment assignments: `BLOB_READ_WRITE_TOKEN=… vercel blob list`
  s = s.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)+/, '');
  s = s.replace(/^(?:npx|pnpm\s+dlx|bunx|yarn\s+dlx)\s+(?:-y\s+)?/, '');
  if (!/^(?:vercel|vc)(?:\s|$)/.test(s)) {
    return null;
  }
  return s;
}

function splitForwarding(tokens: string[]): string[] {
  const idx = tokens.indexOf('--');
  if (idx === -1) return tokens;
  return tokens.slice(0, idx);
}

function isFlagToken(token: string): boolean {
  return token.startsWith('-') && token !== '-';
}

function isDocPlaceholder(token: string): boolean {
  return (
    token === '...' ||
    /^<[^>]+>$/.test(token) ||
    /^\$[A-Z_][A-Z0-9_]*$/.test(token)
  );
}

function optionTakesValue(option: GeneratedOption): boolean {
  if (Array.isArray(option.type)) return true;
  return option.type !== 'boolean';
}

/** All valued option names across the tree (for stripping flag values before path resolve). */
function collectValuedOptionNames(manifest: GeneratedManifest): {
  long: Set<string>;
  short: Set<string>;
} {
  const long = new Set<string>();
  const short = new Set<string>();
  for (const option of [
    ...manifest.globalOptions,
    ...manifest.commands.flatMap(c => c.options),
  ]) {
    if (!optionTakesValue(option)) continue;
    long.add(option.name);
    if (option.shorthand) short.add(option.shorthand);
  }
  return { long, short };
}

/**
 * Split tokens into command/arg path tokens vs flag tokens, consuming values for
 * known valued options so `vercel alerts --type usage_anomaly` does not treat
 * `usage_anomaly` as a subcommand.
 */
export function splitPathAndFlagTokens(
  tokens: string[],
  valued: { long: Set<string>; short: Set<string> }
): { pathTokens: string[]; flagTokens: string[] } {
  const pathTokens: string[] = [];
  const flagTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!isFlagToken(token)) {
      pathTokens.push(token);
      continue;
    }

    flagTokens.push(token);

    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq !== -1) continue;
      const name = token.slice(2);
      if (
        valued.long.has(name) &&
        i + 1 < tokens.length &&
        !isFlagToken(tokens[i + 1])
      ) {
        flagTokens.push(tokens[++i]);
      }
      continue;
    }

    // Short cluster: -abc or -S
    const chars = token.slice(1);
    // Only the last short option in a cluster can take a value.
    const last = chars[chars.length - 1];
    if (
      valued.short.has(last) &&
      i + 1 < tokens.length &&
      !isFlagToken(tokens[i + 1])
    ) {
      flagTokens.push(tokens[++i]);
    }
  }

  return { pathTokens, flagTokens };
}

/**
 * Extract vercel/vc examples from skill markdown (excluding generated/**).
 */
export function extractExamplesFromMarkdown(
  filePath: string,
  content: string
): ExtractedExample[] {
  const examples: ExtractedExample[] = [];
  const lines = content.split('\n');

  let inFence = false;
  let fenceLang = '';
  let fenceStart = 0;
  let fenceLines: string[] = [];

  const flushFence = () => {
    if (!['bash', 'sh', 'shell', 'zsh', ''].includes(fenceLang)) {
      return;
    }
    const block = stripCommentsAndContinue(fenceLines.join('\n'));
    const candidates = [
      ...block.split('\n'),
      ...extractFromSubstitutions(block),
    ];
    for (const candidate of candidates) {
      const normalized = normalizeInvocation(candidate);
      if (!normalized) continue;
      const allTokens = tokenize(normalized);
      const beforeForward = splitForwarding(allTokens);
      examples.push({
        file: filePath,
        line: fenceStart + 1,
        raw: normalized,
        tokens: beforeForward.slice(1),
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceOpen = line.match(/^```(\w*)\s*$/);
    if (fenceOpen && !inFence) {
      inFence = true;
      fenceLang = fenceOpen[1] || '';
      fenceStart = i;
      fenceLines = [];
      continue;
    }
    if (inFence && line.startsWith('```')) {
      flushFence();
      inFence = false;
      continue;
    }
    if (inFence) {
      fenceLines.push(line);
      continue;
    }

    const inlineRe = /`((?:vercel|vc)(?:\s[^`]*)?)`/g;
    let inlineMatch: RegExpExecArray | null;
    while ((inlineMatch = inlineRe.exec(line)) !== null) {
      const normalized = normalizeInvocation(inlineMatch[1]);
      if (!normalized) continue;
      const allTokens = tokenize(normalized);
      const beforeForward = splitForwarding(allTokens);
      examples.push({
        file: filePath,
        line: i + 1,
        raw: normalized,
        tokens: beforeForward.slice(1),
      });
    }
  }

  return examples;
}

function optionLookup(options: GeneratedOption[]): {
  long: Map<string, GeneratedOption>;
  short: Map<string, GeneratedOption>;
} {
  const long = new Map<string, GeneratedOption>();
  const short = new Map<string, GeneratedOption>();
  for (const option of options) {
    long.set(option.name, option);
    if (option.shorthand) {
      short.set(option.shorthand, option);
    }
  }
  return { long, short };
}

function ancestorOptions(
  canonicalPath: string,
  byPath: Map<string, GeneratedCommand>
): GeneratedOption[] {
  const parts = canonicalPath.split(' ');
  const options: GeneratedOption[] = [];
  for (let i = 1; i <= parts.length; i++) {
    const ancestor = byPath.get(parts.slice(0, i).join(' '));
    if (ancestor) {
      options.push(...ancestor.options);
    }
  }
  return options;
}

function attemptedPathFromTokens(
  pathTokens: string[],
  resolve: ReturnType<typeof buildAliasResolver>
): string {
  const concrete = pathTokens.filter(t => !isDocPlaceholder(t));
  const resolved = resolve(concrete);
  if (resolved) {
    if (
      resolved.remaining.length > 0 &&
      !isFlagToken(resolved.remaining[0]) &&
      !isDocPlaceholder(resolved.remaining[0])
    ) {
      return [...resolved.path, resolved.remaining[0]].join(' ');
    }
    return resolved.path.join(' ');
  }
  return concrete.join(' ');
}

export function validateExample(
  example: ExtractedExample,
  manifest: GeneratedManifest,
  resolve: ReturnType<typeof buildAliasResolver>,
  byPath: Map<string, GeneratedCommand>,
  valuedNames: { long: Set<string>; short: Set<string> }
): ExampleValidationFailure | null {
  if (example.tokens.length === 0) {
    return null;
  }

  const { pathTokens } = splitPathAndFlagTokens(example.tokens, valuedNames);
  const concretePathTokens = pathTokens.filter(t => !isDocPlaceholder(t));

  if (pathTokens.length === 0 || concretePathTokens.length === 0) {
    // Flag-only (`vercel --prod`) or placeholder-only (`vercel <command> --help`).
    if (concretePathTokens.length === 0 && pathTokens.some(isDocPlaceholder)) {
      return validateFlagsForCommand(
        example,
        'deploy',
        example.tokens,
        manifest,
        byPath
      );
    }
    if (pathTokens.length === 0) {
      return validateFlagsForCommand(
        example,
        'deploy',
        example.tokens,
        manifest,
        byPath
      );
    }
  }

  // `vercel vcr <subcommand> --help` → validate flags on the resolvable prefix.
  if (pathTokens.some(isDocPlaceholder)) {
    const resolvedPrefix = resolve(concretePathTokens);
    if (!resolvedPrefix) {
      return null;
    }
    return validateFlagsForCommand(
      example,
      resolvedPrefix.path.join(' '),
      example.tokens,
      manifest,
      byPath
    );
  }

  const resolved = resolve(concretePathTokens);
  const attempted = attemptedPathFromTokens(pathTokens, resolve);

  if (!resolved) {
    return {
      file: example.file,
      line: example.line,
      raw: example.raw,
      message: `Unknown command path starting at "${concretePathTokens[0]}"`,
      attemptedPath: attempted,
    };
  }

  const command = byPath.get(resolved.path.join(' '));
  if (!command) {
    return {
      file: example.file,
      line: example.line,
      raw: example.raw,
      message: `Resolved path "${resolved.path.join(' ')}" missing from command model`,
      attemptedPath: attempted,
    };
  }

  if (resolved.remaining.length > 0) {
    const next = resolved.remaining[0];
    const hasVisibleSubcommands = command.subcommands.some(name => {
      const child = byPath.get(`${command.canonicalPath} ${name}`);
      return Boolean(child && !child.hidden);
    });
    if (
      !isDocPlaceholder(next) &&
      hasVisibleSubcommands &&
      command.arguments.length === 0
    ) {
      return {
        file: example.file,
        line: example.line,
        raw: example.raw,
        message: `Unknown subcommand "${next}" for \`vercel ${command.canonicalPath}\``,
        attemptedPath: attempted,
      };
    }
  }

  return validateFlagsForCommand(
    example,
    command.canonicalPath,
    example.tokens,
    manifest,
    byPath
  );
}

function validateFlagsForCommand(
  example: ExtractedExample,
  canonicalPath: string,
  tokens: string[],
  manifest: GeneratedManifest,
  byPath: Map<string, GeneratedCommand>
): ExampleValidationFailure | null {
  const command = byPath.get(canonicalPath);
  if (!command) {
    return {
      file: example.file,
      line: example.line,
      raw: example.raw,
      message: `Resolved path "${canonicalPath}" missing from command model`,
      attemptedPath: canonicalPath,
    };
  }

  const commandOptions = optionLookup([
    ...ancestorOptions(canonicalPath, byPath),
  ]);
  const globalOptions = optionLookup(manifest.globalOptions);

  for (const token of tokens) {
    if (!isFlagToken(token)) continue;

    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      const name = eq === -1 ? token.slice(2) : token.slice(2, eq);
      if (!name) continue;
      let option = commandOptions.long.get(name);
      if (!option && !command.disabledGlobalOptions.includes(name)) {
        option = globalOptions.long.get(name);
      }
      if (!option) {
        return {
          file: example.file,
          line: example.line,
          raw: example.raw,
          message: `Unknown option --${name} for \`vercel ${canonicalPath}\``,
          attemptedPath: canonicalPath,
        };
      }
      if (option.deprecated) {
        return {
          file: example.file,
          line: example.line,
          raw: example.raw,
          message: `Deprecated option --${name} used for \`vercel ${canonicalPath}\``,
          attemptedPath: canonicalPath,
        };
      }
      continue;
    }

    const chars = token.slice(1);
    for (const ch of chars) {
      let option = commandOptions.short.get(ch);
      if (!option) {
        const global = globalOptions.short.get(ch);
        if (global && !command.disabledGlobalOptions.includes(global.name)) {
          option = global;
        }
      }
      if (!option) {
        return {
          file: example.file,
          line: example.line,
          raw: example.raw,
          message: `Unknown option -${ch} for \`vercel ${canonicalPath}\``,
          attemptedPath: canonicalPath,
        };
      }
      if (option.deprecated) {
        return {
          file: example.file,
          line: example.line,
          raw: example.raw,
          message: `Deprecated option -${ch} (--${option.name}) used for \`vercel ${canonicalPath}\``,
          attemptedPath: canonicalPath,
        };
      }
    }
  }

  return null;
}

export async function loadValidationExceptions(): Promise<ValidationExceptions> {
  const raw = await readFile(validationExceptionsPath, 'utf8');
  const parsed = JSON.parse(raw) as ValidationExceptions;
  if (!parsed.invalidExamples || !parsed.delegatedFamilies) {
    throw new Error('validation-exceptions.json missing required keys');
  }
  for (const entry of [
    ...parsed.invalidExamples,
    ...parsed.delegatedFamilies,
  ]) {
    if (!entry.path || !entry.reason) {
      throw new Error('Every exception requires path and reason');
    }
  }
  return parsed;
}

export async function listSkillMarkdownFiles(): Promise<string[]> {
  const files = [
    join(skillDir, 'SKILL.md'),
    join(skillDir, 'command', 'vercel.md'),
  ];
  const references = await readdir(join(skillDir, 'references'));
  for (const name of references.sort()) {
    if (name.endsWith('.md')) {
      files.push(join(skillDir, 'references', name));
    }
  }
  return files;
}

function pathMatchesException(
  attemptedPath: string,
  exceptionPath: string
): boolean {
  return (
    attemptedPath === exceptionPath ||
    attemptedPath.startsWith(`${exceptionPath} `)
  );
}

export async function validateSkillExamples(
  manifest: GeneratedManifest
): Promise<ExampleValidationFailure[]> {
  const exceptions = await loadValidationExceptions();
  const resolve = buildAliasResolver(manifest.commands);
  const byPath = new Map(
    manifest.commands.map(command => [command.canonicalPath, command])
  );
  const valuedNames = collectValuedOptionNames(manifest);
  const delegated = exceptions.delegatedFamilies.map(e => e.path);
  const invalidExceptions = exceptions.invalidExamples;

  const usedInvalid = new Set<string>();
  const usedDelegated = new Set<string>();
  const failures: ExampleValidationFailure[] = [];

  const files = await listSkillMarkdownFiles();
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const examples = extractExamplesFromMarkdown(file, content);
    for (const example of examples) {
      const { pathTokens } = splitPathAndFlagTokens(
        example.tokens,
        valuedNames
      );
      const attempted = attemptedPathFromTokens(pathTokens, resolve);

      const delegatedHit = delegated.find(d =>
        pathMatchesException(attempted, d)
      );
      if (delegatedHit) {
        usedDelegated.add(delegatedHit);
        continue;
      }

      const failure = validateExample(
        example,
        manifest,
        resolve,
        byPath,
        valuedNames
      );
      if (!failure) continue;

      const exception = invalidExceptions.find(e =>
        pathMatchesException(failure.attemptedPath, e.path)
      );
      if (exception) {
        usedInvalid.add(exception.path);
        continue;
      }

      failures.push({
        ...failure,
        file: file.replace(`${skillDir}/`, 'skills/vercel-cli/'),
      });
    }
  }

  for (const entry of invalidExceptions) {
    if (!usedInvalid.has(entry.path)) {
      failures.push({
        file: 'skills/vercel-cli/validation-exceptions.json',
        line: 0,
        raw: entry.path,
        message: `Unused invalidExamples exception for "${entry.path}"`,
        attemptedPath: entry.path,
      });
    }
  }
  for (const entry of exceptions.delegatedFamilies) {
    if (!usedDelegated.has(entry.path)) {
      failures.push({
        file: 'skills/vercel-cli/validation-exceptions.json',
        line: 0,
        raw: entry.path,
        message: `Unused delegatedFamilies exception for "${entry.path}"`,
        attemptedPath: entry.path,
      });
    }
  }

  return failures;
}
