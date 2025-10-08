import ms from 'ms';
import chalk from 'chalk';
import format from 'date-fns/format';

export default function formatDate(dateStrOrNumber?: number | string | null) {
  if (!dateStrOrNumber) {
    return chalk.gray('-');
  }

  const date = new Date(dateStrOrNumber);
  const diff = date.getTime() - Date.now();

  return diff < 0
    ? `${format(date, 'DD MMMM YYYY HH:mm:ss')} ${chalk.gray(
        `[${ms(-diff)} ago]`
      )}`
    : `${format(date, 'DD MMMM YYYY HH:mm:ss')} ${chalk.gray(
        `[in ${ms(diff)}]`
      )}`;
}

export function formatDateWithoutTime(
  dateStrOrNumber?: number | string | null
) {
  if (!dateStrOrNumber) {
    return chalk.gray('-');
  }

  const date = new Date(dateStrOrNumber);
  const diff = date.getTime() - Date.now();

  return diff < 0
    ? `${format(date, 'MMM DD YYYY')} ${chalk.gray(`[${ms(-diff)} ago]`)}`
    : `${format(date, 'MMM DD YYYY')} ${chalk.gray(`[in ${ms(diff)}]`)}`;
}
