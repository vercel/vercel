import { beforeEach, describe, it, expect } from 'vitest';
import { createInput } from '../../../../src/util/client';

import { Stream } from 'node:stream';
import MuteStream from 'mute-stream';
import stripAnsi from 'strip-ansi';
import ansiEscapes from 'ansi-escapes';
import type { Prompt } from '@inquirer/type';

const ignoredAnsi = new Set([ansiEscapes.cursorHide, ansiEscapes.cursorShow]);

class BufferedStream extends Stream.Writable {
  #_fullOutput: string = '';
  #_chunks: Array<string> = [];
  #_rawChunks: Array<string> = [];

  override _write(chunk: Buffer, _encoding: string, callback: () => void) {
    const str = chunk.toString();

    this.#_fullOutput += str;

    // There's some ANSI Inquirer just send to keep state of the terminal clear; we'll ignore those since they're
    // unlikely to be used by end users or part of prompt code.
    if (!ignoredAnsi.has(str)) {
      this.#_rawChunks.push(str);
    }

    // Stripping the ANSI codes here because Inquirer will push commands ANSI (like cursor move.)
    // This is probably fine since we don't care about those for testing; but this could become
    // an issue if we ever want to test for those.
    if (stripAnsi(str).trim().length > 0) {
      this.#_chunks.push(str);
    }
    callback();
  }

  getLastChunk({ raw }: { raw?: boolean }): string {
    const chunks = raw ? this.#_rawChunks : this.#_chunks;
    const lastChunk = chunks[chunks.length - 1];
    return lastChunk ?? '';
  }

  getFullOutput(): string {
    return this.#_fullOutput;
  }
}

export async function render<TestedPrompt extends Prompt<any, any>>(
  prompt: TestedPrompt,
  props: Parameters<TestedPrompt>[0],
  options?: Parameters<TestedPrompt>[1]
) {
  inputStream.unmute();

  const answer = prompt(props, { input: inputStream, output, ...options });

  // Wait for event listeners to be ready
  await Promise.resolve();
  await Promise.resolve();

  const events = {
    keypress(
      key:
        | string
        | {
            name?: string | undefined;
            ctrl?: boolean | undefined;
            meta?: boolean | undefined;
            shift?: boolean | undefined;
          }
    ) {
      if (typeof key === 'string') {
        inputStream.emit('keypress', null, { name: key });
      } else {
        inputStream.emit('keypress', null, key);
      }
    },
    type(text: string) {
      inputStream.write(text);
      for (const char of text) {
        inputStream.emit('keypress', null, { name: char });
      }
    },
  };

  return {
    answer,
    input: inputStream,
    events,
    // Ensure the buffer is flushed before moving on
    step: () => Promise.resolve(),
    getScreen({ raw }: { raw?: boolean } = {}): string {
      const lastScreen = output.getLastChunk({ raw });
      return raw ? lastScreen : stripAnsi(lastScreen).trim();
    },
    getFullOutput(): string {
      return output.getFullOutput();
    },
  };
}

let inputStream = new MuteStream();
let output = new BufferedStream();

const SPINNER_FRAME = '[LOADING_SPINNER]';
const theme = {
  // Override spinner with a single frame
  spinner: { frames: [SPINNER_FRAME] },
};

let input: ReturnType<typeof createInput>;
beforeEach(() => {
  inputStream = new MuteStream();
  output = new BufferedStream();
  input = createInput(inputStream, output);
});

describe('client.input', () => {
  describe('text', () => {
    it('text', async () => {
      const { answer, events, getScreen } = await render(input.text, {
        message: 'What is your name',
        theme,
      });
      expect(getScreen()).toMatchInlineSnapshot(`"? What is your name"`);
      events.type('Joe');
      events.keypress('enter');
      expect(getScreen()).toMatchInlineSnapshot(
        `"[LOADING_SPINNER] What is your name Joe"`
      );
      await expect(answer).resolves.toEqual('Joe');
    });
  });

  describe('checkbox', () => {
    it('multiple choices', async () => {
      const { answer, events, getScreen } = await render(input.checkbox, {
        message: 'Choose an option',
        choices: [{ value: 'a' }, { value: 'b' }, { value: 'c' }],
        theme,
      });
      expect(getScreen()).toMatchInlineSnapshot(`
        "? Choose an option (Press <space> to select, <a> to toggle all, <i> to invert
        selection, and <enter> to proceed)
        ❯◯ a
         ◯ b
         ◯ c"
      `);
      events.keypress('space');
      expect(getScreen()).toMatchInlineSnapshot(`
        "? Choose an option
        ❯◉ a
         ◯ b
         ◯ c"
      `);
      events.keypress('enter');
      await expect(answer).resolves.toEqual(['a']);
      expect(getScreen()).toMatchInlineSnapshot(`"? Choose an option a"`);
    });
  });
});
