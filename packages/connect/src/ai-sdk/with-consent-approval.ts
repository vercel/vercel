import type { ToolApprovalConfiguration, ToolSet } from 'ai';

/** Options accepted by {@link withConsentApproval}. */
export interface WithConsentApprovalOptions {
  /**
   * Prefix applied to every tool name in the input set. Useful when
   * combining tools from multiple MCP servers in a single
   * `streamText` call to keep names unique and let the model see
   * which provider each tool belongs to (e.g. `linear_create_issue`
   * vs `github_create_issue`).
   *
   * Pass an empty string (or omit) to keep the original names.
   */
  readonly prefix?: string;

  /**
   * Optional filter that lets the caller opt specific tools out of
   * the approval prompt — for example, surfacing read-only tools
   * without approval and gating only writes. Receives the tool name
   * *with* the configured prefix applied; returns `true` to require
   * approval, `false` to auto-approve.
   *
   * Defaults to requiring approval for every tool in the set.
   */
  readonly needsApproval?: (toolName: string) => boolean;
}

/**
 * Returned by {@link withConsentApproval}. Spread `tools` into a
 * `streamText` / `generateText` / `Agent` call and pass
 * `toolApproval` to the `toolApproval` parameter.
 *
 * When merging multiple provider sets, the `tools` objects merge
 * with spread (no overlap thanks to per-provider prefixes) and the
 * `toolApproval` objects also merge with spread.
 */
export interface WithConsentApprovalResult<TOOLS extends ToolSet> {
  readonly tools: TOOLS;
  readonly toolApproval: ToolApprovalConfiguration<TOOLS, unknown>;
}

/**
 * Wraps an MCP tools object with AI SDK v7's
 * `toolApproval` Human-in-the-Loop primitive. Every tool in the
 * input set is flagged as `'user-approval'` (override per-tool with
 * {@link WithConsentApprovalOptions.needsApproval}) so the model
 * pauses the stream and surfaces an approval request before the
 * tool runs.
 *
 * This is distinct from the OAuth consent that
 * `connectAuthProvider` handles. OAuth consent grants Connect
 * access to the provider once per user; this helper layers on
 * per-call user approval, so destructive actions still require an
 * explicit click in the UI.
 *
 * Requires `ai@^7`.
 *
 * ```ts
 * const mcpClient = await createMCPClient({
 *   transport: {
 *     type: 'http',
 *     url: 'https://mcp.linear.app',
 *     authProvider: connectAuthProvider('oauth/linear', {
 *       subject: { type: 'user', id: userId },
 *     }),
 *   },
 * });
 *
 * const linear = withConsentApproval(await mcpClient.tools(), {
 *   prefix: 'linear_',
 *   needsApproval: (name) => name.startsWith('linear_create_'),
 * });
 *
 * const result = await streamText({
 *   model: 'openai/gpt-5.4',
 *   tools: linear.tools,
 *   toolApproval: linear.toolApproval,
 *   prompt,
 * });
 * ```
 */
export function withConsentApproval<TOOLS extends ToolSet>(
  tools: TOOLS,
  options: WithConsentApprovalOptions = {}
): WithConsentApprovalResult<TOOLS> {
  const prefix = options.prefix ?? '';
  const needsApproval = options.needsApproval ?? (() => true);

  const renamed: Record<string, TOOLS[keyof TOOLS]> = {};
  const approval: Record<string, 'user-approval' | 'approved'> = {};

  for (const [name, tool] of Object.entries(tools)) {
    const next = prefix ? `${prefix}${name}` : name;
    renamed[next] = tool as TOOLS[keyof TOOLS];
    approval[next] = needsApproval(next) ? 'user-approval' : 'approved';
  }

  return {
    tools: renamed as unknown as TOOLS,
    toolApproval: approval as unknown as ToolApprovalConfiguration<
      TOOLS,
      unknown
    >,
  };
}
