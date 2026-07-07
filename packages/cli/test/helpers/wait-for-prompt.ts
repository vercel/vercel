import stripAnsi from 'strip-ansi';
import type { CLIProcess } from './types';

function getPromptErrorDetails(
  rawAssertion: string | Function | RegExp,
  mostRecentChunk: string
) {
  const assertion = rawAssertion.toString().trim();
  const mostRecent = (mostRecentChunk || '').trim();
  return `Waiting for:\n  "${assertion}"\nmost recent chunk was:\n  "${mostRecent}"`;
}

/**
 * Answers the `Which team?` prompt if it appears and resolves once
 * `nextPrompt` shows. Accounts with a single team auto-select it (the CLI
 * prints an aligned `Team` row instead of prompting), so the team prompt
 * must be treated as optional.
 */
export async function answerTeamPromptThenWait(
  cp: CLIProcess,
  nextPrompt: string | RegExp,
  timeout?: number
) {
  let answeredTeam = false;
  await waitForPrompt(
    cp,
    chunk => {
      if (!answeredTeam && /Which team[^?]*\?/.test(chunk)) {
        answeredTeam = true;
        cp.stdin?.write('\n');
        return false;
      }
      return typeof nextPrompt === 'string'
        ? chunk.includes(nextPrompt)
        : nextPrompt.test(chunk);
    },
    timeout
  );
}

/**
 * Tolerantly walks the link setup to project creation: answers `Which team?`
 * if it appears, then handles either the unified `Which project?` picker
 * (creation is the second choice) or the legacy `Project?` decision
 * (creation is the default).
 */
export async function answerTeamPromptThenCreateProject(cp: CLIProcess) {
  let answeredTeam = false;
  let usesTeamFirstPicker = false;
  await waitForPrompt(cp, chunk => {
    if (!answeredTeam && /Which team[^?]*\?/.test(chunk)) {
      answeredTeam = true;
      cp.stdin?.write('\n');
      return false;
    }
    usesTeamFirstPicker = chunk.includes('Which project?');
    return usesTeamFirstPicker || chunk.includes('Project?');
  });
  if (usesTeamFirstPicker) {
    cp.stdin?.write('\x1b[B');
  }
  cp.stdin?.write('\n');
}

export default async function waitForPrompt(
  cp: CLIProcess,
  rawAssertion: string | RegExp | ((chunk: string) => boolean),
  timeout = 5000
) {
  let assertion: (chunk: string) => boolean;
  if (typeof rawAssertion === 'string') {
    assertion = (chunk: string) => chunk.includes(rawAssertion);
  } else if (rawAssertion instanceof RegExp) {
    assertion = (chunk: string) => rawAssertion.test(chunk);
  } else {
    assertion = rawAssertion;
  }

  return new Promise<void>((resolve, reject) => {
    let mostRecentChunk = 'NO CHUNKS SO FAR';

    console.log('Waiting for prompt...');
    const handleTimeout = setTimeout(() => {
      cleanup();
      const promptErrorDetails = getPromptErrorDetails(
        rawAssertion,
        mostRecentChunk
      );
      reject(
        new Error(
          `Timed out after ${timeout}ms in waitForPrompt. ${promptErrorDetails}`
        )
      );
    }, timeout);

    const onComplete = () => {
      cleanup();
      const promptErrorDetails = getPromptErrorDetails(
        rawAssertion,
        mostRecentChunk
      );
      reject(
        new Error(
          `Process exited before prompt was found in waitForPrompt. ${promptErrorDetails}`
        )
      );
    };

    const onData = (rawChunk: Buffer) => {
      const chunk = stripAnsi(rawChunk.toString());

      mostRecentChunk = chunk;
      console.log('> ' + chunk);
      if (assertion(chunk)) {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      cp.stdout?.off('data', onData);
      cp.stderr?.off('data', onData);
      cp.off('close', onComplete);
      cp.off('exit', onComplete);
      clearTimeout(handleTimeout);
    };

    cp.stdout?.on('data', onData);
    cp.stderr?.on('data', onData);
    cp.on('close', onComplete);
    cp.on('exit', onComplete);
  });
}
