import chalk from 'chalk';
import type { Sandbox } from '@vercel/sandbox';

// name goes to stdout so `sandbox create | xargs ...` keeps working; everything else goes to stderr.
export function printSandboxSummary(opts: {
  sandbox: Sandbox;
  contextName: string;
  action: string;
}) {
  const { sandbox, contextName, action } = opts;
  const routes = sandbox.routes.filter(x => x.port !== sandbox.interactivePort);
  const hasPorts = routes.length > 0;

  process.stderr.write('✅ Sandbox ');
  process.stdout.write(chalk.cyan(sandbox.name));
  process.stderr.write(' ' + action + '.\n');

  if (hasPorts) {
    process.stderr.write(
      chalk.dim('   │ ') + 'team: ' + chalk.cyan(contextName) + '\n'
    );
    process.stderr.write(chalk.dim('   │ ') + 'ports:\n');
    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const isLast = i === routes.length - 1;
      const prefix = isLast ? chalk.dim('   ╰ ') : chalk.dim('   │ ');
      process.stderr.write(
        prefix + '• ' + route.port + ' -> ' + chalk.cyan(route.url) + '\n'
      );
    }
  } else {
    process.stderr.write(
      chalk.dim('   ╰ ') + 'team: ' + chalk.cyan(contextName) + '\n'
    );
  }
}
