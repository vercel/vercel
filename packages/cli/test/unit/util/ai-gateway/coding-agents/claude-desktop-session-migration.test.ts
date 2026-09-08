import { beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  planClaudeDesktopSessionMigration,
  toGatewayModelId,
} from '../../../../../src/util/ai-gateway/coding-agents/migrations/claude-desktop-sessions';

const SUBSCRIPTION_IDENTITY = [
  'b901475a-0957-4b05-aebb-7aea4a2f495e',
  'c952b4b3-4aa2-4fc3-abac-16fcd50f8204',
];
const GATEWAY_IDENTITY = [
  '862d6ac7-5221-4d92-8829-8600ea649530',
  '00000000-0000-4000-8000-000000000001',
];

let home: string;
let root: string;
let subscriptionDir: string;
let gatewayDir: string;

function record(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: 'local_00000000-0000-4000-8000-00000000000a',
    cwd: '/tmp/project',
    createdAt: 1751000000000,
    model: 'claude-opus-4-8',
    title: 'Test session',
    ...overrides,
  };
}

async function writeSourceRecord(
  name: string,
  contents: Record<string, unknown> | string
) {
  await fs.mkdir(subscriptionDir, { recursive: true });
  await fs.writeFile(
    join(subscriptionDir, name),
    typeof contents === 'string' ? contents : JSON.stringify(contents)
  );
}

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'vc-claude-desktop-'));
  root = join(home, 'app-support');
  subscriptionDir = join(
    root,
    'Claude',
    'claude-code-sessions',
    ...SUBSCRIPTION_IDENTITY
  );
  gatewayDir = join(
    root,
    'Claude-3p',
    'claude-code-sessions',
    ...GATEWAY_IDENTITY
  );
});

describe('toGatewayModelId', () => {
  it('prefixes bare slugs and preserves suffixes', () => {
    expect(toGatewayModelId('claude-opus-4-8')).toBe(
      'anthropic/claude-opus-4-8'
    );
    expect(toGatewayModelId('claude-fable-5[1m]')).toBe(
      'anthropic/claude-fable-5[1m]'
    );
    expect(toGatewayModelId('anthropic/claude-opus-4-8')).toBe(
      'anthropic/claude-opus-4-8'
    );
  });
});

describe('planClaudeDesktopSessionMigration', () => {
  it('returns null before the third-party identity exists', async () => {
    await writeSourceRecord('local_a.json', record());
    expect(await planClaudeDesktopSessionMigration(home, root)).toBeNull();
  });

  it('copies records into the 3p store with gateway model ids, originals untouched', async () => {
    const source = record();
    await writeSourceRecord('local_a.json', source);
    await writeSourceRecord(
      'local_b.json',
      record({ model: 'claude-fable-5[1m]' })
    );
    await fs.mkdir(gatewayDir, { recursive: true });

    const plan = await planClaudeDesktopSessionMigration(home, root);
    expect(plan).not.toBeNull();
    expect(plan?.label).toBe('Claude Desktop sessions');
    expect(plan?.itemCount).toBe(2);
    expect(plan?.destinationRoots).toEqual([gatewayDir]);
    expect(plan?.prompt.join('\n')).toContain('anthropic/');

    const result = await plan?.apply();
    expect(result).toMatchObject({ copied: 2, skipped: 0 });

    const copyA = JSON.parse(
      await fs.readFile(join(gatewayDir, 'local_a.json'), 'utf8')
    );
    expect(copyA.model).toBe('anthropic/claude-opus-4-8');
    expect(copyA.sessionId).toBe(source.sessionId);
    expect(copyA.title).toBe(source.title);
    const copyB = JSON.parse(
      await fs.readFile(join(gatewayDir, 'local_b.json'), 'utf8')
    );
    expect(copyB.model).toBe('anthropic/claude-fable-5[1m]');

    // Originals byte-for-byte untouched.
    expect(
      JSON.parse(
        await fs.readFile(join(subscriptionDir, 'local_a.json'), 'utf8')
      ).model
    ).toBe('claude-opus-4-8');

    // Idempotent: nothing left to copy on rerun.
    expect(await planClaudeDesktopSessionMigration(home, root)).toBeNull();
  });

  it('never overwrites records already in the 3p store', async () => {
    await writeSourceRecord('local_a.json', record());
    await fs.mkdir(gatewayDir, { recursive: true });
    await fs.writeFile(
      join(gatewayDir, 'local_a.json'),
      JSON.stringify(record({ title: 'created after the switch' }))
    );

    expect(await planClaudeDesktopSessionMigration(home, root)).toBeNull();
    const kept = JSON.parse(
      await fs.readFile(join(gatewayDir, 'local_a.json'), 'utf8')
    );
    expect(kept.title).toBe('created after the switch');
  });

  it('skips malformed and non-record files', async () => {
    await writeSourceRecord('local_bad.json', 'not json{');
    await writeSourceRecord('local_array.json', '[1,2,3]');
    await writeSourceRecord('notes.txt', 'ignore me');
    await fs.mkdir(gatewayDir, { recursive: true });
    expect(await planClaudeDesktopSessionMigration(home, root)).toBeNull();
  });
});
