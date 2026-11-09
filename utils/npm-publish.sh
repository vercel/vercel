#!/usr/bin/env bash
set -euo pipefail

# Publish saved candidate tarballs in manifest order. The caller serializes
# releases; this script never scans, builds or packs the post-merge workspace.
# vercel and prereleases are published to canary; release.yml promotes vercel
# to latest manually. Other stable packages go straight to latest.
# NPM_PUBLISH_EXCLUDE / NPM_PUBLISH_ONLY retain the split CLI release phases.
if [ "$#" -ne 1 ]; then
  echo "Usage: bash utils/npm-publish.sh <saved-package-directory>" >&2
  exit 2
fi
payload_dir=$(cd -- "$1" && pwd)
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
integrity_file="$script_dir/../.vercel-cli-publish-integrity"
manifest="$payload_dir/manifest.json"
registry=https://registry.npmjs.org
EXCLUDE=" $(printf '%s' "${NPM_PUBLISH_EXCLUDE:-}" | tr ',' ' ') "
ONLY=" $(printf '%s' "${NPM_PUBLISH_ONLY:-}" | tr ',' ' ') "

# Validate the whole inventory before any registry mutation. Tarball filenames
# are the basenames written by the candidate packer, not workspace paths.
jq -e '
  (.sourceSha | type == "string" and test("^[a-f0-9]{40}$")) and
  (.packages | type == "array") and
  (all(.packages[];
    (.name | type == "string" and test("^(@[a-z0-9._-]+/)?[a-z0-9][a-z0-9._-]*$")) and
    (.version | type == "string" and test("^[0-9]+\\.[0-9]+\\.[0-9]+(-[a-zA-Z0-9.-]+)?(\\+[a-zA-Z0-9.-]+)?$")) and
    (.tarball | type == "string" and test("^[a-zA-Z0-9][a-zA-Z0-9._-]*\\.tgz$")) and
    (if .name == "vercel" then
      (.integrity | type == "string" and test("^sha512-[A-Za-z0-9+/]{86}==$"))
    else true end)
  )) and
  (([.packages[].name] | unique | length) == (.packages | length))
' "$manifest" >/dev/null || { echo "Invalid saved npm manifest" >&2; exit 1; }
source_sha=$(jq -r '.sourceSha' "$manifest")
packages=$(jq -r '.packages[] | [.name, .version, .tarball, (.integrity // "")] | @tsv' "$manifest")
if [ -z "$packages" ]; then
  echo "No publishable packages found."
  exit 0
fi
while IFS=$'\t' read -r name version tarball integrity; do
  if [ ! -f "$payload_dir/$tarball" ] || [ -L "$payload_dir/$tarball" ]; then
    echo "Missing regular saved tarball: $tarball" >&2
    exit 1
  fi
done <<< "$packages"

lookup_dir=$(mktemp -d)
trap 'rm -rf "$lookup_dir"' EXIT

# Return 0 with the version, 1 ONLY on HTTP 404, and 2 on any other failure.
# Public metadata only: no tarball downloads, checksum comparisons or npm credentials.
registry_version() {
  local name="$1" selector="$2" encoded status version
  encoded=$(jq -rn --arg name "$name" '$name | @uri')
  if ! status=$(curl --disable --silent --show-error --retry 0 --connect-timeout 15 --max-time 60 \
    --output "$lookup_dir/metadata.json" --write-out '%{http_code}' \
    "$registry/$encoded/$selector"); then
    echo "Registry lookup failed: $name@$selector" >&2
    return 2
  fi
  case "$status" in
    404) return 1 ;;
    200) ;;
    *) echo "Registry lookup failed: $name@$selector (HTTP $status)" >&2; return 2 ;;
  esac
  if ! version=$(jq -er --arg name "$name" --arg selector "$selector" '
    select(.name == $name) | .version | select(type == "string" and length > 0) |
    select($selector == "latest" or . == $selector)
  ' "$lookup_dir/metadata.json"); then
    echo "Invalid registry metadata: $name@$selector" >&2
    return 2
  fi
  printf '%s\n' "$version"
}

