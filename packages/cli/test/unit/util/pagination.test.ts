import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { client } from '../../mocks/client';
import {
  fetchAllPages,
  getNextPageCommand,
  PaginationError,
  parseListLimit,
  printNextPageCommand,
  printNextPageHint,
  type Page,
} from '../../../src/util/pagination';

const argv = (...args: string[]) => ['node', 'vercel', ...args];

describe('parseListLimit', () => {
  it('returns the default when unset', () => {
    expect(parseListLimit(undefined)).toBe(20);
    expect(parseListLimit(undefined, { defaultLimit: 50 })).toBe(50);
  });

  it('accepts integers in range', () => {
    expect(parseListLimit(1)).toBe(1);
    expect(parseListLimit(100)).toBe(100);
  });

  it('rejects out-of-range and non-integer values', () => {
    for (const value of [0, -1, 101, 1.5, Number.NaN]) {
      expect(() => parseListLimit(value)).toThrowError(
        'The --limit option must be an integer from 1 to 100.'
      );
    }
  });

  it('honors a custom maximum', () => {
    expect(() => parseListLimit(51, { maxLimit: 50 })).toThrowError(
      'from 1 to 50'
    );
  });
});

describe('fetchAllPages', () => {
  function pages(...all: Page<number>[]) {
    const calls: (string | undefined)[] = [];
    const fetchPage = async (next: string | undefined) => {
      calls.push(next);
      return all[calls.length - 1];
    };
    return { fetchPage, calls };
  }

  it('returns a single page when there is no cursor', async () => {
    const { fetchPage, calls } = pages({ items: [1, 2], next: null });
    await expect(fetchAllPages(fetchPage)).resolves.toEqual([1, 2]);
    expect(calls).toEqual([undefined]);
  });

  it('follows cursors in order', async () => {
    const { fetchPage, calls } = pages(
      { items: [1], next: 'a' },
      { items: [2], next: 'b' },
      { items: [3], next: null }
    );
    await expect(fetchAllPages(fetchPage)).resolves.toEqual([1, 2, 3]);
    expect(calls).toEqual([undefined, 'a', 'b']);
  });

  it('fails instead of looping on a repeated cursor', async () => {
    const { fetchPage } = pages(
      { items: [1], next: 'a' },
      { items: [2], next: 'a' }
    );
    await expect(fetchAllPages(fetchPage)).rejects.toBeInstanceOf(
      PaginationError
    );
  });

  it('fails when the page cap is reached', async () => {
    let n = 0;
    const fetchPage = async () => ({ items: [n], next: `c${++n}` });
    await expect(fetchAllPages(fetchPage, { maxPages: 3 })).rejects.toThrow(
      'Stopped after 3 pages. The list is incomplete. Use --limit and --next to page through it manually.'
    );
  });

  it('propagates page errors', async () => {
    const fetchPage = async (next: string | undefined) => {
      if (next) throw new Error('boom');
      return { items: [1], next: 'a' };
    };
    await expect(fetchAllPages(fetchPage)).rejects.toThrow('boom');
  });
});

