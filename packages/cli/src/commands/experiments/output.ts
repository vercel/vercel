import chalk from 'chalk';
import ms from 'ms';
import type Client from '../../util/client';
import formatTable from '../../util/format-table';
import strlen from '../../util/strlen';
import { withGlobalFlags } from '../../util/agent-output';
import {
  ALIGNED_LABEL_WIDTH,
  printAlignedLabel,
} from '../../util/output/print-aligned-label';
import output from '../../output-manager';
import type {
  DiagnosedEvent,
  Experiment,
  ExperimentAnalysis,
  ExperimentAnalysisAssessment,
  ExperimentDiagnosis,
  NextCommand,
} from './types';

const CONTAMINATION_WARNING_RATIO = 0.01;

function safeResourceToken(value: string | undefined): string | undefined {
  return value && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
    ? value
    : undefined;
}

export function getExperimentIdentifier(experiment: Experiment): string {
  return experiment.slug || experiment.id;
}

function experimentToken(experiment: Experiment): string | undefined {
  return safeResourceToken(experiment.slug) ?? safeResourceToken(experiment.id);
}

function command(client: Client, template: string): string {
  return withGlobalFlags(client, template, { preserveProject: true });
}

export function buildExperimentNextCommands(
  client: Client,
  experiment: Experiment
): NextCommand[] {
  const id = experimentToken(experiment);
  const flag = safeResourceToken(experiment.flagSlug);
  if (!id) return [];

  const inspectFlag = flag
    ? {
        label: 'Inspect flag',
        command: command(client, `flags inspect ${flag}`),
      }
    : undefined;

  if (experiment.state === 'draft') {
    return [
      {
        label: 'Start experiment',
        command: command(client, `experiments start ${id} --ramp <percentage>`),
      },
      {
        label: 'Edit settings',
        command: command(client, `experiments update ${id} --file <file>`),
      },
      ...(inspectFlag ? [inspectFlag] : []),
      {
        label: 'Delete experiment',
        command: command(client, `experiments delete ${id} --confirm ${id}`),
      },
    ];
  }

  if (experiment.state === 'running') {
    return [
      {
        label: 'Analyze results',
        command: command(client, `experiments analyze ${id}`),
      },
      {
        label: 'Ramp exposures',
        command: command(
          client,
          `experiments set-ramp ${id} --ramp <percentage>`
        ),
      },
      {
        label: 'Make decision',
        command: command(
          client,
          `experiments decide ${id} --winner <variant-id> --rationale <text>`
        ),
      },
      ...(inspectFlag ? [inspectFlag] : []),
    ];
  }

  return [
    {
      label: 'Analyze results',
      command: command(client, `experiments analyze ${id}`),
    },
    {
      label: 'Return to draft',
      command: command(client, `experiments return-to-draft ${id}`),
    },
    ...(inspectFlag ? [inspectFlag] : []),
    {
      label: 'Delete experiment',
      command: command(client, `experiments delete ${id} --confirm ${id}`),
    },
  ];
}

export function buildListNextCommands(client: Client): NextCommand[] {
  return [
    {
      label: 'Inspect experiment',
      command: command(client, 'experiments inspect <experiment>'),
    },
    {
      label: 'Open experiments',
      command: command(client, 'experiments open'),
    },
    {
      label: 'Create experiment',
      command: command(client, 'experiments create --file <file>'),
    },
  ];
}

export function buildDeletedNextCommands(
  client: Client,
  experiment: Experiment
): NextCommand[] {
  const flag = safeResourceToken(experiment.flagSlug);
  return [
    ...(flag
      ? [
          {
            label: 'Inspect flag',
            command: command(client, `flags inspect ${flag}`),
          },
          {
            label: 'Edit flag',
            command: command(client, `flags open ${flag}`),
          },
        ]
      : []),
    {
      label: 'List experiments',
      command: command(client, 'experiments ls'),
    },
  ];
}

export function printNextCommands(next: NextCommand[]): void {
  if (next.length === 0) return;
  const labelWidth = Math.max(
    ALIGNED_LABEL_WIDTH,
    ...next.map(item => item.label.length + 1)
  );
  output.print('\n');
  for (const item of next) {
    printAlignedLabel(item.label, `\`${item.command}\``, {
      labelWidth,
      emphasis: 'subtle',
    });
  }
}

