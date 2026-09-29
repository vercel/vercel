/**
 * Portable assertions: outcome, stdout, stderr, operation log, world after,
 * and the authorization invariants. Returns readable failure strings.
 * Messages never include Authorization headers or request bodies.
 */
import { diffJson, sortKeys } from '../model/json';
import type {
  OperationLogEntry,
  OperationsExpectation,
  Scenario,
} from '../model/schemas';
import type { OperationCall } from './world-api';

export interface ActualRun {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  calls: OperationCall[];
  world: unknown;
  readBackProblems: string[];
}

export function formatEntry(entry: OperationLogEntry): string {
  const parts = Object.entries(entry.params ?? {}).map(
    ([key, value]) => `${key}=${value}`
  );
  if (entry.teamId !== undefined) parts.push(`teamId=${entry.teamId}`);
  return parts.length
    ? `${entry.operation}(${parts.join(', ')})`
    : entry.operation;
}

function entryKey(entry: OperationLogEntry): string {
  return JSON.stringify(sortKeys(entry));
}

export function compareOperations(
  expected: OperationsExpectation,
  actual: OperationLogEntry[],
  identityOperations: ReadonlySet<string>
): string[] {
  const expectedKeys = expected.log.map(entryKey);
  const actualKeys = actual.map(entryKey);
  let matches: boolean;
  if (expected.mode === 'exact') {
    matches = expectedKeys.join('\n') === actualKeys.join('\n');
  } else if (expected.mode === 'unordered') {
    matches =
      [...expectedKeys].sort().join('\n') === [...actualKeys].sort().join('\n');
  } else {
    // Expected entries appear in order; extras must be identity operations.
    let next = 0;
    matches = true;
    for (let i = 0; i < actual.length; i++) {
      if (next < expectedKeys.length && actualKeys[i] === expectedKeys[next]) {
        next++;
      } else if (!identityOperations.has(actual[i].operation)) {
        matches = false;
        break;
      }
    }
    matches = matches && next === expectedKeys.length;
  }
  if (matches) return [];
  return [
    [
      `operations (${expected.mode}) mismatch`,
      `  expected: [${expected.log.map(formatEntry).join(', ')}]`,
      `  actual:   [${actual.map(formatEntry).join(', ')}]`,
    ].join('\n'),
  ];
}

/** The token in effect: `invoke.token`, else the stored credential token. */
export function effectiveToken(scenario: Scenario): string | null {
  if (scenario.invoke.token !== null) return scenario.invoke.token;
  const stored = scenario.world.local.credentials?.token;
  return typeof stored === 'string' ? stored : null;
}

function compareAuthorization(scenario: Scenario, calls: OperationCall[]) {
  const token = effectiveToken(scenario);
  const failures: string[] = [];
  for (const { entry, auth, authorization } of calls) {
    if (auth !== 'bearer') continue;
    if (token === null && authorization !== undefined) {
      failures.push(
        `authorization: ${formatEntry(entry)} sent an Authorization header without a token in effect`
      );
    } else if (token !== null && authorization !== `Bearer ${token}`) {
      failures.push(
        `authorization: ${formatEntry(entry)} ${authorization === undefined ? 'sent no Authorization header' : 'sent a different credential'}`
      );
    }
  }
  return failures;
}

export function compareScenario(
  scenario: Scenario,
  actual: ActualRun,
  identityOperations: ReadonlySet<string>
): string[] {
  const { expect } = scenario;
  const failures: string[] = [];

  if (actual.exitCode !== expect.exitCode) {
    failures.push(
      `exitCode: expected ${expect.exitCode}, actual ${actual.exitCode}`
    );
  }

  if (expect.stdout.kind === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(actual.stdout);
    } catch {
      failures.push(
        `stdout: expected JSON, actual ${JSON.stringify(actual.stdout)}`
      );
    }
    if (parsed !== undefined) {
      failures.push(...diffJson(expect.stdout.value, parsed, 'stdout'));
    }
  } else {
    const expectedStdout =
      expect.stdout.kind === 'exact' ? expect.stdout.value : '';
    if (actual.stdout !== expectedStdout) {
      failures.push(
        `stdout: expected ${JSON.stringify(expectedStdout)}, actual ${JSON.stringify(actual.stdout)}`
      );
    }
  }

  for (const needle of expect.stderrContains) {
    if (!actual.stderr.includes(needle)) {
      failures.push(`stderr: missing ${JSON.stringify(needle)}`);
    }
  }

  failures.push(
    ...compareOperations(
      expect.operations,
      actual.calls.map(call => call.entry),
      identityOperations
    )
  );
  failures.push(...compareAuthorization(scenario, actual.calls));

  const token = effectiveToken(scenario);
  if (token !== null && `${actual.stdout}${actual.stderr}`.includes(token)) {
    failures.push('output: the token appears in stdout or stderr');
  }

  failures.push(
    ...actual.readBackProblems.map(problem => `readBack: ${problem}`)
  );
  failures.push(...diffJson(expect.world, actual.world, 'world'));
  return failures;
}