# SemVer precedence without installing dependencies in the publishing job.
# Build metadata is ignored; a stable version outranks its prereleases.
publish_tag() {
  node - "$1" "$2" "$source_sha" <<'NODE'
const [latest, candidate, sha] = process.argv.slice(2);
function parse(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.exec(value);
  if (!match) throw new Error(`Invalid registry/candidate version: ${value}`);
  const pre = match[4]?.split('.') || [];
  if (pre.some(id => /^0\d+$/.test(id))) throw new Error(`Invalid prerelease: ${value}`);
  return { core: match.slice(1, 4).map(BigInt), pre };
}
function compare(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i] ? 1 : -1;
  }
  if (!a.pre.length || !b.pre.length) return Number(!a.pre.length) - Number(!b.pre.length);
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn !== yn) return xn ? -1 : 1;
    return (xn ? BigInt(x) > BigInt(y) : x > y) ? 1 : -1;
  }
  return 0;
}
const target = parse(candidate);
console.log(latest && compare(parse(latest), target) > 0 ? `release-${sha}` : 'latest');
NODE
}

# Promotion and acceptance rely on vercel being the saved tarball, so an
# existing vercel version must match it. Other existing packages are skipped.
same_saved_bytes() {
  local name="$1" version="$2" expected="$3" actual
  actual=$(jq -r '.dist.integrity // ""' "$lookup_dir/metadata.json")
  if [ "$actual" = "$expected" ]; then
    return 0
  fi
  echo "$name@$version is on npm with different bytes ($actual), not the saved release tarball ($expected)" >&2
  return 1
}

published=0
skipped=0
while IFS=$'\t' read -r name version tarball integrity; do
  case "$EXCLUDE" in
    *" $name "*)
      echo "skip: $name@$version (excluded by NPM_PUBLISH_EXCLUDE)"
      skipped=$((skipped + 1)); continue ;;
  esac
  if [ -n "${ONLY// /}" ]; then
    case "$ONLY" in
      *" $name "*) ;;
      *) echo "skip: $name@$version (not in NPM_PUBLISH_ONLY)"
         skipped=$((skipped + 1)); continue ;;
    esac
  fi

  published_now=false
  if registry_version "$name" "$version" >/dev/null; then
    if [ "$name" = vercel ]; then
      same_saved_bytes "$name" "$version" "$integrity" || exit 1
      published_now=true
    fi
    echo "skip: $name@$version (already published)"
    skipped=$((skipped + 1))
  else
    status=$?
    [ "$status" -eq 1 ] || exit "$status"
    core=${version%%+*}
    if [ "$name" = vercel ] || [ "$core" != "${core%%-*}" ]; then
      tag=canary
    else
      if latest=$(registry_version "$name" latest); then
        :
      else
        status=$?
        [ "$status" -eq 1 ] || exit "$status"
        latest=''
      fi
      tag=$(publish_tag "$latest" "$version")
    fi
    echo "publishing: $name@$version (tag: $tag)"
    # npm provides OIDC trusted publishing. Never repack or retry a mutation.
    if (cd "$payload_dir" && npm publish "$payload_dir/$tarball" \
      --ignore-scripts --fetch-retries=0 --access public --registry="$registry" --tag "$tag"); then
      published=$((published + 1))
      published_now=true
    elif registry_version "$name" "$version" >/dev/null; then
      # A failed response can still land the publish; keep it only if it is ours.
      if [ "$name" = vercel ]; then
        same_saved_bytes "$name" "$version" "$integrity" || exit 1
        published_now=true
      fi
      echo "skip: $name@$version (exists after failed publish)"
      skipped=$((skipped + 1))
    else
      echo "Publish failed and exact version could not be confirmed: $name@$version" >&2
      exit 1
    fi
  fi

  # vercel on npm is now known to be the saved tarball (published here, or an
  # existing version with the same integrity), so record it for acceptance.
  if [ "$name" = vercel ]; then
    if [ "$published_now" = false ]; then
      rm -f "$integrity_file"
      continue
    fi
    printf '%s\n' "$integrity" > "$integrity_file"
    echo "Recorded vercel@$version tarball integrity: $integrity"
    if [ -n "${GITHUB_ENV:-}" ]; then
      echo "VERCEL_CLI_PUBLISH_INTEGRITY=$integrity" >> "$GITHUB_ENV"
    fi
  fi
done <<< "$packages"

echo ""
echo "Done. Published $published packages, skipped $skipped."
