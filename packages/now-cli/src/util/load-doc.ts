import fetch from 'node-fetch';
import { Output } from './output';
import chalk from 'chalk';
import AbortController from 'abort-controller';

export function loadDoc(
  output: Output,
  path: string
): { print: (fallback?: string) => void } {
  let md: string | null = null;

  const controller = new AbortController();

  fetch(`https://api-frameworks.zeit.sh/docs${path}`, {
    signal: controller.signal,
  })
    .then(res => {
      if (!res.ok)
        throw new Error(
          `Failed to fetch document. Expected 200 but found ${res.status}.`
        );
      return res.text();
    })
    .then(text => {
      md = text;
    })
    .catch(error => {
      output.debug(`Could not load doc ${path}, skipping`);
      output.debug(error);
    });

  return {
    print: fallback => {
      // abort current request
      controller.abort();

      if (md) {
        // duck tape chalk tagged template litteral
        const template: string[] & { raw?: string[] } = [md];
        template.raw = [md];
        const str = chalk(template as TemplateStringsArray);

        process.stderr.write(`${str}\n`);
      } else if (fallback) {
        process.stderr.write(`${fallback}\n`);
      }
    },
  };
}
