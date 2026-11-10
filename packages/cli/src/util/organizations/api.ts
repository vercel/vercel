import { z } from 'zod';
import type Client from '../client';
import type { FetchOptions } from '../client';
import { OrganizationResponseError } from './errors';

// These schemas mirror the response DTOs in `api-organizations`
// (`services/api-organizations/src/endpoint/dto.ts`). `name`, `billingPlan`
// and `cursor` are optional there because records created before those
// attributes existed have no stored value. Every other field is guaranteed.
// The schemas are loose: JSON output passes other API fields through unchanged,
// as the CLI design system requires.
const organizationSchema = z.looseObject({
  organizationId: z.string(),
  slug: z.string(),
  name: z.string().optional(),
  teamId: z.string(),
  teamCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const teamSchema = z.looseObject({
  organizationId: z.string(),
  teamId: z.string(),
  // Open strings, not enums: the platform can add an SSO mode or a billing
  // profile after a CLI version ships. Both fields only print, so an unknown
  // value must render instead of failing every team command.
  ssoMode: z.string(),
  billingPlan: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const teamsSchema = z.object({
  teams: z.array(
    teamSchema.extend({
      slug: z.string(),
      name: z.string().nullable(),
      avatar: z.string().nullable(),
    })
  ),
  cursor: z.string().nullable().optional(),
});

export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationTeam = z.infer<typeof teamSchema>;
export type OrganizationTeamListItem = z.infer<
  typeof teamsSchema
>['teams'][number];

async function request<T>(
  client: Client,
  path: string,
  schema: z.ZodType<T>,
  options: FetchOptions = {}
): Promise<T> {
  // Organization targets must not inherit the CLI's unrelated active team.
  const fetchOptions: FetchOptions = { ...options, useCurrentTeam: false };

  // A mutation has no idempotency key, so a retry could repeat it.
  if (options.method && options.method !== 'GET') {
    fetchOptions.retry = { retries: 0 };
    fetchOptions.bailOn429 = true;
  }

  const data = await client.fetch<unknown>(
    `/v1/organizations${path}`,
    fetchOptions
  );
  const result = schema.safeParse(data);
  if (!result.success) {
    const paths = [
      ...new Set(
        result.error.issues.map(issue =>
          issue.path.length ? issue.path.join('.') : '<root>'
        )
      ),
    ].slice(0, 5);
    throw new OrganizationResponseError(
      `The Organizations API returned an invalid response at ${paths.join(', ')}.`
    );
  }
  return result.data;
}

export function listOrganizations(client: Client) {
  return request(
    client,
    '',
    z.object({ organizations: z.array(organizationSchema) })
  );
}

export function getOrganization(client: Client, id: string) {
  return request(client, `/${encodeURIComponent(id)}`, organizationSchema);
}

export function createOrganization(
  client: Client,
  rootTeamId: string,
  body: { slug: string; name?: string }
) {
  const query = new URLSearchParams({ teamId: rootTeamId });
  return request(client, `?${query}`, organizationSchema, {
    method: 'POST',
    body,
  });
}

export function updateOrganization(client: Client, id: string, slug: string) {
  return request(client, `/${encodeURIComponent(id)}`, organizationSchema, {
    method: 'PATCH',
    body: { slug },
  });
}

export function listOrganizationTeams(
  client: Client,
  id: string,
  cursor?: string
) {
  const query =
    cursor === undefined ? '' : `?${new URLSearchParams({ cursor })}`;
  return request(
    client,
    `/${encodeURIComponent(id)}/teams${query}`,
    teamsSchema
  );
}

type TeamInput = { billingPlan?: 'platform' | 'enterprise' } & (
  | { mode: 'create'; slug: string; name: string }
  | { mode: 'link'; teamId: string; slug?: never }
  | { mode: 'link'; slug: string; teamId?: never }
);

export function addOrganizationTeam(
  client: Client,
  id: string,
  body: TeamInput
) {
  return request(client, `/${encodeURIComponent(id)}/teams`, teamSchema, {
    method: 'POST',
    body,
  });
}