export function printExperimentsTable(experiments: Experiment[]): void {
  const now = Date.now();
  const rows = experiments.map(experiment => [
    chalk.bold(getExperimentIdentifier(experiment)),
    experiment.state,
    experiment.decision?.outcome ?? '—',
    experiment.flagSlug,
    experiment.rampPercentage === undefined
      ? '—'
      : `${experiment.rampPercentage}%`,
    `${ms(now - experiment.updatedAt)} ago`,
  ]);
  output.print(
    `\n${formatTable(
      ['Experiment', 'State', 'Decision', 'Flag', 'Ramp', 'Updated'],
      ['l', 'l', 'l', 'l', 'r', 'l'],
      [{ name: '', rows }]
    )}\n`
  );
}

function formatTimestamp(timestamp: number | undefined): string {
  return timestamp === undefined ? '—' : new Date(timestamp).toISOString();
}

export function printExperimentDetails(experiment: Experiment): void {
  const metricCount = Object.keys(experiment.metrics ?? {}).length;
  const decision = experiment.decision
    ? experiment.decision.outcome === 'winner'
      ? `Winner: ${experiment.decision.winnerVariantId ?? 'unknown'}`
      : 'Abandoned'
    : '—';

  printAlignedLabel('Experiment', experiment.name);
  printAlignedLabel('ID', experiment.id);
  printAlignedLabel('Slug', experiment.slug ?? '—');
  printAlignedLabel('State', experiment.state);
  printAlignedLabel('Feature Flag', experiment.flagSlug);
  printAlignedLabel('Unit', experimentUnitLabel(experiment));
  printAlignedLabel('Target', `${experiment.targetPercentage}%`);
  printAlignedLabel(
    'Ramp',
    experiment.rampPercentage === undefined
      ? '—'
      : `${experiment.rampPercentage}%`
  );
  printAlignedLabel('Control', experiment.controlVariantId);
  printAlignedLabel('Variants', String(experiment.variants.length));
  printAlignedLabel('Metrics', String(metricCount));
  printAlignedLabel('Decision', decision);
  printAlignedLabel('Ramp ID', experiment.rampId ?? '—');
  printAlignedLabel('Created', formatTimestamp(experiment.createdAt));
  printAlignedLabel('Updated', formatTimestamp(experiment.updatedAt));
}

function metricRole(experiment: Experiment, alias: string): string {
  if (experiment.primaryMetric === alias) return 'Primary';
  if (experiment.guardrailMetrics?.includes(alias)) return 'Guardrail';
  if (experiment.secondaryMetrics?.includes(alias)) return 'Secondary';
  return 'Other';
}

function formatPercentage(value: number | null | undefined): string {
  return value == null ? '—' : `${(value * 100).toFixed(2)}%`;
}

function metricValue(
  type: string,
  variant: ExperimentAnalysis['metrics'][string]['variants'][number]
): string {
  switch (type) {
    case 'conversion':
      return formatPercentage(variant.conversionRate);
    case 'funnel':
      return formatPercentage(variant.overallRate);
    case 'retention':
      return formatPercentage(variant.retentionRate);
    case 'mean':
      return variant.mean?.toFixed(3) ?? '—';
    case 'ratio':
      return variant.ratio?.toFixed(3) ?? '—';
    default:
      return '—';
  }
}

