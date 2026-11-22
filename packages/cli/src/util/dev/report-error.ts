import type { Diagnostic } from 'nostics';
import { createErrorReporter as createReporter } from '../diagnostics/report-error';
import { toDiagnostic, telemetryCodes } from './diagnostics';

export type DevErrorReporter = (err: unknown) => Diagnostic;

/**
 * Wrap an arbitrary error into a nostics one, record it into telemetry and then pretty-print it
 */
export function createErrorReporter(
  recordCode: (code: string | undefined) => void
): DevErrorReporter {
  return createReporter(recordCode, toDiagnostic, telemetryCodes);
}
