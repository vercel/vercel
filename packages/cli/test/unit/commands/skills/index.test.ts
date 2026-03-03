import { describe, beforeEach, expect, it, vi, afterEach } from 'vitest';
import { client } from '../../../mocks/client';

// Mock fs/promises so readFile/access don't hit disk
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  access: vi.fn().mockRejectedValue(new Error('ENOENT')),
}));

// Mock framework detection to return nothing by default
vi.mock('@vercel/fs-detectors', () => ({
  detectFrameworks: vi.fn().mockResolvedValue([]),
  LocalFileSystemDetector: vi.fn(),
}));

import skills from '../../../../src/commands/skills';

const mockSkillsResponse = {
  skills: [
    {
      skillId: 'next-auth-skill',
      name: 'NextAuth.js Skill',
      installs: 500,
      source: 'github.com/example/next-auth-skill',
    },
    {
      skillId: 'prisma-skill',
      name: 'Prisma Skill',
      installs: 300,
      source: 'github.com/example/prisma-skill',
    },
  ],
};

describe('skills', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client.reset();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockSkillsResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('--help returns exit code 2', async () => {
    client.setArgv('skills', '--help');

    const exitCode = await skills(client);

    expect(exitCode).toBe(2);
  });

  it('direct search with a query displays results', async () => {
    client.setArgv('skills', 'nextjs');

    const exitCodePromise = skills(client);

    await expect(client.stderr).toOutput('next-auth-skill');
    expect(await exitCodePromise).toBe(0);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('skills.sh/api/search?q=nextjs'),
      expect.anything()
    );
  });

  it('auto-detect with no framework or deps shows "Could not detect" message', async () => {
    client.setArgv('skills');

    const exitCodePromise = skills(client);

    await expect(client.stderr).toOutput(
      'Could not detect a framework or notable dependencies'
    );
    expect(await exitCodePromise).toBe(0);
  });

  it('--format json outputs valid JSON to stdout', async () => {
    client.setArgv('skills', 'nextjs', '--format', 'json');

    const exitCode = await skills(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('skills');
    expect(parsed.skills).toBeInstanceOf(Array);
    expect(parsed.skills[0]).toHaveProperty('skillId', 'next-auth-skill');
    expect(parsed.skills[0]).toHaveProperty('installed');
  });
});
