import type { Span } from '@vercel/build-utils';
import { debug, decodeOidcClaims, done, readString, step, toTag } from './util';

/**
 * Ensure the target VCR repository exists before pushing.
 */
export async function ensureRepository(
  repository: string,
  token: string,
  claims: ReturnType<typeof decodeOidcClaims>,
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
