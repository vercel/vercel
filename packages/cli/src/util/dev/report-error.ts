import type { Diagnostic } from 'nostics';
import output from '../../output-manager';
import { toDiagnostic, telemetryCodes } from './diagnostics';

export type DevErrorReporter = (err: unknown) => Diagnostic;

/**
 * Wrap an arbitrary error into a nostics one, record it into telemetry and then pretty-print it
 */
export function createErrorReporter(
  recordCode: (code: string | undefined) => void
): DevErrorReporter {
  return (err: unknown) => {
    const diagnostic = toDiagnostic(err);
    for (const code of telemetryCodes(diagnostic)) {
      recordCode(code);
    }
    output.prettyError(diagnostic);
    return diagnostic;
  };
}
