Agent errors preserve existing reason codes and add recovery information where the cause is known:

- `hint` explains what must change before another attempt.
- `retryable: false` means repeating the same request with unchanged prerequisites will not resolve the failure. It does not prohibit a corrected request.
- `retryAfterMs`, when present, is the positive delay reported by the server. An absent value is not an instruction to retry immediately.
- `scope`, `action`, and `resource` identify the selected team and required permission when known. They do not disclose ownership of inaccessible resources.
- Command corrections are suggestions only. They never execute automatically. Ambiguous matches are omitted, credentials are removed, and values that cannot safely be repeated are placeholders.

Permission, subscription, disabled-feature, and request-limit errors have different recovery instructions. Metrics JSON retains its existing `error` object and includes the same instructions as human output. Subscription suggestions require checking existing access and approval of the purchase; confirmation flags are not carried into purchase suggestions.

For detected agents, shared error output also includes `cliVersion` and `invocationId`. The new `agent_error` telemetry event records the invocation ID, a fixed category, and whether recovery guidance is present. It does not record the error text, command arguments, credentials, or customer resource names. `agent_command_outcome` records returned exit codes and distinguishes successful help exits (including legacy exit 2). These events use the existing telemetry opt-out and session handling.

The agent runner must join CLI invocations with its own tool-call ID, step ID, start/end times, and task ID to measure recovery. Count sequential attempt rounds separately from parallel tool calls. A later successful command does not prove the original task recovered. Deployment inspections can also return failure because the deployment failed; keep those separate from command usage errors.

This repository does not contain Omniagent's tool-span recorder. Missing tool arguments/result bodies in September 9–12 traces cannot be restored by this CLI change. The recorder needs a separate fix to retain safe error categories and output-availability fields, along with the CLI version and invocation ID. Existing command paths that directly call `process.exit` can bypass the final telemetry flush; their structured stdout remains the evidence source. Do not interpret missing telemetry as success or complete traffic coverage.
