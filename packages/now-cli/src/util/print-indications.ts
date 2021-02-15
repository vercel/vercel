import chalk from 'chalk';
import { Response } from 'node-fetch';
import { emoji, EmojiLabel, prependEmoji } from './emoji';
import createOutput from './output';
import linkStyle from './output/link';

export default function printIndications(res: Response) {
  const _output = createOutput();
  const indications = new Set(['warning', 'notice', 'tip']);
  const regex = /^x-(?:vercel|now)-(warning|notice|tip)-(.*)$/;

  for (const [name, payload] of res.headers) {
    const match = name.match(regex);
    if (match) {
      const [, type, identifier] = match;
      const action = res.headers.get(`x-vercel-action-${identifier}`);
      const link = res.headers.get(`x-vercel-link-${identifier}`);
      if (indications.has(type)) {
        const newline = '\n';
        const message =
          prependEmoji(chalk.dim(payload), emoji(type as EmojiLabel)) + newline;
        let finalLink = '';
        if (link) {
          finalLink =
            chalk.dim(`${action || 'Learn More'}: ${linkStyle(link)}`) +
            newline;
        }
        _output.print(message + finalLink);
      }
    }
  }
}
