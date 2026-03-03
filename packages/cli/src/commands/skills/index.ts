import chalk from 'chalk';
import { access, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';
import { frameworkList } from '@vercel/frameworks';
import {
  detectFrameworks,
  LocalFileSystemDetector,
} from '@vercel/fs-detectors';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import table from '../../util/output/table';
import output from '../../output-manager';
import { help } from '../help';
import { skillsCommand } from './command';
import { SkillsTelemetryClient } from '../../util/telemetry/commands/skills';

const SKILLS_API = 'https://skills.sh/api/search';
const FETCH_TIMEOUT_MS = 10_000;
const MIN_INSTALLS = 100;
const MAX_RESULTS = 8;
const MAX_FRAMEWORK_RESULTS = 4;
const MAX_DEP_QUERIES = 5;

const NOTABLE_DEPS = new Set([
  'prisma',
  '@prisma/client',
  'drizzle-orm',
  'mongoose',
  'typeorm',
  'sequelize',
  'tailwindcss',
  'next-auth',
  '@auth/core',
  '@clerk/nextjs',
  'lucia',
  '@supabase/supabase-js',
  '@trpc/server',
  'graphql',
  '@apollo/client',
  'stripe',
  'zustand',
  '@reduxjs/toolkit',
  '@tanstack/react-query',
  'playwright',
  '@playwright/test',
  'cypress',
  'vitest',
  'jest',
  'sanity',
  'payload',
  'contentful',
  'turborepo',
  'docker-compose',
  'firebase',
  '@sentry/nextjs',
  'zod',
  'convex',
  'upstash',
]);

interface SkillResult {
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

interface SearchResponse {
  skills: SkillResult[];
}

type SearchTier = 'framework' | 'dependency';

async function searchSkills(query: string): Promise<SkillResult[]> {
  try {
    const url = `${SKILLS_API}?q=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        output.debug(`Skills API returned ${res.status} for query "${query}"`);
        return [];
      }
      const data = (await res.json()) as SearchResponse;
      return data.skills ?? [];
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    output.debug(`Skills search failed for "${query}": ${err}`);
    return [];
  }
}

async function detectProjectFramework(
  cwd: string
): Promise<{ name: string; slug: string } | null> {
  try {
    const fs = new LocalFileSystemDetector(cwd);
    const detected = await detectFrameworks({ fs, frameworkList });
    if (detected.length > 0) {
      return { name: detected[0].name, slug: detected[0].slug || '' };
    }
  } catch {
    // not critical
  }
  return null;
}

async function readPackageDeps(
  cwd: string
): Promise<{ deps: string[]; language: string }> {
  try {
    const raw = await readFile(join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw);
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    const depNames = Object.keys(allDeps);
    const notable = depNames.filter(d => NOTABLE_DEPS.has(d));
    const language = depNames.includes('typescript')
      ? 'typescript'
      : 'javascript';
    return { deps: notable, language };
  } catch {
    return { deps: [], language: 'unknown' };
  }
}

function cleanDepName(dep: string): string {
  return dep.replace(/^@/, '').replace(/\//g, '-');
}

async function isSkillInstalled(name: string, cwd: string): Promise<boolean> {
  const sanitized = name.toLowerCase().replace(/\s+/g, '-');
  const dirs = [
    join(cwd, '.agents', 'skills', sanitized),
    join(homedir(), '.agents', 'skills', sanitized),
  ];
  for (const dir of dirs) {
    try {
      await access(dir);
      return true;
    } catch {
      // not found
    }
  }
  return false;
}

function formatInstalls(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default async function skills(client: Client) {
  let parsedArgs;

  try {
    parsedArgs = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(skillsCommand.options)
    );
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new SkillsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('skills');
    output.print(help(skillsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  telemetry.trackCliFlagJson(parsedArgs.flags['--json']);
  telemetry.trackCliArgumentQuery(parsedArgs.args[1]);

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const query = parsedArgs.args[1];
  const { cwd } = client;
  const yes = parsedArgs.flags['--yes'] ?? false;

  try {
    if (query) {
      return await directSearch(client, query, asJson, cwd);
    }
    return await autoDetect(client, cwd, asJson, yes);
  } catch (err) {
    printError(err);
    return 1;
  }
}

async function directSearch(
  client: Client,
  query: string,
  asJson: boolean,
  cwd: string
): Promise<number> {
  output.spinner('Searching skills...');
  const results = await searchSkills(query);
  output.stopSpinner();

  const filtered = results
    .filter(s => s.installs >= MIN_INSTALLS)
    .slice(0, MAX_RESULTS);

  const { exitCode } = await displayResults(
    client,
    filtered,
    asJson,
    `Search: "${query}"`,
    cwd
  );
  return exitCode;
}

async function autoDetect(
  client: Client,
  cwd: string,
  asJson: boolean,
  yes: boolean
): Promise<number> {
  output.spinner('Detecting project...');

  const [framework, { deps, language }] = await Promise.all([
    detectProjectFramework(cwd),
    readPackageDeps(cwd),
  ]);

  if (!framework && deps.length === 0) {
    output.stopSpinner();
    output.log(
      'Could not detect a framework or notable dependencies in this directory.'
    );
    output.log(
      `Try searching directly: ${chalk.cyan('vercel skills <query>')}`
    );
    return 0;
  }

  const detectedParts: string[] = [];
  if (framework) detectedParts.push(framework.name);
  if (language !== 'unknown') detectedParts.push(language);
  if (deps.length > 0) detectedParts.push(deps.join(', '));

  output.stopSpinner();
  output.log(`Detected: ${chalk.bold(detectedParts.join(' + '))}`);
  output.spinner('Searching for relevant skills...');

  const queries: { term: string; tier: SearchTier }[] = [];
  if (framework) {
    const slug = (framework.slug || framework.name)
      .toLowerCase()
      .replace(/-\d+$/, '');
    queries.push({ term: slug, tier: 'framework' });
    const base = slug.replace(/(kit|js)$/, '');
    if (base && base !== slug) {
      queries.push({ term: base, tier: 'framework' });
    }
    output.debug(`Framework queries: ${queries.map(q => q.term).join(', ')}`);
  }
  for (const dep of deps.slice(0, MAX_DEP_QUERIES)) {
    queries.push({ term: cleanDepName(dep), tier: 'dependency' });
  }
  output.debug(
    `Total queries: ${queries.map(q => `${q.term} (${q.tier})`).join(', ')}`
  );

  const searchResults = await Promise.allSettled(
    queries.map(async q => ({
      tier: q.tier,
      skills: await searchSkills(q.term),
    }))
  );

  const frameworkSkills = new Map<string, SkillResult>();
  const depSkills = new Map<string, SkillResult>();

  for (const result of searchResults) {
    if (result.status !== 'fulfilled') continue;
    const { tier, skills: resultSkills } = result.value;
    const bucket = tier === 'framework' ? frameworkSkills : depSkills;
    for (const skill of resultSkills) {
      if (skill.installs < MIN_INSTALLS) continue;
      const existing = bucket.get(skill.skillId);
      if (!existing || skill.installs > existing.installs) {
        bucket.set(skill.skillId, skill);
      }
    }
  }

  const sortByInstalls = (a: SkillResult, b: SkillResult) =>
    b.installs - a.installs;
  const topFramework = Array.from(frameworkSkills.values())
    .sort(sortByInstalls)
    .slice(0, MAX_FRAMEWORK_RESULTS);

  for (const fw of topFramework) {
    depSkills.delete(fw.skillId);
  }
  const topDeps = Array.from(depSkills.values())
    .sort(sortByInstalls)
    .slice(0, MAX_RESULTS - topFramework.length);

  const ranked = [...topFramework, ...topDeps];

  output.debug(
    `Results: ${topFramework.length} framework + ${topDeps.length} dependency skills`
  );

  output.stopSpinner();
  const {
    exitCode,
    results: displayedResults,
    installedChecks,
  } = await displayResults(
    client,
    ranked,
    asJson,
    `Detected: ${detectedParts.join(' + ')}`,
    cwd
  );

  if (exitCode !== 0 || asJson) return exitCode;

  const installable = displayedResults
    .map((s, i) => ({ ...s, installed: installedChecks[i] }))
    .filter(s => !s.installed);

  if (installable.length === 0) {
    output.log(chalk.green('All recommended skills are already installed.'));
    return 0;
  }

  let toInstall: SkillResult[];

  if (!client.stdin.isTTY || yes) {
    toInstall = installable;
  } else {
    const selected = await client.input.checkbox<SkillResult>({
      message: 'Select skills to install',
      choices: installable.map(s => ({
        name: `${s.skillId} ${chalk.gray(`(${s.source})`)}`,
        value: s,
        checked: true,
      })),
    });

    if (!Array.isArray(selected) || selected.length === 0) {
      output.log('No skills selected.');
      return 0;
    }
    toInstall = selected;
  }

  output.log(
    `\nInstalling ${toInstall.length} skill${toInstall.length > 1 ? 's' : ''}...\n`
  );

  const bySource = new Map<string, string[]>();
  for (const skill of toInstall) {
    const existing = bySource.get(skill.source) ?? [];
    existing.push(skill.skillId);
    bySource.set(skill.source, existing);
  }

  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const [source, skillIds] of bySource) {
    const label = skillIds.length === 1 ? skillIds[0] : skillIds.join(', ');
    output.spinner(`Installing ${label} from ${source}...`);
    const args = ['skills', 'add', source];
    for (const id of skillIds) {
      args.push('--skill', id);
    }
    args.push('-y');
    output.debug(`> npx ${args.join(' ')}`);
    const code = await runCommand('npx', args);
    output.stopSpinner();
    if (code !== 0) {
      failed.push(...skillIds);
    } else {
      succeeded.push(...skillIds);
    }
  }

  if (succeeded.length > 0) {
    output.success(
      `Installed ${succeeded.length} skill${succeeded.length > 1 ? 's' : ''}: ${succeeded.join(', ')}`
    );
  }
  if (failed.length > 0) {
    output.error(`Failed to install: ${failed.join(', ')}`);
  }
  return 0;
}

interface DisplayResult {
  exitCode: number;
  results: SkillResult[];
  installedChecks: boolean[];
}

async function displayResults(
  client: Client,
  results: SkillResult[],
  asJson: boolean,
  context: string,
  cwd: string
): Promise<DisplayResult> {
  const empty = { exitCode: 0, results, installedChecks: [] };

  if (results.length === 0) {
    output.log('No skills found.');
    output.log(
      `Try searching directly: ${chalk.cyan('vercel skills <query>')}`
    );
    return empty;
  }

  const installedChecks = await Promise.all(
    results.map(s => isSkillInstalled(s.skillId, cwd))
  );

  if (asJson) {
    output.stopSpinner();
    const skillsWithStatus = results.map((s, i) => ({
      ...s,
      installed: installedChecks[i],
    }));
    client.stdout.write(
      `${JSON.stringify({ context, skills: skillsWithStatus }, null, 2)}\n`
    );
    return { exitCode: 0, results, installedChecks };
  }

  const tableData = [
    ['Skill', 'Installs', 'Source', ''].map(h => chalk.bold(chalk.cyan(h))),
    ...results.map((s, i) => [
      s.skillId,
      formatInstalls(s.installs),
      chalk.gray(s.source),
      installedChecks[i] ? chalk.green('installed') : '',
    ]),
  ];

  output.log(`\n${table(tableData, { hsep: 4 })}`);
  return { exitCode: 0, results, installedChecks };
}

function runCommand(cmd: string, args: string[]): Promise<number> {
  return new Promise(resolve => {
    const child = spawn(cmd, args, {
      stdio: 'pipe',
    });
    child.on('close', code => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}
