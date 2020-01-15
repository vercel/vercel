import ms from 'ms';
import chalk from 'chalk';

/**
 * Returns a styled string like "[30ms]" based on a number of ms
 *
 * @param time Number of ms
 * @param ago  Boolean to indicate if we should append `ago`
 */
export default function elapsed(time: number, ago: boolean = false): string {
  return chalk.gray(
    `[${time < 1000 ? `${time}ms` : ms(time)}${ago ? ' ago' : ''}]`
  );
}
