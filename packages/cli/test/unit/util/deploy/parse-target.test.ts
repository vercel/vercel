import parseTarget from '../../../../src/util/deploy/parse-target';
import { Output } from '../../../../src/util/output';

describe('parseTarget', () => {
  let output: Output;

  beforeEach(() => {
    output = new Output();
    output.warn = jest.fn();
    output.error = jest.fn();
  });

  it('defaults to `undefined`', () => {
    let result = parseTarget(output);
    expect(result).toEqual(undefined);
  });

  it('fails when given invalid target', () => {
    const result = parseTarget(output, 'not-a-real-environment');
    expect(result).toEqual(1);

    const errorMock = (output.error as jest.Mock<any, any>).mock;
    expect(errorMock.calls[0][0]).toMatch(
      /not-a-real-environment.+is not valid/g
    );
  });

  it('parses "production" target', () => {
    let result = parseTarget(output, 'production');
    expect(result).toEqual('production');
    expect(output.warn).toHaveBeenCalledWith(
      'We recommend using the much shorter `--prod` option instead of `--target production` (deprecated)'
    );
  });

  it('parses "staging" target', () => {
    let result = parseTarget(output, 'staging');
    expect(result).toEqual('staging');
  });

  it('prefers target over production argument', () => {
    let result = parseTarget(output, 'staging', true);
    expect(result).toEqual('staging');
  });

  it('parses production argument when `true`', () => {
    let result = parseTarget(output, undefined, true);
    expect(result).toEqual('production');
  });

  it('parses production argument when `false`', () => {
    let result = parseTarget(output, undefined, false);
    expect(result).toEqual(undefined);
  });
});
