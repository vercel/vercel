import type { Diagnostic } from 'nostics';
import output from '../../output-manager';

export type ErrorReporter = (err: unknown) => Diagnostic;

export function createErrorReporter(
  recordCode: (code: string | undefined) => void,
  toDiagnostic: (err: unknown) => Diagnostic,
  telemetryCodes: (diagnostic: Diagnostic) => string[] = diagnostic => [
    diagnostic.name,
  ]
): ErrorReporter {
  return err => {
    const diagnostic = toDiagnostic(err);
    for (const code of telemetryCodes(diagnostic)) {
      recordCode(code);
    }
    output.prettyError(diagnostic);
    return diagnostic;
  };
}
