# Prebuilt harness tarballs

Tarballs of `@ai-sdk/harness` and its adapters, packed from a branch checkout
of [vercel/ai](https://github.com/vercel/ai) that carries capabilities
`vercel onboard` depends on but which are not in a published release:

- running a harness against the user's own machine with no sandbox provider
- reusing an already installed agent executable (e.g. `claude`) instead of
  downloading a pinned copy

The deployment serves these at `/tarballs/harness/` (see
`api/_lib/script/build.ts`), and the CLI installs them in preference to the
npm registry build (see
`packages/cli/src/commands/onboard/install-harness-packages.ts`, the
`VERCEL_ONBOARD_HARNESS_REMOTE` source).

## Regenerating

From a built vercel/ai checkout:

```bash
cd /path/to/ai
pnpm --filter @ai-sdk/harness --filter '@ai-sdk/harness-*' build

for p in harness harness-claude-code harness-codex harness-opencode harness-pi harness-deepagents; do
  (cd packages/$p && pnpm pack --pack-destination /path/to/vercel-onboard/harness-prebuilt)
done
```

Then rebuild `manifest.json` (name → version/filename/sha256) so the CLI's
change detection picks up the new builds:

```bash
cd /path/to/vercel-onboard/harness-prebuilt
python3 - <<'EOF'
import hashlib, json, os, tarfile
packages = {}
for f in sorted(os.listdir('.')):
    if not f.endswith('.tgz'): continue
    with tarfile.open(f) as tar:
        m = json.load(tar.extractfile('package/package.json'))
    packages[m['name']] = {'version': m['version'], 'filename': f,
        'sha256': hashlib.sha256(open(f,'rb').read()).hexdigest()}
json.dump({'packages': packages}, open('manifest.json','w'), indent=2)
EOF
```

Pack from a **freshly built** checkout: a stale `dist/` (e.g. from a watch
build) packs tarballs whose entry points import files that do not exist.
