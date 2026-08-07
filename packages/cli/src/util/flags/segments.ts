import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import type {
  CreateSegmentRequest,
  Segment,
  SegmentsListResponse,
  UpdateSegmentRequest,
} from './types';
import output from '../../output-manager';

function getSegmentsUrl(projectId: string, withMetadata = false): string {
  const url = `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/segments`;
  return withMetadata ? `${url}?withMetadata=true` : url;
}

function getSegmentUrl(
  projectId: string,
  segmentIdOrSlug: string,
  withMetadata = false
): string {
  const url = `${getSegmentsUrl(projectId)}/${encodeURIComponent(segmentIdOrSlug)}`;
  return withMetadata ? `${url}?withMetadata=true` : url;
}

export async function getSegments(
  client: Client,
  projectId: string,
  withMetadata = false
): Promise<Segment[]> {
  output.debug(`Fetching feature flag segments for project ${projectId}`);

  const response = await client.fetch<SegmentsListResponse>(
    getSegmentsUrl(projectId, withMetadata)
  );

  return response.data;
}

export async function getSegment(
  client: Client,
  projectId: string,
  segmentIdOrSlug: string,
  withMetadata = true
): Promise<Segment> {
  output.debug(
    `Fetching feature flag segment ${segmentIdOrSlug} for project ${projectId}`
  );

  return client.fetch<Segment>(
    getSegmentUrl(projectId, segmentIdOrSlug, withMetadata)
  );
}

export async function createSegment(
  client: Client,
  projectId: string,
  request: CreateSegmentRequest
): Promise<Segment> {
  const url = getSegmentsUrl(projectId);

  output.debug(
    `Creating feature flag segment ${request.slug} for project ${projectId}`
  );
  output.debug(`API endpoint: PUT ${url}`);

  return client.fetch<Segment>(url, {
    method: 'PUT',
    body: request as unknown as JSONObject,
  });
}

export async function updateSegment(
  client: Client,
  projectId: string,
  segmentIdOrSlug: string,
  request: UpdateSegmentRequest
): Promise<Segment> {
  const url = getSegmentUrl(projectId, segmentIdOrSlug);

  output.debug(
    `Updating feature flag segment ${segmentIdOrSlug} for project ${projectId}`
  );

  return client.fetch<Segment>(url, {
    method: 'PATCH',
    body: request as unknown as JSONObject,
  });
}

export async function deleteSegment(
  client: Client,
  projectId: string,
  segmentIdOrSlug: string
): Promise<void> {
  const url = getSegmentUrl(projectId, segmentIdOrSlug);

  output.debug(
    `Deleting feature flag segment ${segmentIdOrSlug} for project ${projectId}`
  );

  await client.fetch(url, { method: 'DELETE' });
}