export function assessExperimentAnalysis(
  experiment: Experiment,
  analysis: ExperimentAnalysis
): ExperimentAnalysisAssessment {
  const issues: ExperimentAnalysisAssessment['sampleSize']['issues'] = [];
  let hasSampleSizeEstimate = false;

  for (const [alias, metric] of Object.entries(analysis.metrics)) {
    const control = metric.variants.find(variant => variant.isBaseline);
    if (!control) continue;

    for (const variant of metric.variants) {
      if (variant.isBaseline || variant.requiredSampleSize == null) continue;
      hasSampleSizeEstimate = true;

      const smallerArm = Math.min(control.exposedUnits, variant.exposedUnits);
      if (smallerArm >= variant.requiredSampleSize) continue;
      issues.push({
        metric: alias,
        role: metricRole(experiment, alias),
        variantId: variant.variantId,
        controlUnits: control.exposedUnits,
        variantUnits: variant.exposedUnits,
        requiredUnitsPerArm: variant.requiredSampleSize,
        remainingUnitsInSmallerArm: variant.requiredSampleSize - smallerArm,
      });
    }
  }

  const reasons: ExperimentAnalysisAssessment['trust']['reasons'] = [];
  const hasExposureInvariantFailure = analysis.warnings.some(warning =>
    warning.startsWith('Exposure invariant failed')
  );
  const contaminationRatio =
    analysis.contamination.totalUnits > 0
      ? analysis.contamination.contaminatedUnits /
        analysis.contamination.totalUnits
      : 0;
  const includesMaterialContamination =
    contaminationRatio >= CONTAMINATION_WARNING_RATIO &&
    !analysis.excludeContaminated;

  if (!analysis.srm.isValid) reasons.push('sample_ratio_mismatch');
  if (hasExposureInvariantFailure) reasons.push('exposure_invariant_failed');
  if (includesMaterialContamination) reasons.push('contamination_included');
  if (issues.length > 0) reasons.push('insufficient_sample_size');

  let trust: ExperimentAnalysisAssessment['trust'];
  if (!analysis.srm.isValid || hasExposureInvariantFailure) {
    trust = {
      status: 'failed',
      summary:
        !analysis.srm.isValid && hasExposureInvariantFailure
          ? 'Do not trust — data quality checks failed'
          : !analysis.srm.isValid
            ? 'Do not trust — sample ratio mismatch'
            : 'Do not trust — exposure counts disagree',
      reasons,
    };
  } else if (includesMaterialContamination) {
    trust = {
      status: 'caution',
      summary: 'Use caution — contaminated units are included',
      reasons,
    };
  } else if (issues.length > 0) {
    trust = {
      status: 'directional',
      summary: 'Directional only — insufficient sample size',
      reasons,
    };
  } else {
    trust = {
      status: 'passed',
      summary: 'Health checks passed',
      reasons,
    };
  }

  return {
    trust,
    sampleSize: {
      status:
        issues.length > 0
          ? 'insufficient'
          : hasSampleSizeEstimate
            ? 'no_insufficiency_detected'
            : 'unavailable',
      issues,
    },
  };
}

function printAnalysisWarning(message: string): void {
  output.print(`${chalk.yellow('!')} ${message}\n`);
}

export function printExperimentAnalysis(
  experiment: Experiment,
  analysis: ExperimentAnalysis,
  assessment: ExperimentAnalysisAssessment = assessExperimentAnalysis(
    experiment,
    analysis
  )
): void {
  printAlignedLabel('Experiment', experiment.name);
  printAlignedLabel('Ramp ID', analysis.rampId);
  printAlignedLabel(
    'Population',
    `${analysis.contamination.totalUnits} exposed units`
  );
  printAlignedLabel(
    'Contaminated',
    String(analysis.contamination.contaminatedUnits)
  );
  printAlignedLabel(
    'SRM',
    analysis.srm.isValid
      ? `Valid (p=${analysis.srm.pValue.toFixed(4)})`
      : `Mismatch (p=${analysis.srm.pValue.toFixed(4)})`
  );
  printAlignedLabel('Trust', assessment.trust.summary);
  printAlignedLabel(
    'Sample Size',
    assessment.sampleSize.status === 'insufficient'
      ? 'Insufficient'
      : assessment.sampleSize.status === 'no_insufficiency_detected'
        ? 'No insufficiency detected'
        : 'No estimate available'
  );

  if (!analysis.srm.isValid) {
    printAnalysisWarning(
      `Sample ratio mismatch detected (p=${analysis.srm.pValue.toFixed(4)}). Assignment may be biased; do not trust comparisons until the mismatch is explained.`
    );
  }

  const contaminationRatio =
    analysis.contamination.totalUnits > 0
      ? analysis.contamination.contaminatedUnits /
        analysis.contamination.totalUnits
      : 0;
  if (
    contaminationRatio >= CONTAMINATION_WARNING_RATIO &&
    !analysis.excludeContaminated
  ) {
    printAnalysisWarning(
      `${analysis.contamination.contaminatedUnits} of ${analysis.contamination.totalUnits} units (${formatPercentage(contaminationRatio)}) saw multiple variants and are included. Re-run with --exclude-contaminated to compare the sensitivity analysis.`
    );
  }

  for (const issue of assessment.sampleSize.issues) {
    printAnalysisWarning(
      `Insufficient sample size for ${issue.role.toLowerCase()} metric \`${issue.metric}\`, variant \`${issue.variantId}\`: control has ${issue.controlUnits} and the variant has ${issue.variantUnits} exposed units; ~${issue.requiredUnitsPerArm} per arm are estimated for 80% power. Keep running before deciding.`
    );
  }

  const rows = Object.entries(analysis.metrics).flatMap(([alias, metric]) =>
    metric.variants.map(variant => [
      alias,
      metricRole(experiment, alias),
      variant.variantId,
      metricValue(metric.type, variant),
      formatPercentage(variant.lift),
      variant.pValue == null ? '—' : variant.pValue.toFixed(4),
      variant.isSignificant ? 'Yes' : 'No',
    ])
  );

  if (rows.length > 0) {
    output.print(
      formatTable(
        [
          'Metric',
          'Role',
          'Variant',
          'Value',
          'Lift',
          'p-value',
          'Significant',
        ],
        ['l', 'l', 'l', 'r', 'r', 'r', 'l'],
        [{ name: '', rows }]
      )
    );
  }

  for (const warning of analysis.warnings) {
    printAnalysisWarning(warning);
  }
}

