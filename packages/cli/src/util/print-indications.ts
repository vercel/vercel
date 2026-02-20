import chalk from 'chalk';
import linkStyle from './output/link';
import { emoji, type EmojiLabel, prependEmoji } from './emoji';
import output from '../output-manager';

export default function printIndications(res: Response) {
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
        output.print(message + finalLink);
      }
    }
  }
}
