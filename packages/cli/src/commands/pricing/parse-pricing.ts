import stripAnsi from 'strip-ansi';
import {
  PLANS,
  type Feature,
  type FeatureWithCurrentPlan,
  type Plan,
} from './types';

export const MIN_PRICING_FEATURES = 8;

const PLAN_HEADER = new Set<string>(PLANS);
const UNAVAILABLE_VALUES = new Set([
  '',
  '-',
  '—',
  '–',
  'n/a',
  'na',
  'not available',
]);

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isFeatureAvailable(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/[—–]/g, '-');
  return !UNAVAILABLE_VALUES.has(normalized);
}

export function normalizePlan(plan: string | null | undefined): Plan | null {
  if (!plan) {
    return null;
  }
  const normalized = plan.trim().toLowerCase();
  if (normalized === 'plus') {
    return 'pro';
  }
  return PLANS.find(item => item === normalized) ?? null;
}

export function minPlanForFeature(available: Record<Plan, boolean>): Plan {
  for (const plan of PLANS) {
    if (available[plan]) {
      return plan;
    }
  }
  return 'enterprise';
}

export function splitFeaturesByMinPlan(
  features: FeatureWithCurrentPlan[]
): Record<Plan, FeatureWithCurrentPlan[]> {
  const grouped: Record<Plan, FeatureWithCurrentPlan[]> = {
    hobby: [],
    pro: [],
    enterprise: [],
  };
  for (const feature of features) {
    grouped[feature.minPlan].push(feature);
  }
  return grouped;
}

export function withCurrentPlanAvailability(
  features: Feature[],
  currentPlan: Plan | null
): FeatureWithCurrentPlan[] {
  return features.map(feature => ({
    ...feature,
    availableOnCurrentPlan: currentPlan ? feature.available[currentPlan] : null,
  }));
}

