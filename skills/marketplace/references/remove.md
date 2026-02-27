# Remove

## Removing a Resource

```bash
vercel ir remove <resource>                            # delete (must not be connected to projects)
vercel ir remove <resource> --disconnect-all           # disconnect all projects first, then delete
vercel ir remove <resource> --disconnect-all --yes     # skip confirmation
vercel ir remove <resource> --format=json --yes        # as JSON
```

**This permanently deletes the resource from the provider. Cannot be undone.**

## Uninstalling an Integration

```bash
vercel integration remove <slug>                       # uninstall
vercel integration remove <slug> --yes                 # skip confirmation
vercel integration remove <slug> --format=json --yes   # as JSON
```

All resources must be deleted first — the command fails if any remain.

## Cleanup Workflow

```bash
vercel integration list --all -i <slug>                # find all resources for the integration
vercel ir remove <resource-1> --disconnect-all --yes   # delete each resource
vercel ir remove <resource-2> --disconnect-all --yes
vercel integration remove <slug> --yes                 # uninstall
```
