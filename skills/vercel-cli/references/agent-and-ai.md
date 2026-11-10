# Agent, MCP, and AI Gateway Setup

Machine setup can install or enable plugins, write configuration under the user's home directory, and create an AI Gateway key for the selected team. Limit setup to the requested agent and capability; inspect its dry-run result before changing an existing configuration. Existing configuration backups use `.bak`.

Plugin installation and Gateway setup are separate steps. A successful plugin install does not establish that Gateway configuration completed; canceled setup or an unapplied generated prompt leaves work outstanding.

Use the supported installer for the selected client. An installed plugin may still need a new session or account connection. Verify installed/enabled and connected state rather than repeatedly reinstalling.

Gateway keys are credentials with billing scope. Reuse an appropriate existing key when supplied, preserve the requested team and budget, and avoid exposing the key in output. MCP setup can require client selection and a user-controlled authentication flow; do not treat generating local configuration as completed authentication.