describe('getNextPageCommand', () => {
  it('appends the cursor and keeps filters and global flags', () => {
    expect(
      getNextPageCommand(
        argv('--scope', 'acme', 'ai-gateway', 'api-keys', 'ls', '--all'),
        'abc123'
      )
    ).toBe('vercel --scope acme ai-gateway api-keys ls --all --next=abc123');
  });

  it('replaces an existing cursor in any spelling', () => {
    for (const previous of [['--next', 'old'], ['--next=old'], ['-N', 'old']]) {
      expect(
        getNextPageCommand(argv('api-keys', 'ls', ...previous), 'new')
      ).toBe('vercel api-keys ls --next=new');
    }
  });

  it('drops auth tokens', () => {
    expect(
      getNextPageCommand(
        argv('api-keys', 'ls', '--token', 'secret', '-t=x'),
        'c'
      )
    ).toBe('vercel api-keys ls --next=c');
  });

  it('attaches a cursor that starts with a dash so it is not read as a flag', () => {
    expect(getNextPageCommand(argv('api-keys', 'ls'), '-abc_')).toBe(
      'vercel api-keys ls --next=-abc_'
    );
  });

  it('quotes values the shell would interpret', () => {
    expect(
      getNextPageCommand(argv('ls', '--search', 'two words'), 'a/b=')
    ).toBe("vercel ls --search 'two words' --next=a/b=");
  });

  it('drops a grouped -N and its old cursor, and keeps the other flags', () => {
    expect(getNextPageCommand(argv('vcr', 'ls', '-dN', 'old'), 'new')).toBe(
      'vercel vcr ls -d --next=new'
    );
    expect(
      getNextPageCommand(argv('curl', '/api', '--', '-dN', 'x'), 'new')
    ).toBe('vercel curl /api --next=new -- -dN x');
  });

  it('puts the cursor before -- and keeps everything after it as is', () => {
    expect(
      getNextPageCommand(
        argv('agent-runs', 'list', '--scope', 'acme', '--project', 'web', '--'),
        '2'
      )
    ).toBe('vercel agent-runs list --scope acme --project web --next=2 --');
    expect(
      getNextPageCommand(
        argv('ls', '--next', 'old', '--', 'child', '--next', 'x', '-N', 'y'),
        'new'
      )
    ).toBe('vercel ls --next=new -- child --next x -N y');
  });

  it('drops hidden old names for the cursor along with their values', () => {
    expect(
      getNextPageCommand(
        argv('redirects', 'list', '--page', '2', '--staging', '--search', 'a'),
        '3',
        ['--page']
      )
    ).toBe('vercel redirects list --staging --search a --next=3');
    expect(
      getNextPageCommand(
        argv('vcr', 'ls', '--cursor=old', '-c', 'older', '--limit', '5'),
        'new',
        ['--cursor', '-c']
      )
    ).toBe('vercel vcr ls --limit 5 --next=new');
  });
});

describe('printNextPageCommand', () => {
  it('prints the guidelines layout on stderr, with no prompt or backticks', async () => {
    client.setArgv('dns', 'list');
    printNextPageCommand('vercel dns list --next abc');
    expect(client.stderr.getFullOutput()).toBe(
      '  Next page:\n    vercel dns list --next abc\n'
    );
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('takes another label for a page in the other direction', () => {
    client.setArgv('agent-runs', 'trace');
    printNextPageCommand(
      'vercel agent-runs trace run_1 --previous x',
      'Previous page'
    );
    expect(client.stderr.getFullOutput()).toBe(
      '  Previous page:\n    vercel agent-runs trace run_1 --previous x\n'
    );
  });
});

describe('printNextPageHint', () => {
  it('prints the next-page command to stderr', async () => {
    client.setArgv('ai-gateway', 'api-keys', 'ls');
    printNextPageHint(client, 'cursor1');
    expect(client.stderr.getFullOutput()).toBe(
      '\n  Next page:\n    vercel ai-gateway api-keys ls --next=cursor1\n'
    );
  });

  it('prints nothing on the last page', () => {
    client.setArgv('ai-gateway', 'api-keys', 'ls');
    printNextPageHint(client, null);
    expect(client.stderr.getFullOutput()).toBe('');
  });
});

describe('next-page wording', () => {
  // Every list prints its next page with `printNextPageCommand`. These are the
  // sentences commands used before, so one coming back fails here.
  const OLD_WORDING = [
    'To display the next page',
    'More results available. Re-run with',
    'To see more, run',
    'are available. Run',
    'activity is available. Run',
    'Agent Runs. Run',
    'Next page: ',
  ];

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return path.endsWith('.ts') ? [path] : [];
    });
  }

  it('is the same Next page block in every command', () => {
    const src = join(__dirname, '../../../src');
    const offenders = sourceFiles(src).flatMap(path => {
      const text = readFileSync(path, 'utf8');
      return OLD_WORDING.filter(phrase => text.includes(phrase)).map(
        phrase => `${path.slice(src.length + 1)}: ${phrase}`
      );
    });

    expect(offenders).toEqual([]);
  });
});
