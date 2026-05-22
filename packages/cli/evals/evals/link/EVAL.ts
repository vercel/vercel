import { existsSync, readFileSync } from 'fs';
import { test, expect } from 'vitest';

function getShellCommands(): string[] {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  ) as {
    o11y?: { shellCommands?: Array<{ command: string }> };
  };

  return (results.o11y?.shellCommands ?? []).map(c => c.command);
}

function getEvalSetup(): { teamId?: string; projectId?: string } | null {
  if (!existsSync('evals-setup.json')) {
    return null;
  }

  return JSON.parse(readFileSync('evals-setup.json', 'utf-8')) as {
    teamId?: string;
    projectId?: string;
  };
}

test('project is linked after the eval', () => {
  expect(
    existsSync('.vercel/project.json') || existsSync('.vercel/config.json')
  ).toBe(true);
});

test('linked project metadata matches eval setup when available', () => {
  if (!existsSync('.vercel/project.json') || !existsSync('evals-setup.json')) {
    return;
  }

  const projectJson = JSON.parse(
    readFileSync('.vercel/project.json', 'utf-8')
  ) as {
    projectId?: string;
    orgId?: string;
  };

  const evalSetup = getEvalSetup();
  expect(evalSetup).not.toBeNull();

  if (evalSetup?.teamId) {
    expect(projectJson.orgId).toBe(evalSetup.teamId);
  }

  if (evalSetup?.projectId) {
    expect(projectJson.projectId).toBe(evalSetup.projectId);
  }
});

test('agent used vercel link in non-interactive mode', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const linkCommands = commands.filter(command =>
    /\b(vercel|vc)\s+link\b/.test(command)
  );
  expect(linkCommands.length).toBeGreaterThan(0);

  const hasNonInteractive = linkCommands.some(command => {
    return (
      command.includes('--yes') ||
      /\s-y(\s|$)/.test(command) ||
      command.endsWith('-y') ||
      command.includes('--non-interactive')
    );
  });
  expect(hasNonInteractive).toBe(true);
});

test('agent used the correct scope when linking', () => {
  const evalSetup = getEvalSetup();
  if (!evalSetup?.teamId) {
    return;
  }

  const commands = getShellCommands();
  const linkCommands = commands.filter(command =>
    /\b(vercel|vc)\s+link\b/.test(command)
  );
  expect(linkCommands.length).toBeGreaterThan(0);

  const hasExpectedScope = linkCommands.some(command => {
    return (
      command.includes(`--scope ${evalSetup.teamId}`) ||
      command.includes(`--scope=${evalSetup.teamId}`)
    );
  });

  expect(hasExpectedScope).toBe(true);
});
