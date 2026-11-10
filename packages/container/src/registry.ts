import type { Span } from '@vercel/build-utils';
import type { BuildPushParams } from './engines/types';
import { DIGEST_RE, VCR_REGISTRY } from './engines/types';
import type { OidcClaims } from './oidc';
import {
  debugTokenClaims,
  decodeOidcClaims,
  resolveOidcTokenForBuild,
  tokenFingerprint,
} from './oidc';
import { debug, delay, done, readString, step, toTag, withSpan } from './util';

interface RegistryTarget {
  token: string;
  claims: OidcClaims;
  username: string;
  fullRepository: string;
  imageRef: string;
}

export async function resolveRegistryTarget(params: {
  repository: string;
  tag: string;
  span?: Span;
}): Promise<RegistryTarget> {
  const token = await withSpan(params.span, 'container.mint_oidc', {}, s =>
    resolveOidcTokenForBuild(s)
  );
  const claims = decodeOidcClaims(token);
  debug(`registry token: ${tokenFingerprint(token)}`);
  debugTokenClaims('OIDC token claims', token);

  const username = claims.owner_id;
  if (!username) {
    throw new Error(
      'VERCEL_OIDC_TOKEN is missing the `owner_id` (team id) claim required to ' +
        'authenticate to the container registry.'
    );
  }

  const fullRepository = [claims.owner, claims.project, params.repository].join(
    '/'
  );
  return {
    token,
    claims,
    username,
    fullRepository,
    imageRef: `${VCR_REGISTRY}/${fullRepository}:${params.tag}`,
  };
}

type PushedImage = Pick<
  BuildPushParams,
  'imageRef' | 'registry' | 'username' | 'token'
>;

const MANIFEST_MEDIA_TYPES = [
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
].join(', ');

const MANIFEST_LOOKUP_ATTEMPTS = 3;
const MANIFEST_LOOKUP_TIMEOUT_MS = 10_000;

/**
 * Ask the registry for the digest of a just-pushed tag. The local image store
 * is not a substitute: Podman, for one, recompresses layers on push, so the
 * uploaded manifest's digest differs from `RepoDigests`.
 */
export async function resolvePushedImageDigest(
  params: PushedImage
): Promise<string> {
  const fail = (reason: string) =>
    new Error(
      `Image ${params.imageRef} was pushed, but its registry digest could not be resolved: ${reason}`
    );

  const ref = parseTaggedImageRef(params.imageRef, params.registry);
  if (!ref) {
    throw fail('Expected a tagged image reference in the push registry.');
  }
  const url = `https://${params.registry}/v2/${ref.repository}/manifests/${encodeURIComponent(ref.tag)}`;
  const authorization = `Basic ${Buffer.from(
    `${params.username}:${params.token}`
  ).toString('base64')}`;
  let failure = 'Registry request failed.';

  for (let attempt = 1; attempt <= MANIFEST_LOOKUP_ATTEMPTS; attempt++) {
    debug(
      `manifest lookup (${attempt}/${MANIFEST_LOOKUP_ATTEMPTS}): HEAD ${url}`
    );
    let response: Response | undefined;
    try {
      response = await fetch(url, {
        method: 'HEAD',
        headers: { authorization, accept: MANIFEST_MEDIA_TYPES },
        redirect: 'manual',
        signal: AbortSignal.timeout(MANIFEST_LOOKUP_TIMEOUT_MS),
      });
    } catch (err) {
      failure = `Registry request failed: ${describeFetchError(err)}`;
    }

    if (response?.ok) {
      const digest = response.headers.get('docker-content-digest');
      if (!digest || !DIGEST_RE.test(digest)) {
        throw fail('Registry returned a missing or invalid manifest digest.');
      }
      return digest;
    }

    if (response) {
      failure = `Registry returned HTTP ${response.status}.`;
      const retryable =
        response.status === 404 ||
        response.status === 429 ||
        response.status >= 500;
      if (!retryable) {
        throw fail(failure);
      }
    }

    debug(`manifest lookup failed: ${failure}`);
    if (attempt < MANIFEST_LOOKUP_ATTEMPTS) {
      await delay(500 * 2 ** (attempt - 1));
    }
  }

  throw fail(failure);
}

/** Split `<registry>/<repository>:<tag>`; undefined for anything else. */
function parseTaggedImageRef(
  imageRef: string,
  registry: string
): { repository: string; tag: string } | undefined {
  const prefix = `${registry}/`;
  if (!imageRef.startsWith(prefix)) {
    return undefined;
  }
  const imagePath = imageRef.slice(prefix.length);
  const tagSeparator = imagePath.lastIndexOf(':');
  if (
    tagSeparator <= imagePath.lastIndexOf('/') ||
    tagSeparator === imagePath.length - 1
  ) {
    return undefined;
  }
  return {
    repository: imagePath.slice(0, tagSeparator),
    tag: imagePath.slice(tagSeparator + 1),
  };
}

function describeFetchError(err: unknown): string {
  const error = err as Error & { cause?: { message?: string } };
  const cause = error.cause?.message;
  return cause ? `${error.message} (${cause})` : error.message;
}

/**
 * Ensure the target VCR repository exists before pushing.
 */
export async function ensureRepository(
  repository: string,
  token: string,
  claims: OidcClaims,
  span?: Span
): Promise<void> {
  if (repository.includes('/')) {
    debug(`skipping repository auto-create (fully-qualified "${repository}")`);
    span?.setAttributes({ 'repository.create_result': 'skipped_qualified' });
    return;
  }

  const teamId = claims.owner_id;
  const projectId = claims.project_id;
  if (!teamId || !projectId) {
    debug(
      `skipping repository auto-create (missing ${
        !teamId ? 'team id' : 'project id'
      })`
    );
    span?.setAttributes({
      'repository.create_result': 'skipped_missing_ids',
    });
    return;
  }

  span?.setAttributes({ 'team.id': teamId, 'project.id': projectId });

  const apiUrl = (
    readString(process.env.VERCEL_API_URL) ?? 'https://api.vercel.com'
  ).replace(/\/+$/, '');
  const url = `${apiUrl}/v1/vcr/repository?teamId=${encodeURIComponent(teamId)}`;
  const body = JSON.stringify({ name: repository, projectId });

  step(`Ensuring registry repository "${repository}"`);
  debug(`repository create: POST ${url}`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body,
    });
    span?.setAttributes({ 'repository.create_status': toTag(res.status) });
    if (res.ok) {
      span?.setAttributes({ 'repository.create_result': 'created' });
      done(`created repository "${repository}"`);
    } else if (res.status === 409) {
      span?.setAttributes({ 'repository.create_result': 'already_exists' });
      done(`repository "${repository}" already exists`);
    } else {
      span?.setAttributes({ 'repository.create_result': 'unexpected_status' });
      done('continuing — push will validate the repository');
    }
  } catch (err) {
    debug(`repository auto-create failed: ${(err as Error).message}`);
    span?.setAttributes({ 'repository.create_result': 'error' });
    done('continuing — push will validate the repository');
  }
}
