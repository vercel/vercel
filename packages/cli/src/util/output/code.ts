// Packages
import pc from 'picocolors';

// The equivalent of <code>, for embedding anything
// you may want to take a look at ./cmd.js

export default function code(cmd: string, { backticks = true } = {}): string {
  const tick = backticks ? pc.gray('`') : '';
  return `${tick}${pc.bold(cmd)}${tick}`;
}
