import { describe, expect, it } from 'vitest';
import { FOLLOW_UPS } from '../../../../src/commands/ship/follow-ups';
import type { LedgerEvent } from '../../../../src/util/ship-session';

const teardown = FOLLOW_UPS.find(followUp => followUp.id === 'teardown')!;

describe('ship follow-ups', () => {
  it('offers teardown only when the session created something', () => {
    expect(teardown.available([])).toBe(false);
    expect(
      teardown.available([
        { type: 'command', command: 'build', exitCode: 0 },
        { type: 'approval', verdict: 'denied' },
      ])
    ).toBe(false);

    for (const type of [
      'deployment',
      'resource-provisioned',
      'project-created',
      'project-linked',
    ]) {
      expect(teardown.available([{ type }])).toBe(true);
    }
  });

  it('renders the ledger into the teardown prompt', () => {
    const ledger: LedgerEvent[] = [
      {
        type: 'resource-provisioned',
        integration: 'neon',
        resource: 'todo-db',
      },
      { type: 'project-created', project: 'fastapi-app' },
      { type: 'deployment', url: 'https://x.vercel.app', target: 'preview' },
    ];

    const prompt = teardown.prompt(ledger);
    expect(prompt).not.toContain('{{LEDGER}}');
    expect(prompt).toContain('"resource":"todo-db"');
    expect(prompt).toContain('"project":"fastapi-app"');
    expect(prompt).toContain('integration-resource remove');
    // The instruction is to act, not to write a script.
    expect(prompt).toContain('do not write a\nscript');
    // The gate will interject; the prompt must frame that as expected.
    expect(prompt).toContain("pause for the user's approval");
  });

  it('every follow-up has what the menu needs', () => {
    for (const followUp of FOLLOW_UPS) {
      expect(followUp.id).toBeTruthy();
      expect(followUp.label).toBeTruthy();
      expect(typeof followUp.available).toBe('function');
      expect(typeof followUp.prompt).toBe('function');
    }
  });
});
