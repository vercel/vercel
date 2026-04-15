import stripAnsi from 'strip-ansi';
import { describe, expect, it } from 'vitest';
import {
  formatArgsColumnText,
  formatDescriptionWithQueryOptionLines,
  operationIdToCliDisplayKebab,
} from '../../../../src/commands/openapi/describe-operation';
import type { EndpointInfo } from '../../../../src/util/openapi/types';

function ep(
  partial: Partial<EndpointInfo> & Pick<EndpointInfo, 'path'>
): EndpointInfo {
  return {
    method: 'GET',
    summary: '',
    description: '',
    operationId: 'op',
    tags: ['t'],
    parameters: [],
    responses: {},
    vercelCliSupported: true,
    vercelCliAliases: [],
    ...partial,
  };
}

describe('describe-operation', () => {
  it('formatArgsColumnText uses bracketed path placeholders', () => {
    const e = ep({
      path: '/v1/projects/{projectId}/x',
      parameters: [
        {
          name: 'projectId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ],
    });
    expect(formatArgsColumnText(e)).toBe('[projectId]');
  });

  it('formatDescriptionWithQueryOptionLines puts each option on its own line after a blank line', () => {
    const e = ep({
      path: '/v1/x',
      description: 'Does something.',
      parameters: [
        {
          name: 'teamId',
          in: 'query',
          schema: { type: 'string' },
        },
        {
          name: 'slug',
          in: 'query',
          required: true,
          schema: { type: 'string' },
        },
      ],
    });
    const flags = ['--team-id', '--slug'];
    const flagColW = Math.max(22, ...flags.map(f => f.length));
    const optionBlock = flags
      .map(f => f + ' '.repeat(flagColW - f.length))
      .join('\n');
    expect(stripAnsi(formatDescriptionWithQueryOptionLines(e))).toBe(
      `Does something.\n\n${optionBlock}`
    );
  });

  it('formatDescriptionWithQueryOptionLines bolds required query flags', () => {
    const e = ep({
      path: '/v1/x',
      description: 'X.',
      parameters: [
        {
          name: 'q',
          in: 'query',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'offset',
          in: 'query',
          schema: { type: 'string' },
        },
      ],
    });
    const out = formatDescriptionWithQueryOptionLines(e);
    const flags = ['--q', '--offset'];
    const flagColW = Math.max(22, ...flags.map(f => f.length));
    const optionBlock = flags
      .map(f => f + ' '.repeat(flagColW - f.length))
      .join('\n');
    expect(stripAnsi(out)).toBe(`X.\n\n${optionBlock}`);
    expect(out).toContain('\u001b[1m');
  });

  it('formatDescriptionWithQueryOptionLines aligns OpenAPI descriptions in a second column', () => {
    const e = ep({
      path: '/v1/x',
      description: 'Summary here.',
      parameters: [
        {
          name: 'teamId',
          in: 'query',
          description: 'Team scope.',
          schema: { type: 'string' },
        },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'string', description: 'Page size.' },
        },
      ],
    });
    const plain = stripAnsi(formatDescriptionWithQueryOptionLines(e));
    const lines = plain.split('\n');
    expect(lines[0]).toBe('Summary here.');
    expect(lines[1]).toBe('');
    expect(lines[2]).toMatch(/^--team-id\s+Team scope\.$/);
    expect(lines[3]).toMatch(/^--limit\s+Page size\.$/);
  });

  it('operationIdToCliDisplayKebab uses alias', () => {
    expect(
      operationIdToCliDisplayKebab(
        ep({
          path: '/a',
          operationId: 'getFoo',
          vercelCliAliases: ['list'],
        })
      )
    ).toBe('list');
  });
});
