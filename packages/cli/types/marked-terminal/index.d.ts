declare module 'marked-terminal' {
  import type { MarkedExtension } from 'marked';
  export function markedTerminal(
    options?: Record<string, unknown>
  ): MarkedExtension;
}
