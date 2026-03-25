// Schema registry for firewall patch actions.
// Each action maps to a description and a JSON schema for the `value` field
// that `--json` accepts on write commands.
//
// This registry starts empty. Each PR adds entries as commands are implemented.
// For example, the IP blocks PR adds `ip.insert`, `ip.remove`, `ip.update`.

export interface FirewallActionSchema {
  description: string;
  schema: object;
}

export const firewallSchemas: Record<string, FirewallActionSchema> = {};
