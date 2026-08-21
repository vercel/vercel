/**
 * The verification manifest: the one part of deployment verification the
 * agent authors. Everything else — request execution, status comparison,
 * output format, the ledger record — is this CLI's deterministic code, so a
 * "verified" deployment means the machine measured it, not that a model
 * says so.
 *
 * Deliberately minimal: no chaining, no captures, no scripting. Anything
 * the manifest cannot express is checked by hand and said so — the same
 * escape hatch the config generator has.
 */

export interface VerifyManifest {
  /** Deployment URL; `--deployment` overrides it. */
  deployment?: string;
  checks: VerifyCheck[];
}

export interface VerifyCheck {
  method: string;
  path: string;
  headers?: Record<string, string>;
  /** Request body: already serialized. */
  body?: string;
  /** Whether `body` was a JSON object, so the content type is implied. */
  bodyIsJson: boolean;
  expect: VerifyExpectation;
  /** What this check proves — carried into the output and the ledger. */
  why?: string;
  /**
   * Stateful migration milestones this check is evidence for. A milestone
   * is recorded as verified only when every check claiming it passes — the
   * author declares what the sequence proves, the runner measures it.
   */
  proves?: StatefulMilestone[];
}

/**
 * The milestones a verification check can prove. Provisioning and
 * connection milestones come from typed CLI ledger events, never from a
 * manifest — a manifest can only prove what an HTTP check can measure.
 */
export const MANIFEST_MILESTONES = [
  'schema-created',
  'seed-imported',
  'read-verified',
  'write-verified',
  'cross-request-persistence-verified',
] as const;

export type StatefulMilestone = (typeof MANIFEST_MILESTONES)[number];

export interface VerifyExpectation {
  /** Any of these statuses passes. */
  status: number[];
  bodyContains: string[];
  notBodyContains: string[];
  /** Prefix match against the response content type. */
  contentType?: string;
}

const CHECK_FIELDS = new Set([
  'method',
  'path',
  'headers',
  'body',
  'expect',
  'why',
  'proves',
]);
const EXPECT_FIELDS = new Set([
  'status',
  'bodyContains',
  'notBodyContains',
  'contentType',
]);
const ROOT_FIELDS = new Set(['deployment', 'checks']);

export type ParsedManifest =
  | { ok: true; manifest: VerifyManifest }
  | { ok: false; errors: string[] };

/**
 * Parse and validate a manifest. Every error names the field and the fix,
 * because the reader is an agent that gets exactly one round trip to
 * correct it.
 */
