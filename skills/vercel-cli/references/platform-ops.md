# Platform Operations

## Alerts

An alert is an observed event; an alert rule is a configured trigger with notification routing. Inspect the API-owned rule schema before authoring a rule, and discover metric IDs and dimensions from the metrics schema. Built-in and custom rules have different scope requirements; do not copy a body between them without checking the schema.

## Usage and Account Changes

Bound usage queries to the requested window and grouping. Missing plan or permission data is not zero usage. Billing and purchase operations can change paid account state; keep them within the user's authorized purchase and target.

Token values are credentials, not ordinary account metadata. Avoid exposing them when listing or describing account state.

CLI upgrades affect the installation used by subsequent commands. Preserve a project-pinned version unless the task calls for changing it; do not upgrade the global installation merely to make a remembered command work.
