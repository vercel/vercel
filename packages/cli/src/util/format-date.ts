import ms from './inline/ms';
import pc from 'picocolors';
import format from 'date-fns/format';

export default function formatDate(dateStrOrNumber?: number | string | null) {
  if (!dateStrOrNumber) {
    return pc.gray('-');
  }

  const date = new Date(dateStrOrNumber);
  const diff = date.getTime() - Date.now();

  return diff < 0
    ? `${format(date, 'DD MMMM YYYY HH:mm:ss')} ${pc.gray(
        `[${ms(-diff)} ago]`
      )}`
    : `${format(date, 'DD MMMM YYYY HH:mm:ss')} ${pc.gray(`[in ${ms(diff)}]`)}`;
}

export function formatDateWithoutTime(
  dateStrOrNumber?: number | string | null
) {
  if (!dateStrOrNumber) {
    return pc.gray('-');
  }

  const date = new Date(dateStrOrNumber);
  const diff = date.getTime() - Date.now();

  return diff < 0
    ? `${format(date, 'MMM DD YYYY')} ${pc.gray(`[${ms(-diff)} ago]`)}`
    : `${format(date, 'MMM DD YYYY')} ${pc.gray(`[in ${ms(diff)}]`)}`;
}
