import bytes from 'bytes';

export const prettyBytes = (n: number) => bytes(n, { unitSeparator: ' ' });
