import { describe, it, expect } from 'vitest';
import { client } from '../../../mocks/client';
import { render } from '../../../helpers/render';

const theme = {
  // Override spinner with a single frame
  spinner: { frames: ['O'] },
};

describe('client.input', () => {
  describe('text', () => {
    it('should match the snapshot', async () => {
      const { answer, events, getScreen } = await render(client.input.text, {
        message: 'What is your name',
        theme,
      });
      expect(getScreen()).toMatchInlineSnapshot(`"? What is your name"`);
      events.type('Joe');
      events.keypress('enter');
      expect(getScreen()).toMatchInlineSnapshot(`"O What is your name Joe"`);
      await expect(answer).resolves.toEqual('Joe');
    });
    it('should use the default value if nothing is provided', async () => {
      const { answer, events, getScreen } = await render(client.input.text, {
        message: 'What is your name',
        default: 'Joe',
        theme,
      });
      expect(getScreen()).toMatchInlineSnapshot(`"? What is your name (Joe)"`);
      events.keypress('enter');
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
  describe('select', () => {
    it(`uses the values if no "name" is provided`, async () => {
      const { events, getScreen } = await render(client.input.expand, {
        message: 'Select an action:',
        choices: [
          { key: 'g', name: 'Good', value: 'good' },
          { key: 'b', name: 'Bad', value: 'bad' },
          { key: 's', name: 'Skip', value: 'skip' },
        ],
      });
      expect(getScreen()).toMatchInlineSnapshot(`"? Select an action: (gbsH)"`);
      events.type('H');
      expect(getScreen()).toMatchInlineSnapshot(`
        "? Select an action: (gbsH) H
        >> Help, list all options"
      `);
    });
    it(`uses the values if no "name" is provided`, async () => {
      const { answer, events, getScreen } = await render(client.input.expand, {
        message: 'Select an action:',
        choices: [
          { key: 'g', name: 'Good', value: 'good' },
          { key: 'b', name: 'Bad', value: 'bad' },
          { key: 's', name: 'Skip', value: 'skip' },
        ],
      });
      expect(getScreen()).toMatchInlineSnapshot(`"? Select an action: (gbsH)"`);
      events.type('b');
      expect(getScreen()).toMatchInlineSnapshot(`
        "? Select an action: (gbsH) b
        >> Bad"
      `);
      events.keypress('enter');
      await expect(answer).resolves.toEqual('bad');
    });
  });
  describe('select', () => {
    it(`uses the values if no "name" is provided`, async () => {
      const { getScreen } = await render(client.input.select, {
        message: 'Choose an option',
        choices: [{ value: 'a' }, { value: 'b' }],
      });
      expect(getScreen()).toMatchInlineSnapshot(`
        "? Choose an option (Use arrow keys)
        ❯ a
          b"
      `);
    });
    it(`using a separator`, async () => {
      const { events, getScreen } = await render(client.input.select, {
        message: 'Choose an option',
        choices: [
          { value: 'a' },
          { type: 'separator', separator: '---' },
          { value: 'b' },
        ],
      });
      expect(getScreen()).toMatchInlineSnapshot(`
        "? Choose an option (Use arrow keys)
        ❯ a
         ---
          b"
      `);
      events.keypress('down');
      expect(getScreen()).toMatchInlineSnapshot(`
        "? Choose an option
          a
         ---
        ❯ b"
      `);
    });
    it(`matches the expected output`, async () => {
      const { answer, events, getScreen } = await render(client.input.select, {
        message: 'Choose an option',
        choices: [
          { value: 'a', name: 'Option A' },
          { value: 'b', name: 'Option B' },
        ],
      });
      expect(getScreen()).toMatchInlineSnapshot(`
        "? Choose an option (Use arrow keys)
        ❯ Option A
          Option B"
      `);
      events.keypress('down');
      expect(getScreen()).toMatchInlineSnapshot(`
        "? Choose an option
          Option A
        ❯ Option B"
      `);
      events.keypress('enter');
      expect(getScreen()).toMatchInlineSnapshot(
        `"? Choose an option Option B"`
      );
      await expect(answer).resolves.toEqual('b');
    });
    it(`with a default matches the expected output`, async () => {
      const { answer, events, getScreen } = await render(client.input.select, {
        message: 'Choose an option',
        default: 'b',
        choices: [
          { value: 'a', name: 'Option A' },
          { value: 'b', name: 'Option B' },
        ],
      });
      expect(getScreen()).toMatchInlineSnapshot(`
        "? Choose an option (Use arrow keys)
          Option A
        ❯ Option B"
      `);
      events.keypress('enter');
      expect(getScreen()).toMatchInlineSnapshot(
        `"? Choose an option Option B"`
      );
      await expect(answer).resolves.toEqual('b');
    });
  });
  describe('confirm', () => {
    it(`defaults to true if no default is provided`, async () => {
      const { answer, events, getScreen } = await render(client.input.confirm, {
        message: 'Confirm the value',
      });
      expect(getScreen()).toMatchInlineSnapshot(`"? Confirm the value (Y/n)"`);
      events.keypress('enter');
      await expect(answer).resolves.toEqual(true);
    });
    it(`defaulting to false works`, async () => {
      const { answer, events, getScreen } = await render(client.input.confirm, {
        message: 'Confirm the value',
        default: false,
      });
      expect(getScreen()).toMatchInlineSnapshot(`"? Confirm the value (y/N)"`);
      events.keypress('enter');
      await expect(answer).resolves.toEqual(false);
    });
    it(`typing "n" for the value`, async () => {
      const { answer, events, getScreen } = await render(client.input.confirm, {
        message: 'Confirm the value',
      });
      expect(getScreen()).toMatchInlineSnapshot(`"? Confirm the value (Y/n)"`);
      events.type('n');
      events.keypress('enter');
      expect(getScreen()).toMatchInlineSnapshot(`"? Confirm the value no"`);
      await expect(answer).resolves.toEqual(false);
    });
    it(`typing "y" for the value`, async () => {
      const { answer, events, getScreen } = await render(client.input.confirm, {
        message: 'Confirm the value',
      });
      expect(getScreen()).toMatchInlineSnapshot(`"? Confirm the value (Y/n)"`);
      events.type('y');
      events.keypress('enter');
      expect(getScreen()).toMatchInlineSnapshot(`"? Confirm the value yes"`);
      await expect(answer).resolves.toEqual(true);
    });
  });
});
