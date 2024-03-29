import { describe, it, expect } from 'vitest';
import { client } from '../../../mocks/client';
import { render } from '../../../helpers/render';

const SPINNER_FRAME = '[LOADING_SPINNER]';
const theme = {
  // Override spinner with a single frame
  spinner: { frames: [SPINNER_FRAME] },
};

describe('client.input', () => {
  describe('text', () => {
    it('text', async () => {
      const { answer, events, getScreen } = await render(client.input.text, {
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
      const { answer, events, getScreen } = await render(
        client.input.checkbox,
        {
          message: 'Choose an option',
          choices: [{ value: 'a' }, { value: 'b' }, { value: 'c' }],
          theme,
        }
      );
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
