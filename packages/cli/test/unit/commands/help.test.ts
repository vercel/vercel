import {
  help,
  lineToString,
  outputArrayToString,
} from '../../../src/commands/help';
import { deployCommand } from '../../../src/commands/deploy/command';

describe('help command', () => {
  describe('lineToString', () => {
    test.each([
      {
        line: ['a', 'b', 'c'],
        expected: 'a b c',
      },
      {
        line: [' ', 'a', ' ', 'b', ' ', 'c', ' '],
        expected: ' a b c ',
      },
      {
        line: [' ', '  ', '   '],
        expected: '      ',
      },
      {
        line: ['a', '  ', '   ', 'b', 'c'],
        expected: 'a     b c',
      },
    ])(
      'should insert spaces between non-whitespace items only; $line',
      ({ line, expected }) => {
        expect(lineToString(line)).toBe(expected);
      }
    );
  });

  describe('outputArrayToString', () => {
    test('should join a list of strings using newlines', () => {
      expect(outputArrayToString(['line 1', 'line 2', 'line 3'])).toBe(
        'line 1\nline 2\nline 3'
      );
    });
  });

  describe('help output snapshots', () => {
    test.each([40, 80, 120])('column width %i', width => {
      expect(help(deployCommand, { columns: width })).toMatchSnapshot();
    });
  });
});
