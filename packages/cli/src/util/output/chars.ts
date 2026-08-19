const chars = {
  tick: process.platform === 'win32' ? '√' : '✔',
  cross: process.platform === 'win32' ? '☓' : '✘',
  fatal: process.platform === 'win32' ? 'x' : '✗',
} as const;

export default chars;
