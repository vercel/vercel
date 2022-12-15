import ansiRegex from 'ansi-regex';
import { Readable } from 'stream';

const RE = ansiRegex();

export async function* createAnsiIterator(stream: Readable) {
  let chunk: string;
  //stream.setEncoding('utf8');
  for await (chunk of stream) {
    let lastIndex = 0;
    RE.lastIndex = 0;
    let m: RegExpExecArray | null = null;
    // eslint-disable-next-line no-cond-assign
    while ((m = RE.exec(chunk))) {
      if (m.index > lastIndex) {
        // There was some text data before this escape code
        const raw = chunk.substring(lastIndex, m.index);
        yield* parseText(raw);
      }
      const escapeRaw = m[0];
      lastIndex = m.index + escapeRaw.length;
      yield {
        type: 'escape',
        raw: escapeRaw,
      };
    }

    if (lastIndex < chunk.length) {
      // There was some text data after all the matches escape codes
      const raw = chunk.substring(lastIndex);
      yield* parseText(raw);
    }
  }
}

/**
 * Yields parsed text nodes, but also potential special characters
 * like `\r` which have special semantic meaning during rendering.
 */
export function* parseText(text: string) {
  let index = 0;
  while (index < text.length) {
    const specialCharIndex = text.indexOf('\r', index);
    if (specialCharIndex === -1) {
      // No more special chars, yield rest of text
      yield {
        type: 'text',
        raw: text.substring(index),
      };
      break;
    } else if (specialCharIndex > index) {
      // Regular text before special char, yield regular text, then special char
      yield {
        type: 'text',
        raw: text.substring(index, specialCharIndex),
      };
      yield {
        type: 'escape',
        raw: text[specialCharIndex],
      };
      index = specialCharIndex + 1;
    } else {
      yield {
        type: 'escape',
        raw: text[specialCharIndex],
      };
      index = specialCharIndex + 1;
    }
  }
}
