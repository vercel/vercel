import chalk from 'chalk';
import { PLANS, type PricingResult, type Plan } from './types';

const PLAN_LABEL: Record<Plan, string> = {
  hobby: 'Hobby',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const PLAN_COLOR = chalk.magenta;

const PLAN_SCOPE: Record<Plan, string> = {
  hobby: 'available on Hobby, Pro, and Enterprise',
  pro: 'available on Pro and Enterprise',
  enterprise: 'available on Enterprise',
};

export function formatPlanLabel(plan: string): string {
  if (!plan) {
    return 'Unknown';
  }
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function formatPricing(result: PricingResult): string {
  const lines: string[] = [];

  if (result.team) {
    lines.push(
      `Current team: ${chalk.bold(result.team.slug)}${
        result.team.name && result.team.name !== result.team.slug
          ? ` (${result.team.name})`
          : ''
      }`
    );
    lines.push(`Current plan: ${formatCurrentPlan(result.team.plan)}`);
  } else {
    lines.push('Current team: not logged in');
  }

  lines.push(`Source: ${result.source}`);

  if (result.query) {
    lines.push(`Query: ${result.query}`);
  }

  lines.push('');

  if (result.summary.matched === 0) {
    lines.push(
      result.query
        ? `No features matching "${result.query}". Try a broader query, or run without a query to list all features.`
        : 'No features found in the pricing table.'
    );
    return `${lines.join('\n')}\n`;
  }

  if (result.query) {
    lines.push(...formatQueryMatches(result));
    return `${lines.join('\n')}\n`;
  }

  lines.push(
    'Features are grouped by the lowest plan that includes them. Values are from the latest public pricing table.'
  );
  lines.push('');

  for (const plan of PLANS) {
    const features = result.features[plan];
    lines.push(formatPlanHeader(plan));
    if (features.length === 0) {
      lines.push('');
      lines.push('  None');
      lines.push('');
      continue;
    }

    let currentCategory = '';
    let headerShown = false;
    for (const feature of features) {
      const { standalone } = feature;
      if (feature.category !== currentCategory) {
        currentCategory = feature.category;
        headerShown = false;
        lines.push('');
      }
      if (!standalone && !headerShown) {
        lines.push(`  ${chalk.bold(currentCategory)}`);
        headerShown = true;
      }
      const marker =
        feature.availableOnCurrentPlan === false
          ? chalk.dim(' [not on current plan]')
          : '';
      const indent = standalone ? '  ' : '    ';
      lines.push(
        `${indent}${padName(feature.name)}${feature.values[plan]}${marker}`
      );
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function formatQueryMatches(result: PricingResult): string[] {
  const lines: string[] = [
    `Matching features (${result.summary.matched}):`,
    '',
  ];
  const currentPlan = result.team?.normalizedPlan ?? null;

  for (const plan of PLANS) {
    for (const feature of result.features[plan]) {
      lines.push(chalk.bold(feature.name));
      lines.push(`  Category: ${feature.section} / ${feature.category}`);
      if (feature.description) {
        lines.push(`  Description: ${feature.description}`);
      }
      for (const column of PLANS) {
        const current =
          currentPlan === column ? `  ${chalk.cyan('← current plan')}` : '';
        const availability = feature.available[column]
          ? feature.values[column]
          : 'Not available';
        lines.push(
          `  ${planSwatch()}${PLAN_LABEL[column]}: ${availability}${current}`
        );
      }
      if (feature.availableOnCurrentPlan === null) {
        lines.push('  Available on current plan: unknown');
      } else {
        lines.push(
          `  Available on ${formatPlanLabel(result.team?.plan ?? '')}: ${
            feature.availableOnCurrentPlan ? 'yes' : 'no'
          }`
        );
      }
      lines.push('');
    }
  }

  return lines;
}

function formatCurrentPlan(plan: string): string {
  return PLAN_COLOR.bold(formatPlanLabel(plan));
}

function formatPlanHeader(plan: Plan): string {
  const title = `  ${PLAN_LABEL[plan].toUpperCase()}  `;
  const rule = '━'.repeat(48);
  return [
    PLAN_COLOR.bold.inverse(title),
    PLAN_COLOR(rule),
    chalk.dim(PLAN_SCOPE[plan]),
  ].join('\n');
}

function planSwatch(): string {
  return PLAN_COLOR.bold('█ ');
}

function padName(name: string): string {
  const width = 42;
  if (name.length >= width) {
    return `${name}  `;
  }
  return name.padEnd(width);
}
