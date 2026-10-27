// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions are literal workflow contracts, not JS interpolation.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const test = globalThis.test || require('node:test').test;
const workflow = readFileSync(
  join(__dirname, '..', '.github/workflows/release.yml'),
  'utf8'
);

// Keep the existing bounded text approach; no installed YAML parser is required.
function section(source, key, indent) {
  const lines = source.split('\n');
  const header = `${' '.repeat(indent)}${key}:`;
  const indices = lines.flatMap((line, i) => (line === header ? [i] : []));
  assert.equal(indices.length, 1, `Exactly one ${header}`);
  let end = indices[0] + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (
      line.trim() &&
      !line.trimStart().startsWith('#') &&
      line.length - line.trimStart().length <= indent
    )
      break;
    end++;
  }
  return lines.slice(indices[0] + 1, end).join('\n');
}
function field(source, key, indent) {
  const lines = source.split('\n');
  const prefix = `${' '.repeat(indent)}${key}: `;
  const indices = lines.flatMap((line, i) =>
    line.startsWith(prefix) ? [i] : []
  );
  assert.equal(indices.length, 1, `Exactly one ${prefix}`);
  const start = indices[0];
  const value = lines[start].slice(prefix.length);
  if (!['|', '>-'].includes(value)) return value;
  let end = start + 1;
  while (
    end < lines.length &&
    (!lines[end].trim() || lines[end].startsWith(' '.repeat(indent + 2)))
  )
    end++;
  return lines
    .slice(start + 1, end)
    .map(line => line.trim())
    .join(' ')
    .trim();
}
const body = section(workflow, 'jobs', 0);
const jobs = Object.fromEntries(
  [...body.matchAll(/^ {2}([\w-]+):$/gm)].map(([, name]) => [
    name,
    section(body, name, 2),
  ])
);

// Evaluate the live conditions, not a parallel routing implementation. Missing
// Actions outputs resolve to '', and success() is implicit without a status check.
function evaluate(expression, context) {
  const translated = expression.replace(/\bneeds(?:\.[\w-]+)+/g, path =>
    path.replace(/\.([\w-]+)/g, "['$1']")
  );
  return runInNewContext(translated, context);
}
function dependencies(job) {
  if (/^ {4}needs:$/m.test(job)) {
    return [...section(job, 'needs', 4).matchAll(/^ {6}- ([\w-]+)$/gm)].map(
      ([, name]) => name
    );
  }
  if (!/^ {4}needs:/m.test(job)) return [];
  const needs = field(job, 'needs', 4);
  return needs.startsWith('[')
    ? needs
        .slice(1, -1)
        .split(',')
        .map(s => s.trim())
    : [needs];
}
function route(
  outputs = {},
  outcomes = {},
  cancelled = false,
  publishOutputs = { 'cli-integrity': 'sha512-published' },
  event = 'push'
) {
  const selection = {
    release: 'true',
    'cli-version': '53.3.1',
    ...outputs,
  };
  const results = {};
  function resolve(name) {
    if (results[name]) return results[name];
    assert.ok(jobs[name], `Known dependency: ${name}`);
    const job = jobs[name];
    const needs = Object.fromEntries(
      dependencies(job).map(dep => [dep, resolve(dep)])
    );
    // Implicit success() includes transitive ancestors, even when an immediate
    // dependency used always() to run successfully after a skipped ancestor.
    const ancestors = Object.values(needs).flatMap(need => [
      need,
      ...need.ancestors,
    ]);
    const success = () =>
      !cancelled && ancestors.every(need => need.result === 'success');
    const condition = /^ {4}if:/m.test(job) ? field(job, 'if', 4) : 'true';
    const explicitStatus = /\b(?:always|cancelled|success|failure)\(/.test(
      condition
    );
    const eligible =
      (explicitStatus || success()) &&
      evaluate(condition, {
        needs,
        github: { event_name: event, ref: 'refs/heads/main' },
        always: () => true,
        cancelled: () => cancelled,
        success,
        failure: () => ancestors.some(need => need.result === 'failure'),
      });
    const result = eligible ? outcomes[name] || 'success' : 'skipped';
    results[name] = {
      result,
      ancestors,
      // Retain selected outputs even for failed jobs to catch permissive guards.
      outputs: new Proxy(
        name === 'select'
          ? selection
          : name === 'publish'
            ? publishOutputs
            : {},
        {
          get: (target, key) => target[key] ?? '',
        }
      ),
    };
    return results[name];
  }
  for (const name of Object.keys(jobs)) resolve(name);
  return results;
}
const reached = results =>
  Object.keys(jobs).filter(name => results[name].result !== 'skipped');

test('main pushes alone enter the existing queued release lock', () => {
  const triggers = section(workflow, 'on', 0);
  assert.deepEqual(
    [...triggers.matchAll(/^ {2}([\w_]+):$/gm)].map(([, name]) => name),
    ['push', 'workflow_dispatch']
  );
  assert.equal(field(section(triggers, 'push', 2), 'branches', 4), '[main]');
  const concurrency = section(workflow, 'concurrency', 0);
  assert.equal(field(concurrency, 'group', 2), 'Release-refs/heads/main');
  assert.equal(field(concurrency, 'queue', 2), 'max');
  assert.equal(field(concurrency, 'cancel-in-progress', 2), 'false');
  assert.equal(
    section(workflow, 'permissions', 0).trim(),
    'contents: read\n  actions: read'
  );
});

test('selection routes ordinary pushes, CLI releases, and non-CLI releases', () => {
  for (const [outputs, expected] of [
    [{ release: 'false', 'cli-version': '' }, ['select', 'summary']],
    [
      { 'cli-version': '' },
      ['select', 'fetch', 'publish', 'finish', 'summary'],
    ],
    [
      {},
      ['select', 'fetch', 'publish', 'native-acceptance', 'finish', 'summary'],
    ],
  ]) {
    assert.deepEqual(reached(route(outputs)), expected);
  }
  // Builds, assembly and smoke ran in the preparation run; release only copies.
  assert.deepEqual(dependencies(jobs.fetch), ['select']);
  assert.deepEqual(dependencies(jobs.publish), ['select', 'fetch']);
});

test('existing CLI versions skip credentialed acceptance but can finish', () => {
  assert.deepEqual(reached(route({}, {}, false, {})), [
    'select',
    'fetch',
    'publish',
    'finish',
    'summary',
  ]);
});

test('selection or payload copy failures block publication', () => {
  for (const failed of ['select', 'fetch']) {
    for (const result of ['failure', 'cancelled']) {
      const results = route({}, { [failed]: result });
      for (const blocked of ['publish', 'native-acceptance', 'finish']) {
        assert.equal(results[blocked].result, 'skipped', `${failed} ${result}`);
      }
    }
  }
});

test('manual dispatch only promotes; it never builds or publishes', () => {
  assert.deepEqual(
    reached(route({}, {}, false, undefined, 'workflow_dispatch')),
    ['promote', 'summary']
  );
});

test('publication and native acceptance must succeed before tags and notes', () => {
  for (const failed of ['publish', 'native-acceptance']) {
    for (const result of ['failure', 'cancelled', 'skipped']) {
      assert.equal(route({}, { [failed]: result }).finish.result, 'skipped');
    }
  }
  assert.deepEqual(reached(route({}, {}, true)), ['summary']);
});
