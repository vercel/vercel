import { describe, it, expect } from 'vitest';
import { client } from '../../../mocks/client';
import isUnicodeSupported from 'is-unicode-supported';

const theme = {
  // Override spinner with a single frame
  spinner: { frames: ['O'] },
};

console.log({ isUnicodeSupported: isUnicodeSupported() });

describe('client.input', () => {
  describe('text', () => {
    it('should match the snapshot', async () => {
      const answer = client.input.text({
        message: 'What is your name',
        theme,
      });
      expect(client.getScreen()).toMatchInlineSnapshot(`"? What is your name"`);
      client.events.type('Joe');
      client.events.keypress('enter');
      expect(client.getScreen()).toMatchInlineSnapshot(
        `"O What is your name Joe"`
      );
      await expect(answer).resolves.toEqual('Joe');
    });
    it('should use the default value if nothing is provided', async () => {
      const answer = client.input.text({
        message: 'What is your name',
        default: 'Joe',
        theme,
      });
      expect(client.getScreen()).toMatchInlineSnapshot(
        `"? What is your name (Joe)"`
      );
      client.events.keypress('enter');
      await expect(answer).resolves.toEqual('Joe');
    });
  });

  describe('checkbox', () => {
    it('multiple choices', async () => {
      const answer = client.input.checkbox({
        message: 'Choose an option',
        choices: [{ value: 'a' }, { value: 'b' }, { value: 'c' }],
        theme,
      });
      expect(client.getScreen()).toMatchInlineSnapshot(`
        "? Choose an option (Press <space> to select, <a> to toggle all, <i> to invert
        selection, and <enter> to proceed)
        ❯◯ a
         ◯ b
         ◯ c"
      `);
      client.events.keypress('space');
      expect(client.getScreen()).toMatchInlineSnapshot(`
        "? Choose an option
        ❯◉ a
         ◯ b
         ◯ c"
      `);
      client.events.keypress('enter');
      await expect(answer).resolves.toEqual(['a']);
      expect(client.getScreen()).toMatchInlineSnapshot(
        `"? Choose an option a"`
      );
    });
  });
  describe('select', () => {
    it(`uses the values if no "name" is provided`, async () => {
      client.input.expand({
        message: 'Select an action:',
        choices: [
          { key: 'g', name: 'Good', value: 'good' },
          { key: 'b', name: 'Bad', value: 'bad' },
          { key: 's', name: 'Skip', value: 'skip' },
        ],
      });
      expect(client.getScreen()).toMatchInlineSnapshot(
        `"? Select an action: (gbsH)"`
      );
      client.events.type('H');
      expect(client.getScreen()).toMatchInlineSnapshot(`
        "? Select an action: (gbsH) H
        >> Help, list all options"
      `);
    });
    it(`uses the values if no "name" is provided`, async () => {
      const answer = client.input.expand({
        message: 'Select an action:',
        choices: [
          { key: 'g', name: 'Good', value: 'good' },
          { key: 'b', name: 'Bad', value: 'bad' },
          { key: 's', name: 'Skip', value: 'skip' },
        ],
      });
      expect(client.getScreen()).toMatchInlineSnapshot(
        `"? Select an action: (gbsH)"`
      );
      client.events.type('b');
      expect(client.getScreen()).toMatchInlineSnapshot(`
        "? Select an action: (gbsH) b
        >> Bad"
      `);
      client.events.keypress('enter');
      await expect(answer).resolves.toEqual('bad');
    });
  });
  describe('select', () => {
    it(`uses the values if no "name" is provided`, async () => {
      client.input.select({
        message: 'Choose an option',
        choices: [{ value: 'a' }, { value: 'b' }],
      });
      expect(client.getScreen()).toMatchInlineSnapshot(`
        "? Choose an option (Use arrow keys)
        ❯ a
          b"
      `);
    });
    it(`using a separator`, async () => {
      client.input.select({
        message: 'Choose an option',
        choices: [
          { value: 'a' },
          { type: 'separator', separator: '---' },
          { value: 'b' },
        ],
      });
      expect(client.getScreen()).toMatchInlineSnapshot(`
        "? Choose an option (Use arrow keys)
        ❯ a
         ---
          b"
      `);
      client.events.keypress('down');
      expect(client.getScreen()).toMatchInlineSnapshot(`
        "? Choose an option
          a
         ---
        ❯ b"
      `);
    });
    it(`matches the expected output`, async () => {
      const answer = client.input.select({
        message: 'Choose an option',
        choices: [
          { value: 'a', name: 'Option A' },
          { value: 'b', name: 'Option B' },
        ],
      });
      expect(client.getScreen()).toMatchInlineSnapshot(`
        "? Choose an option (Use arrow keys)
        ❯ Option A
          Option B"
      `);
      client.events.keypress('down');
      expect(client.getScreen()).toMatchInlineSnapshot(`
        "? Choose an option
          Option A
        ❯ Option B"
      `);
      client.events.keypress('enter');
      expect(client.getScreen()).toMatchInlineSnapshot(
        `"? Choose an option Option B"`
      );
      await expect(answer).resolves.toEqual('b');
    });
    it(`with a default matches the expected output`, async () => {
      const answer = client.input.select({
        message: 'Choose an option',
        default: 'b',
        choices: [
          { value: 'a', name: 'Option A' },
          { value: 'b', name: 'Option B' },
        ],
      });
      expect(client.getScreen()).toMatchInlineSnapshot(`
        "? Choose an option (Use arrow keys)
          Option A
        ❯ Option B"
      `);
      client.events.keypress('enter');
      expect(client.getScreen()).toMatchInlineSnapshot(
        `"? Choose an option Option B"`
      );
      await expect(answer).resolves.toEqual('b');
    });
  });
  describe('confirm', () => {
    it(`defaults to true if no default is provided`, async () => {
      const answer = client.input.confirm({
        message: 'Confirm the value',
      });
      expect(client.getScreen()).toMatchInlineSnapshot(
        `"? Confirm the value (Y/n)"`
      );
      client.events.keypress('enter');
      await expect(answer).resolves.toEqual(true);
    });
    it(`defaulting to false works`, async () => {
      const answer = client.input.confirm({
        message: 'Confirm the value',
        default: false,
      });
      expect(client.getScreen()).toMatchInlineSnapshot(
        `"? Confirm the value (y/N)"`
      );
      client.events.keypress('enter');
      await expect(answer).resolves.toEqual(false);
    });
    it(`typing "n" for the value`, async () => {
      const answer = client.input.confirm({
        message: 'Confirm the value',
      });
      expect(client.getScreen()).toMatchInlineSnapshot(
        `"? Confirm the value (Y/n)"`
      );
      client.events.type('n');
      client.events.keypress('enter');
      expect(client.getScreen()).toMatchInlineSnapshot(
        `"? Confirm the value no"`
      );
      await expect(answer).resolves.toEqual(false);
    });
    it(`typing "y" for the value`, async () => {
      const answer = client.input.confirm({
        message: 'Confirm the value',
      });
      expect(client.getScreen()).toMatchInlineSnapshot(
        `"? Confirm the value (Y/n)"`
      );
      client.events.type('y');
      client.events.keypress('enter');
      expect(client.getScreen()).toMatchInlineSnapshot(
        `"? Confirm the value yes"`
      );
      await expect(answer).resolves.toEqual(true);
    });
  });
});
