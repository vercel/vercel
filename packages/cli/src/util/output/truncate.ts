import stripAnsi from 'strip-ansi';

interface TruncateOptions {
  omission?: string;
  useVisibleLength?: boolean;
}

export function truncateEnd(
  value: string,
  maxLength: number,
  opts: TruncateOptions = {}
): string {
  const omission = opts.omission ?? '...';
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= omission.length) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - omission.length)}${omission}`;
}

export function truncateMiddle(
  value: string,
  maxLength: number,
  opts: TruncateOptions = {}
): string {
  const omission = opts.omission ?? '...';
  const comparable = opts.useVisibleLength ? stripAnsi(value) : value;
  if (comparable.length <= maxLength) {
    return value;
  }

  if (maxLength <= omission.length) {
    return comparable.slice(0, maxLength);
  }

  const available = maxLength - omission.length;
  const start = Math.ceil(available / 2);
  const end = Math.floor(available / 2);

  return `${comparable.slice(0, start)}${omission}${comparable.slice(
    comparable.length - end
  )}`;
}

export function ellipsizeMiddle(
  value: string,
  maxLength: number,
  useVisibleLength: boolean = false
): string {
  return truncateMiddle(value, maxLength, {
    omission: '…',
    useVisibleLength,
  });
}
