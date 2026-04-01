import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from '../../../mocks/client';
import { ProjectNotFound } from '../../../../src/util/errors-ts';

// Mock getProjectByIdOrName so we don't need real API calls
vi.mock('../../../../src/util/projects/get-project-by-id-or-name', () => ({
  default: vi.fn(),
}));

import getProjectByIdOrName from '../../../../src/util/projects/get-project-by-id-or-name';
import inputProject from '../../../../src/util/input/input-project';

const mockGetProject = vi.mocked(getProjectByIdOrName);

const fakeOrg = { id: 'org-1', slug: 'my-org', type: 'team' as const };

describe('inputProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: project not found
    mockGetProject.mockResolvedValue(new ProjectNotFound('my-project'));
    (client as { nonInteractive: boolean }).nonInteractive = false;
  });

  describe('agent mode (nonInteractive)', () => {
    beforeEach(() => {
      (client as { nonInteractive: boolean }).nonInteractive = true;
      client.setArgv('link', '--non-interactive');
    });

    afterEach(() => {
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });

    it('writes action_required JSON to stdout when autoConfirm is false', async () => {
      await expect(
        inputProject(client, fakeOrg, 'my-project', false)
      ).rejects.toThrow('Project name required');

      const output = client.stdout.getFullOutput();
      const json = JSON.parse(output);
      expect(json.status).toBe('action_required');
      expect(json.reason).toBe('missing_arguments');
      expect(json.message).toBe('Project name required. Use --project flag.');
      expect(json.next).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            command: expect.stringContaining('link --project <name>'),
          }),
        ])
      );
    });

    it('throws HEADLESS error with agentResponseWritten flag', async () => {
      try {
        await inputProject(client, fakeOrg, 'my-project', false);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('HEADLESS');
        expect(err.agentResponseWritten).toBe(true);
        expect(err.message).toBe('Project name required. Use --project flag.');
      }
    });

    it('does not throw when autoConfirm is true', async () => {
      const result = await inputProject(client, fakeOrg, 'my-project', true);
      // autoConfirm returns detected project name when no match
      expect(result).toBe('my-project');
      // No JSON written for auto-confirm
      expect(client.stdout.getFullOutput()).toBe('');
    });

    it('returns detected project when autoConfirm is true and project exists', async () => {
      const fakeProject = {
        id: 'proj-1',
        name: 'my-project',
        updatedAt: Date.now(),
      };
      mockGetProject.mockResolvedValue(fakeProject as any);

      const result = await inputProject(client, fakeOrg, 'my-project', true);
      expect(result).toEqual(fakeProject);
      expect(client.stdout.getFullOutput()).toBe('');
    });
  });

  describe('interactive mode', () => {
    it('does not write JSON to stdout', async () => {
      (client as { nonInteractive: boolean }).nonInteractive = false;

      // In interactive mode without autoConfirm, it prompts (we test the
      // non-interactive path; interactive prompts are tested elsewhere)
      // Just verify that the function does NOT write JSON for interactive mode
      // by testing with autoConfirm = true
      const result = await inputProject(client, fakeOrg, 'my-project', true);
      expect(result).toBe('my-project');
      expect(client.stdout.getFullOutput()).toBe('');
    });
  });
});
