import box from '../../../../src/util/output/box';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';

describe('box()', () => {
  it.skip('should show single line box with default padding', () => {
    const result = box('Hello world!');
    expect(stripAnsi(result)).toEqual(
      `
╭──────────────────╮
│                  │
│   Hello world!   │
│                  │
╰──────────────────╯
    `.trim()
    );
  });

  it.skip('should show single line box without padding', () => {
    const result = box('Hello world!', { padding: 0 });
    expect(stripAnsi(result)).toEqual(
      `
╭──────────────╮
│ Hello world! │
╰──────────────╯
    `.trim()
    );
  });

  it.skip('should show single line box with padding 2', () => {
    const result = box('Hello world!', { padding: 2 });
    expect(stripAnsi(result)).toEqual(
      `
╭────────────────────────╮
│                        │
│                        │
│      Hello world!      │
│                        │
│                        │
╰────────────────────────╯
    `.trim()
    );
  });

  it.skip('should show multiple lines with default padding', () => {
    const result = box(
      'Hello world!\nThis is a really, really long line of text\n\nWow!'
    );
    expect(stripAnsi(result)).toEqual(
      `
╭────────────────────────────────────────────────╮
│                                                │
│                  Hello world!                  │
│   This is a really, really long line of text   │
│                                                │
│                      Wow!                      │
│                                                │
╰────────────────────────────────────────────────╯
    `.trim()
    );
  });

  it.skip('should ignore ansi color escape sequences', () => {
    const result = box(chalk.red('This text is red'));
    expect(stripAnsi(result)).toEqual(
      `
╭──────────────────────╮
│                      │
│   This text is red   │
│                      │
╰──────────────────────╯
    `.trim()
    );
  });

  it.skip('should left align contents', () => {
    const result = box(
      'This is left aligned\nThis is a really, really long line of text',
      { textAlignment: 'left' }
    );
    expect(stripAnsi(result)).toEqual(
      `
╭────────────────────────────────────────────────╮
│                                                │
│   This is left aligned                         │
│   This is a really, really long line of text   │
│                                                │
╰────────────────────────────────────────────────╯
    `.trim()
    );
  });

  it.skip('should right align contents', () => {
    const result = box(
      'This is right aligned\nThis is a really, really long line of text',
      { textAlignment: 'right' }
    );
    expect(stripAnsi(result)).toEqual(
      `
╭────────────────────────────────────────────────╮
│                                                │
│                        This is right aligned   │
│   This is a really, really long line of text   │
│                                                │
╰────────────────────────────────────────────────╯
    `.trim()
    );
  });

  it.skip('should slim if terminal width too small', () => {
    const result = box('This is a really, really long line of text', {
      terminalColumns: 30,
    });
    expect(stripAnsi(result)).toEqual(
      `
──────────────────────────────

This is a really, really long line of text

──────────────────────────────
    `.trim()
    );
  });
});
