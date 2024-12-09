import os from 'os';
import { describe, expect, it } from 'vitest';
import getDominantEOL from '../../../src/util/get-dominant-eol';

describe('getDominantEOL', () => {
  it('should return the most frequent end-of-line', () => {
    expect(getDominantEOL('a\nb\nc\nd')).toEqual('\n');
    expect(getDominantEOL('a\r\nb\r\nc\r\nd')).toEqual('\r\n');

    expect(getDominantEOL('a\nb\nc\r\nd')).toEqual('\n');
    expect(getDominantEOL('a\r\nb\nc\r\nd')).toEqual('\r\n');
  });

  it('should return the os end-of-line when the line endings has the same frequency', () => {
    expect(getDominantEOL('a\nb\r\nc')).toEqual(os.EOL);
    expect(getDominantEOL('a\r\nb\nc')).toEqual(os.EOL);
  });
});
