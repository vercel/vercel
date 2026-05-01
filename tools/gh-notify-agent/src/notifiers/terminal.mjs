const COLOR = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const ICON = {
  ci_failure: '✖',
  mention: '@',
  pr_comment: '💬',
  review_request: '👀',
  debug: '·',
};

const TYPE_COLOR = {
  ci_failure: COLOR.red,
  mention: COLOR.magenta,
  pr_comment: COLOR.cyan,
  review_request: COLOR.yellow,
  debug: COLOR.dim,
};

export function createTerminalNotifier({ stream = process.stdout, color } = {}) {
  const useColor = color ?? stream.isTTY ?? false;
  const paint = (c, s) => (useColor ? `${c}${s}${COLOR.reset}` : s);

  return {
    async notify(alert) {
      const tint = TYPE_COLOR[alert.type] || '';
      const icon = ICON[alert.type] || '•';
      const header = `${paint(tint + COLOR.bold, `${icon} ${alert.type.toUpperCase()}`)} ${paint(
        COLOR.dim,
        new Date(alert.createdAt || Date.now()).toLocaleString()
      )}`;
      stream.write(header + '\n');
      stream.write(paint(COLOR.bold, alert.title) + '\n');
      if (alert.body) {
        for (const line of String(alert.body).split('\n')) {
          stream.write(paint(COLOR.dim, '  ' + line) + '\n');
        }
      }
      if (alert.url) stream.write('  ' + paint(COLOR.cyan, alert.url) + '\n');
      stream.write('\n');
    },
  };
}
