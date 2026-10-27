# Deploy describe (internal preview)

`vercel deploy describe --deployment dpl_xxx --aws-account-id 123456789012` prepares local build output for provisioning in AWS. It is hidden from root help; the deployment API authorizes access to the linked team. It fetches deployment metadata and layers without prompting, provisioning AWS resources, or continuing the deployment.

The [vendored-code boundary](../src/util/describe/vendor/README.md) documents the pinned `vercel/api` source and sync procedure; the parent `describe/` directory owns the CLI workflow.

## Inputs and effects

- Uses the team in the local project link. A conflicting explicit team or VERCEL_PROJECT_ID is rejected; the globally selected team does not override the link. CI workers can restore settings with `vercel pull --yes` before building and describing.
- Resolves per-directory and repository links using the CLI's existing project and workspace helpers. Build-file references use the same repository root as `vercel build`. Ambiguous repository links require running from the intended project directory or supplying `--cwd`.
- Requires `--deployment` and a 12-digit `--aws-account-id`. Both remain strings; duplicate options use the parser's last value. Unknown options, extra positionals, and empty or invalid values exit 2.
- `--id` is the deprecated name of `--deployment`. It still works and warns: on stderr in human mode, or in the result's `warnings` list with `--json`. Passing both exits 2.
- Writes `.vercel/<id>/descriptor.json`, `zips/`, and `layers/`. Descriptors and ZIPs are private files and may contain environment values.
- Preserves the original `.vercel/output` in `.vercel/<id>/build/`, then replaces output with a continuation containing `provision.json` and no function code. A retry uses the preserved build; a fresh build takes precedence.
- Supports native AWS Lambda outputs at the build root and in services, including service routing. Service functions use `services/<name>/<function-path>` keys in `provision.json`; their configurations remain under `services/<name>/functions/<function-path>.func/`. Service context is included in descriptor requests so runtime environment and identity match registration.
- Preserves function aliases and prerender configuration in the continuation so routes sharing a function remain grouped during provisioning.
- Copies package metadata into the continuation so those files do not depend on external references or the uploader's project root. Function configuration and package JSON remain; executable function files do not. Only the root and top-level `node_modules` package manifests are copied, matching the Build Container's dependency checks.
- Rejects build-output symlinks that escape the output tree or form cycles. Mapped sources and copied package metadata must stay within the repository and respect the prebuilt uploader's ignore and VCS rules, including its dependency/output exceptions. Rebuild unsafe artifacts before retrying.
- Descriptor layer keys are hashes of the full layer ARN. Each function's `layers` entries reference these keys; different layers with the same version remain distinct.
- Preparation failures preserve existing artifacts. Replacement errors roll back completed renames, preserving provisioning inventories. If rollback fails, `.vercel/.describe-<id>-*` retains private backups for recovery. Run one writer at a time; replacement is not atomic across directories on abrupt process termination.
- Edge Functions, Hive/affinity functions, container runtimes, daemons, and service bindings remain unsupported. These outputs are rejected before descriptor requests. Windows is not supported yet.
- Service outputs whose paths are unchanged during registration work with the existing backend. Outputs whose service paths are transformed, such as `page.html` with clean URLs, require the API and Build Container resolved-provisioning rollout (`enableBuildContainerResolvedProvisioning`) to retain their source provisioning identity.

## Output contract

Human stdout contains the descriptor path. Progress and the provisioning/continuation instruction go to stderr:

```text
$ vercel deploy describe --deployment dpl_xxx --aws-account-id 123456789012
> Preparing dpl_xxx in team team_example for AWS account 123456789012
/path/to/project/.vercel/dpl_xxx/descriptor.json
> Prepared function packages in /path/to/project/.vercel/dpl_xxx
> Provision the functions in descriptor.json, then run:
  vercel deploy continue --deployment dpl_xxx
```

`--json` returns a receipt, never the descriptor's environment values or signed URLs:

```json
{
  "deployment": { "id": "dpl_xxx" },
  "awsAccountId": "123456789012",
  "directory": "/path/to/project/.vercel/dpl_xxx",
  "descriptor": "/path/to/project/.vercel/dpl_xxx/descriptor.json"
}
```

Failure leaves stdout empty. Human mode reports an error on stderr; JSON mode writes one error document there, for example:

```json
{
  "status": "error",
  "reason": "invalid_arguments",
  "message": "Provide a 12-digit AWS account ID with --aws-account-id."
}
```

Success exits 0, operational failures exit 1, and usage failures exit 2. `vercel deploy describe --help` works before authentication. Telemetry records only redacted option presence and the JSON flag.
