import stripAnsi from 'strip-ansi';
import { describe, expect, it } from 'vitest';
import {
  formatVercelCliTable,
  getByPath,
} from '../../../../src/util/openapi/vercel-cli-table';
import { VERCEL_CLI_ROOT_DISPLAY_KEY } from '../../../../src/util/openapi/constants';
import type { VercelCliTableDisplay } from '../../../../src/util/openapi/types';

describe('getByPath', () => {
  it('reads nested keys', () => {
    const row = {
      softBlock: { blockedAt: 123, reason: 'X' },
    };
    expect(getByPath(row, 'softBlock.blockedAt')).toBe(123);
  });
});

describe('formatVercelCliTable', () => {
  const display: VercelCliTableDisplay = {
    displayProperty: 'user',
    columnsDefault: ['id', 'email', 'softBlock.blockedAt'],
  };

  it('formats a singular object as a key/value card', () => {
    const body = {
      user: {
        id: 'u_1',
        email: 'a@b.com',
        softBlock: { blockedAt: 99 },
      },
    };
    const out = formatVercelCliTable(body, display);
    expect(out).toBeTruthy();
    const plain = stripAnsi(out!);
    expect(plain).toContain('u_1');
    expect(plain).toContain('a@b.com');
    expect(plain).toContain('99');
    expect(plain).toContain('Id');
    expect(plain).toContain('Email');
    expect(plain).toContain('Blocked At');
  });

  it('formats an array as a multi-row table', () => {
    const body = {
      items: [
        { id: 'a', email: 'one@test.com' },
        { id: 'b', email: 'two@test.com' },
      ],
    };
    const out = formatVercelCliTable(body, {
      displayProperty: 'items',
      columnsDefault: ['id', 'email'],
    });
    expect(out).toBeTruthy();
    const plain = stripAnsi(out!);
    expect(plain).toContain('Id');
    expect(plain).toContain('Email');
    expect(plain).toContain('one@test.com');
    expect(plain).toContain('two@test.com');
  });

  it('shows (empty) for an empty array', () => {
    expect(
      formatVercelCliTable(
        { items: [] },
        { displayProperty: 'items', columnsDefault: ['id'] }
      )
    ).toBe('(empty)');
  });

  it('uses columnsWhenLimited when limited is true', () => {
    const limitedDisplay: VercelCliTableDisplay = {
      displayProperty: 'user',
      columnsDefault: ['id', 'email'],
      columnsWhenLimited: ['limited', 'id', 'email'],
    };
    const body = {
      user: {
        limited: true,
        id: 'u_1',
        email: 'a@b.com',
      },
    };
    const out = formatVercelCliTable(body, limitedDisplay);
    expect(stripAnsi(out!)).toContain('true');
  });

  it('returns null when display property is missing', () => {
    expect(formatVercelCliTable({}, display)).toBeNull();
  });

  it('formats the whole body as a card when displayProperty is __root__', () => {
    const body = {
      id: 'team_1',
      slug: 'acme',
      name: 'Acme',
    };
    const out = formatVercelCliTable(body, {
      displayProperty: VERCEL_CLI_ROOT_DISPLAY_KEY,
      columnsDefault: ['id', 'slug', 'name'],
    });
    expect(out).toBeTruthy();
    const plain = stripAnsi(out!);
    expect(plain).toContain('team_1');
    expect(plain).toContain('acme');
    expect(plain).toContain('Acme');
  });

  it('renders null/undefined values as "--"', () => {
    const body = {
      items: [{ id: 'a', email: null }, { id: 'b' }],
    };
    const out = formatVercelCliTable(body, {
      displayProperty: 'items',
      columnsDefault: ['id', 'email'],
    });
    expect(out).toBeTruthy();
    const plain = stripAnsi(out!);
    const dashes = plain.match(/--/g);
    expect(dashes?.length).toBeGreaterThanOrEqual(2);
  });

  it('formats timestamp fields as relative time', () => {
    const now = Date.now();
    const twoHoursAgo = now - 2 * 60 * 60 * 1000;
    const body = {
      items: [{ id: 'p1', name: 'my-project', updatedAt: twoHoursAgo }],
    };
    const out = formatVercelCliTable(body, {
      displayProperty: 'items',
      columnsDefault: ['id', 'name', 'updatedAt'],
    });
    expect(out).toBeTruthy();
    const plain = stripAnsi(out!);
    expect(plain).toContain('2h');
    expect(plain).not.toContain(String(twoHoursAgo));
  });

  it('does not format non-timestamp number fields as time', () => {
    const body = {
      items: [{ id: 'p1', port: 3000 }],
    };
    const out = formatVercelCliTable(body, {
      displayProperty: 'items',
      columnsDefault: ['id', 'port'],
    });
    expect(out).toBeTruthy();
    const plain = stripAnsi(out!);
    expect(plain).toContain('3000');
  });

  it('shows "Updated" header for updatedAt column', () => {
    const body = {
      items: [{ id: 'p1', updatedAt: Date.now() - 60000 }],
    };
    const out = formatVercelCliTable(body, {
      displayProperty: 'items',
      columnsDefault: ['id', 'updatedAt'],
    });
    expect(out).toBeTruthy();
    const plain = stripAnsi(out!);
    expect(plain).toContain('Updated');
    expect(plain).not.toContain('Updated At');
  });
});
