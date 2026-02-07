import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import fs from 'fs-extra';
import os from 'os';

describe('vercel agents init', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(os.tmpdir(), 'vercel-agents-test-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    vi.unstubAllEnvs();
    // Reset session tracking between tests
    const { resetAgentFilesSession } = await import(
      '../../../../src/util/agent-files'
    );
    resetAgentFilesSession();
  });

  describe('generateAgentFiles', () => {
    it('should generate AGENTS.md by default', async () => {
      const { generateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      const result = await generateAgentFiles({
        cwd: tempDir,
        format: 'markdown',
        projectName: 'test-project',
        orgSlug: 'test-org',
      });

      expect(result.status).toBe('generated');
      expect(result.files).toHaveLength(1);
      expect(result.files[0].format).toBe('markdown');

      const agentsPath = join(tempDir, 'AGENTS.md');
      expect(await fs.pathExists(agentsPath)).toBe(true);

      const content = await fs.readFile(agentsPath, 'utf-8');
      expect(content).toContain('Vercel Guide');
      expect(content).toContain('test-project');
    });

    it('should generate .cursorrules when format is cursorrules', async () => {
      const { generateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      const result = await generateAgentFiles({
        cwd: tempDir,
        format: 'cursorrules',
        projectName: 'test-project',
        orgSlug: 'test-org',
      });

      expect(result.status).toBe('generated');
      expect(result.files).toHaveLength(1);
      expect(result.files[0].format).toBe('cursorrules');

      const cursorPath = join(tempDir, '.cursorrules');
      expect(await fs.pathExists(cursorPath)).toBe(true);
    });

    it('should generate all formats when format is all', async () => {
      const { generateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      // Create .github directory for copilot instructions
      await fs.ensureDir(join(tempDir, '.github'));

      const result = await generateAgentFiles({
        cwd: tempDir,
        format: 'all',
        projectName: 'test-project',
        orgSlug: 'test-org',
      });

      expect(result.status).toBe('generated');
      expect(result.files).toHaveLength(3);

      expect(await fs.pathExists(join(tempDir, 'AGENTS.md'))).toBe(true);
      expect(await fs.pathExists(join(tempDir, '.cursorrules'))).toBe(true);
      expect(
        await fs.pathExists(join(tempDir, '.github', 'copilot-instructions.md'))
      ).toBe(true);
    });

    it('should preserve custom content and update Vercel section', async () => {
      const { generateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      // Create existing file with custom content and Vercel markers
      const agentsPath = join(tempDir, 'AGENTS.md');
      await fs.writeFile(
        agentsPath,
        `# My Custom Header

Some custom instructions here.

<!-- VERCEL DEPLOYMENT GUIDE START -->
old vercel content
<!-- VERCEL DEPLOYMENT GUIDE END -->

## My Custom Footer
More custom stuff.
`
      );

      const result = await generateAgentFiles({
        cwd: tempDir,
        format: 'markdown',
        projectName: 'test-project',
      });

      expect(result.status).toBe('generated');

      // Verify custom content was preserved
      const content = await fs.readFile(agentsPath, 'utf-8');
      expect(content).toContain('# My Custom Header');
      expect(content).toContain('Some custom instructions here.');
      expect(content).toContain('## My Custom Footer');
      expect(content).toContain('More custom stuff.');
      // Verify Vercel content was updated
      expect(content).toContain('Vercel Guide');
      expect(content).not.toContain('old vercel content');
    });

    it('should overwrite entire file with force flag', async () => {
      const { generateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      // Create existing file
      const agentsPath = join(tempDir, 'AGENTS.md');
      await fs.writeFile(agentsPath, 'custom content to be removed');

      const result = await generateAgentFiles({
        cwd: tempDir,
        format: 'markdown',
        force: true,
        projectName: 'test-project',
      });

      expect(result.status).toBe('generated');

      // Verify file was overwritten
      const content = await fs.readFile(agentsPath, 'utf-8');
      expect(content).toContain('Vercel Guide');
      expect(content).not.toContain('custom content to be removed');
    });

    it('should respect VERCEL_AGENT_FILES_DISABLED env var', async () => {
      vi.stubEnv('VERCEL_AGENT_FILES_DISABLED', '1');

      const { generateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      const result = await generateAgentFiles({
        cwd: tempDir,
        format: 'markdown',
        projectName: 'test-project',
      });

      expect(result.status).toBe('disabled');
      expect(result.files).toHaveLength(0);
    });

    it('should detect framework from package.json', async () => {
      const { generateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      // Create package.json with Next.js dependency
      await fs.writeJSON(join(tempDir, 'package.json'), {
        dependencies: {
          next: '^14.0.0',
        },
      });

      const result = await generateAgentFiles({
        cwd: tempDir,
        format: 'markdown',
        projectName: 'test-project',
      });

      expect(result.status).toBe('generated');
      expect(result.framework).toBe('nextjs');

      const content = await fs.readFile(join(tempDir, 'AGENTS.md'), 'utf-8');
      expect(content).toContain('## Next.js');
      expect(content).toContain('(nextjs)');
    });

    it('should include vercel.json config in output', async () => {
      const { generateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      // Create vercel.json with crons
      await fs.writeJSON(join(tempDir, 'vercel.json'), {
        crons: [
          {
            path: '/api/cron',
            schedule: '0 0 * * *',
          },
        ],
      });

      const result = await generateAgentFiles({
        cwd: tempDir,
        format: 'markdown',
        projectName: 'test-project',
      });

      expect(result.status).toBe('generated');

      const content = await fs.readFile(join(tempDir, 'AGENTS.md'), 'utf-8');
      expect(content).toContain('/api/cron');
      expect(content).toContain('0 0 * * *');
    });

    it('should generate dry-run output without writing files', async () => {
      const { generateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      const result = await generateAgentFiles({
        cwd: tempDir,
        format: 'markdown',
        dryRun: true,
        projectName: 'test-project',
      });

      expect(result.status).toBe('generated');
      expect(result.files).toHaveLength(1);
      expect(result.files[0].content).toBeDefined();

      // File should not exist
      expect(await fs.pathExists(join(tempDir, 'AGENTS.md'))).toBe(false);
    });

    it('should include Workflow SDK guidance', async () => {
      const { generateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      const result = await generateAgentFiles({
        cwd: tempDir,
        format: 'markdown',
        projectName: 'test-project',
      });

      expect(result.status).toBe('generated');

      const content = await fs.readFile(join(tempDir, 'AGENTS.md'), 'utf-8');
      expect(content).toContain('Workflow SDK');
      expect(content).toContain('@vercel/workflow');
    });

    it('should include AI Gateway guidance', async () => {
      const { generateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      const result = await generateAgentFiles({
        cwd: tempDir,
        format: 'markdown',
        projectName: 'test-project',
      });

      expect(result.status).toBe('generated');

      const content = await fs.readFile(join(tempDir, 'AGENTS.md'), 'utf-8');
      expect(content).toContain('AI Gateway');
      expect(content).toContain('generateText');
    });
  });

  describe('autoGenerateAgentFiles', () => {
    it('should skip generation when not in agent context', async () => {
      const { autoGenerateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      const result = await autoGenerateAgentFiles(tempDir);

      expect(result.status).toBe('skipped');
    });

    it('should generate files when agent is detected', async () => {
      vi.stubEnv('CLAUDE_CODE', '1');

      const { autoGenerateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      const result = await autoGenerateAgentFiles(
        tempDir,
        'test-project',
        'test-org'
      );

      expect(result.status).toBe('generated');
      expect(await fs.pathExists(join(tempDir, 'AGENTS.md'))).toBe(true);
    });
  });

  describe('detectFormatsForAgent', () => {
    it('should return cursorrules for Cursor agent', async () => {
      const { detectFormatsForAgent } = await import(
        '../../../../src/util/agent-files'
      );

      const formats = detectFormatsForAgent('cursor');
      expect(formats).toContain('cursorrules');
      expect(formats).toContain('markdown');
    });

    it('should return markdown for Claude agent', async () => {
      const { detectFormatsForAgent } = await import(
        '../../../../src/util/agent-files'
      );

      const formats = detectFormatsForAgent('claude');
      expect(formats).toEqual(['markdown']);
    });

    it('should return markdown for unknown agents', async () => {
      const { detectFormatsForAgent } = await import(
        '../../../../src/util/agent-files'
      );

      const formats = detectFormatsForAgent('unknown-agent');
      expect(formats).toEqual(['markdown']);
    });
  });

  describe('promptAndGenerateAgentFiles', () => {
    const createMockClient = (
      expandValue: string = 'yes',
      confirmValue: boolean = true
    ) => ({
      client: {
        input: {
          confirm: vi.fn().mockResolvedValue(confirmValue),
          expand: vi.fn().mockResolvedValue(expandValue),
        },
      },
      output: {
        print: vi.fn(),
      },
    });

    it('should skip when not in agent context', async () => {
      const { promptAndGenerateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      const mock = createMockClient();

      const result = await promptAndGenerateAgentFiles({
        cwd: tempDir,
        client: mock.client,
        output: mock.output,
      });

      expect(result).toBeNull();
      expect(mock.client.input.expand).not.toHaveBeenCalled();
    });

    it('should show preview and generate when agent is detected and user confirms', async () => {
      vi.stubEnv('CLAUDE_CODE', '1');

      const { promptAndGenerateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      const mock = createMockClient('yes');

      const result = await promptAndGenerateAgentFiles({
        cwd: tempDir,
        projectName: 'test-project',
        client: mock.client,
        output: mock.output,
      });

      // Should show preview output
      expect(mock.output.print).toHaveBeenCalled();

      // Should use expand prompt
      expect(mock.client.input.expand).toHaveBeenCalledWith({
        message: 'Update AGENTS.md with Vercel instructions?',
        choices: [
          { key: 'y', name: 'Yes', value: 'yes' },
          { key: 'n', name: 'No', value: 'no' },
          { key: 'e', name: 'Expand (view full content)', value: 'expand' },
        ],
      });

      expect(result?.status).toBe('generated');
      expect(await fs.pathExists(join(tempDir, 'AGENTS.md'))).toBe(true);
    });

    it('should show full content when user selects expand, then confirm', async () => {
      vi.stubEnv('CLAUDE_CODE', '1');

      const { promptAndGenerateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      const mock = createMockClient('expand', true);

      const result = await promptAndGenerateAgentFiles({
        cwd: tempDir,
        projectName: 'test-project',
        client: mock.client,
        output: mock.output,
      });

      // Should use expand prompt first
      expect(mock.client.input.expand).toHaveBeenCalled();

      // Should show full content (multiple print calls including full content)
      const printCalls = mock.output.print.mock.calls;
      expect(printCalls.length).toBeGreaterThan(4); // Preview + full content

      // Should re-prompt with confirm after expand
      expect(mock.client.input.confirm).toHaveBeenCalledWith(
        'Apply these changes?',
        true
      );

      expect(result?.status).toBe('generated');
      expect(await fs.pathExists(join(tempDir, 'AGENTS.md'))).toBe(true);
    });

    it('should not generate when user declines', async () => {
      vi.stubEnv('CLAUDE_CODE', '1');

      const { promptAndGenerateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      const mock = createMockClient('no');

      const result = await promptAndGenerateAgentFiles({
        cwd: tempDir,
        client: mock.client,
        output: mock.output,
      });

      expect(mock.client.input.expand).toHaveBeenCalled();
      expect(result).toBeNull();
      expect(await fs.pathExists(join(tempDir, 'AGENTS.md'))).toBe(false);
    });

    it('should not generate when user expands then declines', async () => {
      vi.stubEnv('CLAUDE_CODE', '1');

      const { promptAndGenerateAgentFiles } = await import(
        '../../../../src/util/agent-files'
      );

      const mock = createMockClient('expand', false);

      const result = await promptAndGenerateAgentFiles({
        cwd: tempDir,
        client: mock.client,
        output: mock.output,
      });

      expect(mock.client.input.expand).toHaveBeenCalled();
      expect(mock.client.input.confirm).toHaveBeenCalled();
      expect(result).toBeNull();
      expect(await fs.pathExists(join(tempDir, 'AGENTS.md'))).toBe(false);
    });

    it('should only prompt once per session (prevent duplicates)', async () => {
      vi.stubEnv('CLAUDE_CODE', '1');

      const { promptAndGenerateAgentFiles, resetAgentFilesSession } =
        await import('../../../../src/util/agent-files');

      // Reset to ensure clean state
      resetAgentFilesSession();

      const mock = createMockClient('yes');

      // First call - should prompt and generate
      const result1 = await promptAndGenerateAgentFiles({
        cwd: tempDir,
        projectName: 'test-project',
        client: mock.client,
        output: mock.output,
      });

      expect(mock.client.input.expand).toHaveBeenCalledTimes(1);
      expect(result1?.status).toBe('generated');

      // Second call - should skip without prompting
      const result2 = await promptAndGenerateAgentFiles({
        cwd: tempDir,
        projectName: 'test-project',
        client: mock.client,
        output: mock.output,
      });

      // Should still only have been called once
      expect(mock.client.input.expand).toHaveBeenCalledTimes(1);
      expect(result2).toBeNull();
    });
  });
});
