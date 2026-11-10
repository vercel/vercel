# Routing Rules

Published project-level rules take precedence over deployment routing configuration. They can change production traffic without a new application deployment.

Inspect current order and staged changes before editing. Rules run in priority order; a broad earlier match can shadow later rules. Choose path matching semantics deliberately rather than treating regex, named parameters, and exact paths as interchangeable.

Edits create drafts. Review the diff and publish the intended changes before reporting them live. Publishing can include pre-existing staged work; do not accidentally publish or discard another change. Re-inspect the active version after publication or restoration.

Redirect version promotion and route-rule publication are separate workflows. Use the family corresponding to the resource being changed.
