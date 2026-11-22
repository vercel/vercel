import { Diagnostic } from 'nostics';

export const FIX_BY_CODE = {
  missing_build_script:
    'Add a `build` script to your `package.json`, or set a Build Command in your Project Settings.',
  MISSING_DOTENV_VARS:
    'Define the missing variables in your `.env` file, or pull them with `vercel env pull`.',
  MAX_LAMBDA_SIZE_EXCEEDED:
    'Reduce the function bundle — trim dependencies or included files, or split the function.',
  NODE_DEPENDENCY_SYNC_FAILED:
    'Install your dependencies (e.g. `npm install`) and confirm they resolve, then retry.',
  INSTALL_COMMAND_FAILED: 'Fix the dependency error logged above, then retry.',
  CONFLICTING_CONFIG_FILES:
    'Keep a single configuration file — remove the extra `vercel.json`/`now.json`.',
  CANT_PARSE_JSON_FILE:
    'Fix the JSON syntax error at the location shown above, then retry.',
} satisfies Record<string, string>;

interface DiagnosticOptions {
  syscall?: (message: string, cause: unknown) => Diagnostic;
  fixes?: Readonly<Record<string, string>>;
  fallback?: (message: string, cause: unknown) => Diagnostic;
}

/** Convert at the presentation boundary without mutating the serialized error. */
export function toDiagnostic(
  err: unknown,
  { syscall, fixes = {}, fallback }: DiagnosticOptions
): Diagnostic {
  if (err instanceof Diagnostic) return err;

  const source = err as Record<string, unknown> | null | undefined;
  const message =
    typeof source?.message === 'string' ? source.message : String(err);

  const isSyscall =
    typeof source?.errno === 'number' || typeof source?.syscall === 'string';

  const code = typeof source?.code === 'string' ? source.code : undefined;
  const docs = typeof source?.link === 'string' ? source.link : undefined;
  const action = typeof source?.action === 'string' ? source.action : undefined;
  const fix = code
    ? Object.hasOwn(fixes, code)
      ? fixes[code]
      : Object.hasOwn(FIX_BY_CODE, code)
        ? FIX_BY_CODE[code as keyof typeof FIX_BY_CODE]
        : undefined
    : undefined;
  const diagnostic =
    isSyscall && syscall
      ? syscall(message, err)
      : !code && fallback
        ? fallback(message, err)
        : new Diagnostic({ why: message, fix, docs, cause: err });
  if (code && !(isSyscall && syscall)) diagnostic.name = code;
  if (docs) diagnostic.docs = docs;
  if (action) {
    (diagnostic as Diagnostic & { action?: string }).action = action;
  }
  return diagnostic;
}
