import { describe, expect, it } from 'vitest';
import { inferCliSubcommandAliases } from '../../../../src/util/openapi/infer-cli-aliases';
import type {
  EndpointInfo,
  Parameter,
} from '../../../../src/util/openapi/types';

const ep = (method: string, params: Parameter[] = []): EndpointInfo => ({
  path: '/v1/x',
  method,
  summary: '',
  description: '',
  operationId: 'op',
  tags: ['t'],
  parameters: params,
});

describe('inferCliSubcommandAliases', () => {
  it('GET without path params → ls, list', () => {
    expect(inferCliSubcommandAliases(ep('GET'))).toEqual(['ls', 'list']);
  });

  it('GET with query-only params → ls, list', () => {
    const e = ep('GET', [{ name: 'filter', in: 'query' as const }]);
    expect(inferCliSubcommandAliases(e)).toEqual(['ls', 'list']);
  });

  it('GET with path params → inspect, get', () => {
    const e = ep('GET', [{ name: 'id', in: 'path' as const }]);
    expect(inferCliSubcommandAliases(e)).toEqual(['inspect', 'get']);
  });

  it('POST → add, create', () => {
    expect(inferCliSubcommandAliases(ep('POST'))).toEqual(['add', 'create']);
  });

  it('DELETE → rm, remove', () => {
    expect(inferCliSubcommandAliases(ep('DELETE'))).toEqual(['rm', 'remove']);
  });

  it('PUT → update', () => {
    expect(inferCliSubcommandAliases(ep('PUT'))).toEqual(['update']);
  });

  it('PATCH → update', () => {
    expect(inferCliSubcommandAliases(ep('PATCH'))).toEqual(['update']);
  });

  it('unknown method → empty', () => {
    expect(inferCliSubcommandAliases(ep('OPTIONS'))).toEqual([]);
  });
});
