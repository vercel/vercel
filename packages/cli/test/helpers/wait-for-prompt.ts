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

export default async function waitForPrompt(
  cp: CLIProcess,
  rawAssertion: string | RegExp | ((chunk: string) => boolean),
  timeout = 3000
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
