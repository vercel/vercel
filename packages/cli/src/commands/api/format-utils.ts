import chalk from 'chalk';

/**
 * Colorize HTTP method for terminal output
 */
export function colorizeMethod(method: string): string {
  switch (method) {
    case 'GET':
      return chalk.cyan(method);
    case 'POST':
      return chalk.green(method);
    case 'PUT':
      return chalk.yellow(method);
    case 'PATCH':
      return chalk.blue(method);
    case 'DELETE':
      return chalk.red(method);
    default:
      return method;
  }
}

/**
 * Colorize HTTP method with padding for aligned display
 */
export function colorizeMethodPadded(method: string, width = 7): string {
  const colored = colorizeMethod(method);
  const padding = ' '.repeat(Math.max(0, width - method.length));
  return colored + padding;
}

/**
 * Format path parameter placeholder (e.g., {projectId}) with highlighting
 */
export function formatPathParam(paramName: string): string {
  return chalk.cyan(`{${paramName}}`);
}

/**
 * Format type hint (e.g., [string]) with dim styling
 */
export function formatTypeHint(type: string): string {
  return chalk.dim(`[${type}]`);
}

/**
 * Format description text with gray styling
 */
export function formatDescription(description?: string): string {
  if (!description) return '';
  return chalk.gray(` (${description})`);
}

/**
 * Format "required" indicator
 */
export function formatRequired(): string {
  return chalk.red('*');
}