export function featureMatchesQuery(feature: Feature, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const haystack = [
    feature.name,
    feature.slug,
    feature.section,
    feature.category,
    feature.description ?? '',
    ...PLANS.map(plan => feature.values[plan]),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export function sanitizeRemoteText(value: string): string {
  const withoutHyperlinks = value.replace(
    // eslint-disable-next-line no-control-regex
    /\u001b\]8;;.*?(?:\u0007|\u001b\\)/gs,
    ''
  );
  return (
    stripAnsi(withoutHyperlinks)
      // `[text](url)` -> `text`, so linked headings don't leak URLs.
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*/g, '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function isValidPricingTable(features: Feature[]): boolean {
  if (features.length < MIN_PRICING_FEATURES) {
    return false;
  }
  const minPlans = new Set(features.map(feature => feature.minPlan));
  return (
    minPlans.has('hobby') && minPlans.has('pro') && minPlans.has('enterprise')
  );
}

export function parsePricingMarkdown(markdown: string): Feature[] {
  const lines = markdown.split(/\r?\n/);
  const features: Feature[] = [];
  const descriptions = new Map<string, string>();
  let section = '';
  let category = '';
  let pendingDescription: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = parseHeading(line);
    if (heading) {
      if (heading.level === 2) {
        section = heading.text;
        category = '';
      } else {
        category = heading.text;
      }
      pendingDescription = [];
      continue;
    }

    if (isTableStart(line, lines[i + 1])) {
      const parsed = parseTable(lines, i);
      if (parsed) {
        const contextName = category || section;
        const contextDescription =
          sanitizeRemoteText(pendingDescription.join(' ')) || null;
        for (const row of parsed.rows) {
          const name = sanitizeRemoteText(row.feature ?? contextName);
          if (!name) {
            continue;
          }
          const hobby = sanitizeRemoteText(row.hobby);
          const pro = sanitizeRemoteText(row.pro);
          const enterprise = sanitizeRemoteText(row.enterprise);
          const available = {
            hobby: isFeatureAvailable(hobby),
            pro: isFeatureAvailable(pro),
            enterprise: isFeatureAvailable(enterprise),
          };
          features.push({
            name,
            slug: slugify(name),
            section,
            category: category || section,
            standalone: row.feature === undefined,
            description: row.feature ? null : contextDescription,
            values: {
              hobby,
              pro,
              enterprise,
            },
            available,
            minPlan: minPlanForFeature(available),
          });
        }
        i = parsed.endIndex;
        pendingDescription = [];
        continue;
      }
    }

    const description = parseDescriptionLine(line);
    if (description) {
      descriptions.set(description.name, description.text);
      continue;
    }

    const trimmed = sanitizeRemoteText(line);
    if (trimmed && !trimmed.startsWith('<') && !trimmed.startsWith('[')) {
      pendingDescription.push(trimmed);
    }
  }

  for (const feature of features) {
    const description = descriptions.get(feature.name);
    if (description && !feature.description) {
      feature.description = description;
    }
  }

  return features;
}

function parseHeading(
  line: string
): { level: 2 | 3; text: string } | undefined {
  const match = /^(#{2,3})\s+(.+)$/.exec(line.trim());
  if (!match) {
    return undefined;
  }
  const level = match[1].length === 2 ? 2 : 3;
  const text = sanitizeRemoteText(match[2]);
  if (!text) {
    return undefined;
  }
  return { level, text };
}

function isTableStart(line: string, nextLine: string | undefined): boolean {
  return Boolean(
    line.trim().startsWith('|') && nextLine && isSeparatorRow(nextLine)
  );
}

function isSeparatorRow(line: string): boolean {
  return /^\|[\s:|-]+\|$/.test(line.trim());
}

function parseTable(
  lines: string[],
  startIndex: number
): { rows: TableRow[]; endIndex: number } | undefined {
  const headerCells = splitRow(lines[startIndex]);
  if (!headerCells) {
    return undefined;
  }
  const headerMap = mapHeaders(headerCells);
  if (
    headerMap.hobby === undefined ||
    headerMap.pro === undefined ||
    headerMap.enterprise === undefined
  ) {
    return undefined;
  }

  const rows: TableRow[] = [];
  let index = startIndex + 2;
  while (index < lines.length && lines[index].trim().startsWith('|')) {
    if (isSeparatorRow(lines[index])) {
      index += 1;
      continue;
    }
    const cells = splitRow(lines[index]);
    index += 1;
    if (!cells) {
      continue;
    }
    const hobby = cells[headerMap.hobby] ?? '';
    const pro = cells[headerMap.pro] ?? '';
    const enterprise = cells[headerMap.enterprise] ?? '';
    const feature =
      headerMap.feature === undefined ? undefined : cells[headerMap.feature];
    if (!hobby && !pro && !enterprise && !feature) {
      continue;
    }
    rows.push({
      feature: feature?.trim() || undefined,
      hobby,
      pro,
      enterprise,
    });
  }

  return { rows, endIndex: index - 1 };
}

function mapHeaders(cells: string[]): {
  feature?: number;
  hobby?: number;
  pro?: number;
  enterprise?: number;
} {
  const mapped: {
    feature?: number;
    hobby?: number;
    pro?: number;
    enterprise?: number;
  } = {};
  cells.forEach((cell, index) => {
    const header = sanitizeRemoteText(cell).toLowerCase();
    if (PLAN_HEADER.has(header)) {
      mapped[header as Plan] = index;
      return;
    }
    if (header === 'feature' || mapped.feature === undefined) {
      mapped.feature = index;
    }
  });
  return mapped;
}

function splitRow(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) {
    return undefined;
  }
  const cells = trimmed.split('|').slice(1, -1);
  return cells.map(cell => cell.trim());
}

function parseDescriptionLine(
  line: string
): { name: string; text: string } | undefined {
  // pricing.md uses both `- Name: text` and `- **Name:** text`.
  const match = /^- (?:\*\*)?(.+?):(?:\*\*)?\s+(.+)$/.exec(line.trim());
  if (!match) {
    return undefined;
  }
  const name = sanitizeRemoteText(match[1]);
  const text = sanitizeRemoteText(match[2]);
  if (!name || !text) {
    return undefined;
  }
  return { name, text };
}

type TableRow = {
  feature?: string;
  hobby: string;
  pro: string;
  enterprise: string;
};
