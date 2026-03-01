import chalk from 'chalk';
import { readFile } from 'fs/promises';
import { join } from 'path';
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
import { help } from '../help';
import { skillsCommand } from './command';
import table from '../../util/output/table';
import output from '../../output-manager';

const SKILLS_API = 'https://skills.sh/api/search';

// Dependencies worth searching for skills — curated to avoid noise
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
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

interface SearchResponse {
  query: string;
  skills: SkillResult[];
  count: number;
  duration_ms: number;
}

async function searchSkills(query: string): Promise<SkillResult[]> {
  try {
    const url = `${SKILLS_API}?q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as SearchResponse;
    return data.skills ?? [];
  } catch {
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
      return { name: detected[0].name, slug: detected[0].slug ?? '' };
    }
  } catch {
    // Framework detection failed — not critical
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

  if (parsedArgs.flags['--help']) {
    output.print(help(skillsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const query = parsedArgs.args[1]; // args[0] is 'skills'
  const { cwd } = client;

  if (query) {
    // Direct search mode
    output.spinner('Searching skills...');
    const results = await searchSkills(query);
    output.stopSpinner();
    return displayResults(client, results, asJson, `Search: "${query}"`);
  }

  // Auto-detect mode
  output.spinner('Detecting project...');

  const [framework, packageInfo] = await Promise.all([
    detectProjectFramework(cwd),
    readPackageDeps(cwd),
  ]);

  const { deps, language } = packageInfo;

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

  // Build search queries from signals
  const queries: { term: string; weight: number }[] = [];
  if (framework) {
    queries.push({ term: framework.slug || framework.name, weight: 3 });
  }
  for (const dep of deps.slice(0, 5)) {
    // Limit to top 5 deps to avoid too many API calls
    const cleanDep = dep.replace(/^@/, '').replace(/\//, '-');
    queries.push({ term: cleanDep, weight: 2 });
  }
  queries.push({ term: 'vercel', weight: 1 });

  // Parallel search
  const searchResults = await Promise.allSettled(
    queries.map(async q => ({
      weight: q.weight,
      skills: await searchSkills(q.term),
    }))
  );

  // Merge, deduplicate, and rank
  const skillMap = new Map<string, SkillResult & { score: number }>();

  for (const result of searchResults) {
    if (result.status !== 'fulfilled') continue;
    const { weight, skills: resultSkills } = result.value;
    for (const skill of resultSkills) {
      const existing = skillMap.get(skill.skillId);
      const score = skill.installs * weight;
      if (!existing || score > existing.score) {
        skillMap.set(skill.skillId, { ...skill, score });
      }
    }
  }

  const ranked = Array.from(skillMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  output.stopSpinner();
  return displayResults(
    client,
    ranked,
    asJson,
    `Detected: ${detectedParts.join(' + ')}`
  );
}

function displayResults(
  client: Client,
  results: SkillResult[],
  asJson: boolean,
  context: string
): number {
  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ context, skills: results }, null, 2)}\n`
    );
    return 0;
  }

  if (results.length === 0) {
    output.log('No skills found.');
    output.log(
      `Try searching directly: ${chalk.cyan('vercel skills <query>')}`
    );
    return 0;
  }

  const tableData = [
    ['Skill', 'Installs', 'Source'].map(h => chalk.bold(chalk.cyan(h))),
    ...results.map(s => [
      s.skillId,
      formatInstalls(s.installs),
      chalk.gray(s.source),
    ]),
  ];

  output.log(`\n${table(tableData, { hsep: 4 })}`);
  output.print(
    `\n${chalk.gray('Install with:')} npx skills add <source> --skill <name>\n`
  );
  output.print(`${chalk.gray('Learn more:')} https://skills.sh\n`);
  return 0;
}