export function parseManifest(raw: string): ParsedManifest {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      errors: [
        `not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  if (!isRecord(data)) {
    return { ok: false, errors: ['the manifest must be a JSON object'] };
  }

  const errors: string[] = [];
  for (const key of Object.keys(data)) {
    if (!ROOT_FIELDS.has(key)) {
      errors.push(
        `unknown field "${key}" — allowed: ${[...ROOT_FIELDS].join(', ')}`
      );
    }
  }

  if (data.deployment !== undefined && typeof data.deployment !== 'string') {
    errors.push('"deployment" must be a string URL');
  }

  if (!Array.isArray(data.checks) || data.checks.length === 0) {
    errors.push('"checks" must be a non-empty array');
    return { ok: false, errors };
  }

  const checks: VerifyCheck[] = [];
  data.checks.forEach((entry, index) => {
    const where = `checks[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    for (const key of Object.keys(entry)) {
      if (!CHECK_FIELDS.has(key)) {
        errors.push(
          `${where}: unknown field "${key}" — allowed: ${[...CHECK_FIELDS].join(', ')}`
        );
      }
    }

    if (typeof entry.path !== 'string' || !entry.path.startsWith('/')) {
      errors.push(`${where}: "path" must be a string starting with "/"`);
      return;
    }

    const method =
      entry.method === undefined ? 'GET' : String(entry.method).toUpperCase();

    let headers: Record<string, string> | undefined;
    if (entry.headers !== undefined) {
      if (
        !isRecord(entry.headers) ||
        Object.values(entry.headers).some(value => typeof value !== 'string')
      ) {
        errors.push(`${where}: "headers" must be an object of strings`);
      } else {
        headers = entry.headers as Record<string, string>;
      }
    }

    let body: string | undefined;
    let bodyIsJson = false;
    if (entry.body !== undefined) {
      if (typeof entry.body === 'string') {
        body = entry.body;
      } else if (isRecord(entry.body) || Array.isArray(entry.body)) {
        body = JSON.stringify(entry.body);
        bodyIsJson = true;
      } else {
        errors.push(`${where}: "body" must be a string or a JSON object`);
      }
    }

    const expectation = parseExpectation(entry.expect, where, errors);

    if (entry.why !== undefined && typeof entry.why !== 'string') {
      errors.push(`${where}: "why" must be a string`);
    }

    const proves = parseProves(entry.proves, where, errors);

    checks.push({
      method,
      path: entry.path,
      ...(headers ? { headers } : {}),
      ...(body !== undefined ? { body } : {}),
      bodyIsJson,
      expect: expectation,
      ...(typeof entry.why === 'string' ? { why: entry.why } : {}),
      ...(proves.length > 0 ? { proves } : {}),
    });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    manifest: {
      ...(typeof data.deployment === 'string'
        ? { deployment: data.deployment }
        : {}),
      checks,
    },
  };
}

function parseExpectation(
  value: unknown,
  where: string,
  errors: string[]
): VerifyExpectation {
  const expectation: VerifyExpectation = {
    status: [200],
    bodyContains: [],
    notBodyContains: [],
  };

  if (value === undefined) {
    return expectation;
  }
  if (!isRecord(value)) {
    errors.push(`${where}: "expect" must be an object`);
    return expectation;
  }

  for (const key of Object.keys(value)) {
    if (!EXPECT_FIELDS.has(key)) {
      errors.push(
        `${where}: unknown field "expect.${key}" — allowed: ${[...EXPECT_FIELDS].join(', ')}`
      );
    }
  }

  if (value.status !== undefined) {
    const statuses = Array.isArray(value.status)
      ? value.status
      : [value.status];
    if (
      statuses.length === 0 ||
      statuses.some(
        status =>
          typeof status !== 'number' ||
          !Number.isInteger(status) ||
          status < 100 ||
          status > 599
      )
    ) {
      errors.push(
        `${where}: "expect.status" must be an HTTP status code or an array of them`
      );
    } else {
      expectation.status = statuses as number[];
    }
  }

  expectation.bodyContains = parseStringList(
    value.bodyContains,
    `${where}: "expect.bodyContains"`,
    errors
  );
  expectation.notBodyContains = parseStringList(
    value.notBodyContains,
    `${where}: "expect.notBodyContains"`,
    errors
  );

  if (value.contentType !== undefined) {
    if (typeof value.contentType !== 'string') {
      errors.push(`${where}: "expect.contentType" must be a string`);
    } else {
      expectation.contentType = value.contentType;
    }
  }

  return expectation;
}

/**
 * `proves` accepts only the known milestone names — an unknown value is an
 * error naming the allowed set, because a silently dropped milestone would
 * make the report lie by omission.
 */
function parseProves(
  value: unknown,
  where: string,
  errors: string[]
): StatefulMilestone[] {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  const proves: StatefulMilestone[] = [];
  for (const entry of list) {
    if (
      typeof entry === 'string' &&
      (MANIFEST_MILESTONES as readonly string[]).includes(entry)
    ) {
      proves.push(entry as StatefulMilestone);
    } else {
      errors.push(
        `${where}: unknown "proves" value ${JSON.stringify(
          entry
        )} — allowed: ${MANIFEST_MILESTONES.join(', ')}`
      );
    }
  }
  return proves;
}

function parseStringList(
  value: unknown,
  where: string,
  errors: string[]
): string[] {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  if (list.some(entry => typeof entry !== 'string')) {
    errors.push(`${where} must be a string or an array of strings`);
    return [];
  }
  return list as string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
