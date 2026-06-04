import type { ToolSet } from 'ai';
import { describe, expect, it } from 'vitest';
import { withConsentApproval } from '../../src/ai-sdk/with-consent-approval.js';

/**
 * `withConsentApproval` only iterates entries — the actual tool
 * shape never runs. Use opaque stubs to avoid AI SDK's `ToolSet`
 * index-type quirk where inferred `tool()` results don't satisfy
 * the index signature. Real-world callers pass the result of
 * `await mcpClient.tools()`, which is typed correctly upstream.
 */
function makeTools(): ToolSet {
  return {
    create_issue: { __test: 'create_issue' } as unknown as ToolSet[string],
    get_issue: { __test: 'get_issue' } as unknown as ToolSet[string],
  };
}

describe('withConsentApproval', () => {
  it('flags every tool as user-approval by default', () => {
    const { tools, toolApproval } = withConsentApproval(makeTools());
    expect(Object.keys(tools)).toEqual(['create_issue', 'get_issue']);
    expect(toolApproval).toEqual({
      create_issue: 'user-approval',
      get_issue: 'user-approval',
    });
  });

  it('applies the configured prefix to every tool name', () => {
    const { tools, toolApproval } = withConsentApproval(makeTools(), {
      prefix: 'linear_',
    });
    expect(Object.keys(tools)).toEqual([
      'linear_create_issue',
      'linear_get_issue',
    ]);
    expect(toolApproval).toEqual({
      linear_create_issue: 'user-approval',
      linear_get_issue: 'user-approval',
    });
  });

  it('lets callers opt specific tools out of approval via needsApproval', () => {
    const { toolApproval } = withConsentApproval(makeTools(), {
      prefix: 'linear_',
      needsApproval: name => name.startsWith('linear_create_'),
    });
    expect(toolApproval).toEqual({
      linear_create_issue: 'user-approval',
      linear_get_issue: 'approved',
    });
  });

  it('preserves the original tool implementations under the prefixed key', () => {
    const original = makeTools();
    const { tools } = withConsentApproval(original, { prefix: 'linear_' });
    expect(tools.linear_create_issue).toBe(original.create_issue);
    expect(tools.linear_get_issue).toBe(original.get_issue);
  });

  it('returns independent objects so callers can merge multiple provider sets', () => {
    const linear = withConsentApproval(makeTools(), { prefix: 'linear_' });
    const github = withConsentApproval(
      {
        open_pr: { __test: 'open_pr' } as unknown as ToolSet[string],
      } as ToolSet,
      { prefix: 'github_' }
    );

    const mergedTools = { ...linear.tools, ...github.tools };
    const mergedApproval = { ...linear.toolApproval, ...github.toolApproval };

    expect(Object.keys(mergedTools)).toEqual([
      'linear_create_issue',
      'linear_get_issue',
      'github_open_pr',
    ]);
    expect(mergedApproval).toEqual({
      linear_create_issue: 'user-approval',
      linear_get_issue: 'user-approval',
      github_open_pr: 'user-approval',
    });
  });
});
