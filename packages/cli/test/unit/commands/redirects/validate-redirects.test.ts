import { describe, expect, it } from 'vitest';
import { validateCSVStructure } from '../../../../src/commands/redirects/validate-redirects';

describe('validateCSVStructure', () => {
  it('accepts the documented bulk-redirects columns without warnings', () => {
    const result = validateCSVStructure(
      'source,destination,statusCode,permanent,caseSensitive,preserveQueryParams\n/a,/b,301,false,false,true'
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toBeUndefined();
  });

  it('still rejects a CSV missing source or destination', () => {
    const result = validateCSVStructure('destination,statusCode\n/b,301');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'CSV must have "source" and "destination" columns'
    );
  });

  it('warns on unrecognized columns instead of silently ignoring them', () => {
    const result = validateCSVStructure(
      'source,destination,redirectType\n/a,/b,permanent'
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      'Unrecognized CSV column "redirectType" will be ignored.',
    ]);
  });

  it('suggests statusCode when the header uses status', () => {
    // `status` parsed "successfully" but was never read, so every row
    // silently fell back to 307 (#17261).
    const result = validateCSVStructure(
      'source,destination,status,caseSensitive,preserveQueryParams\n/old-path,/new-path,301,false,true'
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([
      'Unrecognized CSV column "status" will be ignored. Did you mean "statusCode"? Without it, redirects default to 307.',
    ]);
  });

  it('handles quoted and case-varied headers', () => {
    const result = validateCSVStructure(
      '"Source","Destination","StatusCode"\n/a,/b,308'
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toBeUndefined();
  });
});
