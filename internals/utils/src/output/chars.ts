const chars = {
  tick: process.platform === 'win32' ? '√' : '✔',
  cross: process.platform === 'win32' ? '☓' : '✘',
} as const;

export default chars;