/**
 * Column widths shared by the page and the tail.
 *
 * `formatTable` sizes itself to the rows it is given, which a tail never has,
 * so the two would drift apart on screen. Both render through `diagnosedRow`
 * against these widths instead: an ISO timestamp, the longer of
 * `exposure`/`event`, the longest metric event name we expect, the longer of
 * `treatment`/`control`, and the 21-character unit ids the SDK generates. A
 * longer value pushes that row's later cells right without disturbing others.
 */
const DIAGNOSED_COLUMN_WIDTHS = {
  time: 24,
  kind: 8,
  what: 26,
  variant: 9,
  unit: 21,
} as const;

/** Rows between header repeats, so the columns stay readable as a tail grows. */
const DIAGNOSED_HEADER_INTERVAL = 50;

/** The experiment's unit, rendered the one way `inspect` renders it. */
export function experimentUnitLabel(experiment: Experiment): string {
  return `${experiment.base.kind}.${experiment.base.attribute}`;
}

export function printExperimentDiagnosis(
  experiment: Experiment,
  diagnosis: ExperimentDiagnosis,
  { follow = false }: { follow?: boolean } = {}
): void {
  printAlignedLabel('Experiment', getExperimentIdentifier(experiment));
  printAlignedLabel('Unit', experimentUnitLabel(experiment));
  printAlignedLabel(
    'Window',
    `${diagnosis.window.start} → ${diagnosis.window.end}`
  );
  if (diagnosis.projectId !== experiment.projectId) {
    printAlignedLabel('Data Project', diagnosis.projectId);
  }
  printAlignedLabel(
    'Events',
    `${String(diagnosis.events.length)} (${String(diagnosis.exposureCount)} exposures, ${String(diagnosis.metricEventCount)} metric events)`
  );
  printAlignedLabel('Enrolled Units', String(diagnosis.enrolledUnits));
  if (diagnosis.notEnrolledExposures > 0) {
    printAlignedLabel(
      'Not Enrolled',
      `${String(diagnosis.notEnrolledExposures)} exposures`
    );
  }

  if (diagnosis.events.length === 0) {
    output.print(
      `\n${chalk.yellow('!')} No exposures or metric events in this window. Analytics ingestion is asynchronous, so recent activity may not have landed yet.\n`
    );
    return;
  }

  const notes = [
    diagnosis.staleRampExposures > 0
      ? `${chalk.yellow('!')} ${String(diagnosis.staleRampExposures)} of these exposures came from an earlier ramp, so the current analysis excludes them.`
      : undefined,
    // A tail is not a page, so it is never "showing the newest N only".
    diagnosis.truncated && !follow
      ? `${chalk.yellow('!')} Showing the newest ${String(diagnosis.events.length)} events only; older rows exist. Raise --limit to see more.`
      : undefined,
    diagnosis.metricEventNames.length === 0
      ? `${chalk.yellow('!')} This experiment configures no metrics, so only exposures are shown.`
      : undefined,
  ].filter((note): note is string => note !== undefined);

  // A tail appends downwards, so it reads oldest first and the live rows
  // continue the sequence. A static page reads newest first, like the other
  // tables. Either way the header leads.
  const rows = (
    follow ? [...diagnosis.events].reverse() : diagnosis.events
  ).map(diagnosedEventRow);

  output.print('\n');
  if (follow) {
    for (const note of notes) output.print(`${note}\n`);
    if (notes.length > 0) output.print('\n');
  }
  output.print(`${diagnosedHeader()}\n`);
  for (const row of rows) output.print(`${row}\n`);
  if (follow) return;
  output.print('\n');
  for (const note of notes) output.print(`${note}\n`);
}

