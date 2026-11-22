import chalk from 'chalk';
import output from '../../output-manager';

export const FID_METRIC_ID = 'vercel.speed_insights.fid_ms';

export const FID_DEPRECATION_WARNING =
  'First Input Delay will be sunset on November 1st. Use Interaction to Next Paint instead (vercel.speed_insights.inp_ms). Learn more: https://web.dev/articles/fid';

export function warnIfFidMetric(metric: string | undefined): void {
  if (metric === FID_METRIC_ID) {
    output.print(`${chalk.yellow('!')} ${FID_DEPRECATION_WARNING}\n`);
  }
}
