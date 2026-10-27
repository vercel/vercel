const chars = {
  triangle: '▲',
  tick: process.platform === 'win32' ? '√' : '✔',
  cross: process.platform === 'win32' ? '☓' : '✘',
  fatal: process.platform === 'win32' ? 'x' : '✗',
  warning: '!',
  dot: process.platform === 'win32' ? 'o' : '●',
} as const;

export default chars;
