import type { ToolApprovalConfiguration, ToolSet } from 'ai';
import { describe, expectTypeOf, it } from 'vitest';
import { withConsentApproval } from '../../src/ai-sdk/with-consent-approval.js';

const tools = {} as ToolSet;
const result = withConsentApproval(tools, { prefix: 'linear_' });

describe('withConsentApproval type compatibility', () => {
  it('returns AI-SDK-compatible tools and toolApproval', () => {
    expectTypeOf(result.tools).toEqualTypeOf<ToolSet>();
    expectTypeOf(result.toolApproval).toMatchTypeOf<
      ToolApprovalConfiguration<ToolSet, unknown>
    >();
  });
});