/**
 * Prints tail rows, reprinting the header every `DIAGNOSED_HEADER_INTERVAL`
 * rows so the columns are never far off-screen. Seeded with the rows the page
 * already printed, so the repeats are spaced against the whole stream rather
 * than restarting at the first live row.
 */
export function createDiagnosedEventPrinter(
  printedSoFar = 0
): (event: DiagnosedEvent) => void {
  let printed = printedSoFar;
  return event => {
    if (printed > 0 && printed % DIAGNOSED_HEADER_INTERVAL === 0) {
      output.print(`${diagnosedHeader()}\n`);
    }
    output.print(`${diagnosedEventRow(event)}\n`);
    printed += 1;
  };
}

function diagnosedEventRow(event: DiagnosedEvent): string {
  return diagnosedRow({
    time: diagnosedEventCells.time(event),
    kind: diagnosedEventCells.kind(event),
    what: diagnosedEventCells.what(event),
    variant: diagnosedEventCells.variant(event),
    unit: diagnosedEventCells.unit(event),
    note: diagnosedEventCells.note(event),
  });
}

function diagnosedHeader(): string {
  return chalk.dim(
    diagnosedRow({
      time: 'Time',
      kind: 'Kind',
      what: 'What',
      variant: 'Variant',
      unit: 'Unit',
      note: 'Note',
    })
  );
}

function diagnosedRow(cells: {
  time: string;
  kind: string;
  what: string;
  variant: string;
  unit: string;
  note: string;
}): string {
  return [
    padCell(cells.time, DIAGNOSED_COLUMN_WIDTHS.time),
    padCell(cells.kind, DIAGNOSED_COLUMN_WIDTHS.kind),
    padCell(cells.what, DIAGNOSED_COLUMN_WIDTHS.what),
    padCell(cells.variant, DIAGNOSED_COLUMN_WIDTHS.variant),
    padCell(cells.unit, DIAGNOSED_COLUMN_WIDTHS.unit),
    cells.note,
  ]
    .join('  ')
    .trimEnd();
}

const diagnosedEventCells = {
  time: (event: DiagnosedEvent) => chalk.gray(event.timestamp),
  kind: (event: DiagnosedEvent) =>
    event.kind === 'exposure'
      ? chalk.cyan(event.kind)
      : chalk.magenta(event.kind),
  what: (event: DiagnosedEvent) => diagnosedEventName(event),
  variant: (event: DiagnosedEvent) =>
    event.variantId ? chalk.bold(event.variantId) : chalk.dim('—'),
  unit: (event: DiagnosedEvent) => event.unit ?? chalk.dim('—'),
  note: (event: DiagnosedEvent) =>
    event.assignmentReason ? chalk.yellow(event.assignmentReason) : '',
};

/** Pads to a visible width, since colouring adds bytes that do not print. */
function padCell(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - strlen(value)));
}

function diagnosedEventName(event: DiagnosedEvent): string {
  // An exposure names the experiment the caller already asked for.
  return event.name ?? (event.kind === 'exposure' ? 'assigned' : '—');
}

/**
 * Cells shared by the table and the live tail, so a row reads the same either
 * way. The tail cannot use `formatTable`, which needs every row up front.
 */
