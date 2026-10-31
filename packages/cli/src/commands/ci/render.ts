import chalk from 'chalk';
import ms from 'ms';
import formatTable from '../../util/format-table';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { toShortSha } from '../../util/ci/run-status';
import { ciDisplayText } from '../../util/ci/output';
import type { CiRunView, CiStepStatus } from '../../util/ci/run-view';
import output from '../../output-manager';

export function formatStatus(status: CiStepStatus | 'completed'): string {
  switch (status) {
    case 'succeeded':
      return chalk.green(status);
    case 'failed':
      return chalk.red(status);
    case 'skipped':
    case 'cached':
      return chalk.gray(status);
    default:
      return ciDisplayText(status);
  }
}

/** Formats rows as a borderless table without trailing whitespace. */
export function formatCiTable(headers: string[], rows: string[][]): string {
  return formatTable(
    headers,
    headers.map(() => 'l'),
    [{ rows }]
  )
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length > 0)
    .join('\n');
}

export function printRunView(view: CiRunView, elapsed: string): void {
  const { run } = view;
  output.log(
    `Vercel CI run ${chalk.bold(ciDisplayText(run.id))} ${chalk.gray(elapsed)}`
  );
  output.print('\n');
  printAlignedLabel('Status', formatStatus(run.status));
  if (run.reason) {
    printAlignedLabel('Reason', ciDisplayText(run.reason));
  }
  if (run.repository) {
    printAlignedLabel('Repository', ciDisplayText(run.repository));
  }
  printAlignedLabel('Branch', ciDisplayText(run.branch));
  printAlignedLabel('Commit', ciDisplayText(toShortSha(run.commitSha)));
  printAlignedLabel('Attempt', String(run.attempt));
  printAlignedLabel(
    'Created',
    `${ms(Math.max(Date.now() - Date.parse(run.createdAt), 0))} ago`
  );

  if (view.jobs.length === 0 && run.reason === 'setup_failed') {
    output.print('\n  Setup failed before any jobs were created.\n');
  }

  for (const job of view.jobs) {
    const duration =
      job.durationMs !== undefined
        ? chalk.gray(` · ${ms(job.durationMs)}`)
        : '';
    output.print(
      `\n  ${chalk.bold(ciDisplayText(job.name))} ${chalk.gray('·')} ${formatStatus(job.status)}${duration}\n`
    );
    if (job.tasks.length === 0) {
      continue;
    }
    const rows = job.tasks.map(task => [
      ciDisplayText(task.name),
      formatStatus(task.status),
      task.durationMs !== undefined ? chalk.gray(ms(task.durationMs)) : '',
      task.reason ? chalk.gray(ciDisplayText(task.reason)) : '',
    ]);
    output.print(
      `${formatCiTable(['Task', 'Status', 'Duration', 'Reason'], rows)}\n`
    );
  }
  output.print('\n');
}
