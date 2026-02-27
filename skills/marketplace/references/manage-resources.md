# Manage Resources

## Listing

```bash
vercel integration list                                # resources for linked project
vercel integration list --all                          # all resources across the team
vercel integration list -i <slug>                      # filter by integration
vercel integration list <project>                      # resources for a specific project
vercel integration list --format=json                  # as JSON
```

## Opening Dashboards

```bash
vercel integration open <integration>                  # open integration dashboard
vercel integration open <integration> <resource>       # open specific resource dashboard
vercel integration open <integration> --format=json    # get SSO link as JSON
```

Uses SSO — no separate login needed.

## Disconnecting

Use `vercel integration-resource` (alias: `vercel ir`):

```bash
vercel ir disconnect <resource>                        # disconnect from current project
vercel ir disconnect <resource> <project>              # disconnect from specific project
vercel ir disconnect <resource> --all                  # disconnect from all projects
vercel ir disconnect <resource> --yes                  # skip confirmation
vercel ir disconnect <resource> --format=json          # as JSON
```

Disconnecting removes the environment variables from the project but does not delete the resource.
