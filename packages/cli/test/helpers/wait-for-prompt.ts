import stripAnsi from 'strip-ansi';
import type { CLIProcess } from './types';

function getPromptErrorDetails(
  rawAssertion: string | Function | RegExp,
  accumulatedOutput: string
) {
  const assertion = rawAssertion.toString().trim();
  // Show the last 500 characters of accumulated output to help diagnose issues
  const outputPreview = (accumulatedOutput || '').trim().slice(-500);
  return `Waiting for:\n  "${assertion}"\naccumulated output (last 500 chars):\n  "${outputPreview}"`;
}

export default async function waitForPrompt(
  cp: CLIProcess,
  rawAssertion: string | RegExp | ((chunk: string) => boolean),
  timeout = 3000
) {
  let assertion: (output: string) => boolean;
  if (typeof rawAssertion === 'string') {
    assertion = (output: string) => output.includes(rawAssertion);
  } else if (rawAssertion instanceof RegExp) {
    assertion = (output: string) => rawAssertion.test(output);
  } else {
    assertion = rawAssertion;
  }

  return new Promise<void>((resolve, reject) => {
    // Accumulate all output to handle non-deterministic stdout buffering.
    // This fixes flaky tests where the expected prompt text may be split
    // across multiple chunks or arrive after other output.
    let accumulatedOutput = '';

    // eslint-disable-next-line no-console
    console.log('Waiting for prompt...');
    const handleTimeout = setTimeout(() => {
      cleanup();
      const promptErrorDetails = getPromptErrorDetails(
        rawAssertion,
        accumulatedOutput
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
        accumulatedOutput
      );
      reject(
        new Error(
          `Process exited before prompt was found in waitForPrompt. ${promptErrorDetails}`
        )
      );
    };

    const onData = (rawChunk: Buffer) => {
      const chunk = stripAnsi(rawChunk.toString());

      accumulatedOutput += chunk;
      // eslint-disable-next-line no-console
      console.log('> ' + chunk);
      // Check the accumulated output instead of just the current chunk.
      // This handles cases where the expected text spans multiple chunks
      // or arrives after other output like the CLI version banner.
      if (assertion(accumulatedOutput)) {
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
