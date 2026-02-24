import { format } from 'util';

const testNameToShortId = new Map<string, string>();
const testsThatLoggedMapping = new Set<string>();

function getCurrentTestName(): string {
  try {
    const state = (globalThis as any).expect?.getState?.();
    const current = state?.currentTestName;
    if (current) return current;
  } catch {
    // not in Jest
  }
  return 'unknown-test';
}

/** Deterministic 4-char id from test name. Grep for [id] to get one test's logs. */
function getShortId(): string {
  const name = getCurrentTestName();
  let id = testNameToShortId.get(name);
  if (id) return id;
  let h = 0;
  for (let i = 0; i < name.length; i++)
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  id = Math.abs(h).toString(36).slice(0, 4);
  testNameToShortId.set(name, id);
  return id;
}

/**
 * Same API as console.log, but each line is prefixed with [shortId] derived from
 * the current test name so parallel test output is grep-able (e.g. grep '[a1x9]').
 */
function testLogger(...args: unknown[]): void {
  const message = format(...args);
  const shortId = getShortId();
  const name = getCurrentTestName();
  const prefix = `[${shortId}] `;
  if (!testsThatLoggedMapping.has(name)) {
    testsThatLoggedMapping.add(name);
    process.stdout.write(prefix + `test: ${name}\n`);
  }
  const lines = message.split('\n');
  for (const line of lines) {
    process.stdout.write(prefix + line + '\n');
  }
}

export default testLogger;
