import chance from 'chance';
import { client } from './client';
import type {
  Issuer,
  ProjectGrantPolicy,
  SigningKey,
} from '../../src/util/kms/types';
import { PROJECT_GRANT_POLICY_KIND } from '../../src/util/kms/types';

const ISSUERS_PATH = '/v1/kms/issuers';

export function createSigningKey(
  overrides: Partial<SigningKey> = {}
): SigningKey {
  const now = new Date().toISOString();
  return {
    keyId: `key_${chance().string({ length: 12, alpha: true, numeric: true })}`,
    issuerId: 'iss_1a2b3c4d',
    algorithm: 'RS256',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function createProjectGrant(
  overrides: Partial<ProjectGrantPolicy> = {}
): ProjectGrantPolicy {
  const now = new Date().toISOString();
  return {
    kind: PROJECT_GRANT_POLICY_KIND,
    teamId: 'team_dummy',
    projectId: 'prj_9i8h7g6f',
    environments: ['production'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function createIssuer(
  id?: string,
  overrides: Partial<Issuer> = {}
): Issuer {
  const issuerId =
    id || `iss_${chance().string({ length: 12, alpha: true, numeric: true })}`;
  const now = new Date().toISOString();
  return {
    id: issuerId,
    ownerId: 'team_dummy',
    name: `issuer-${issuerId}`,
    algorithm: 'RS256',
    origin: 'vercel',
    createdAt: now,
    updatedAt: now,
    signingKeys: [createSigningKey({ issuerId })],
    policies: [],
    ...overrides,
  };
}

export function useIssuers(count = 3, next: string | null = null) {
  const issuers = Array.from({ length: count }, (_, i) =>
    createIssuer(`iss_${i}`)
  );

  client.scenario.get(ISSUERS_PATH, (_req, res) => {
    res.json({ issuers, pagination: { count: issuers.length, next } });
  });

  return issuers;
}

export function useIssuer(id: string, overrides: Partial<Issuer> = {}) {
  const issuer = createIssuer(id, overrides);

  client.scenario.get(
    `${ISSUERS_PATH}/${encodeURIComponent(id)}`,
    (_req, res) => {
      res.json(issuer);
    }
  );

  return issuer;
}

export function useCreateIssuer() {
  client.scenario.post(ISSUERS_PATH, (req, res) => {
    const { name, algorithm, claimsSchema, importKey, importKeyId } = req.body;
    const issuer = createIssuer(undefined, {
      name,
      ...(algorithm && { algorithm }),
      ...(claimsSchema && { claimsSchema }),
      ...(importKey && { origin: 'external' }),
    });
    res.json({
      ...issuer,
      signingKeys: issuer.signingKeys.map(key => ({
        ...key,
        ...(importKeyId && { importKeyId }),
      })),
    });
  });
}

export function useUpdateIssuer(id: string, overrides: Partial<Issuer> = {}) {
  client.scenario.patch(
    `${ISSUERS_PATH}/${encodeURIComponent(id)}`,
    (req, res) => {
      const { name, claimsSchema } = req.body;
      res.json(
        createIssuer(id, {
          ...overrides,
          ...(name && { name }),
          ...(claimsSchema ? { claimsSchema } : { claimsSchema: undefined }),
        })
      );
    }
  );
}

export function useDeleteIssuer(id: string) {
  client.scenario.delete(
    `${ISSUERS_PATH}/${encodeURIComponent(id)}`,
    (_req, res) => {
      res.status(204).end();
    }
  );
}

export function useCreateSigningKey(
  issuerId: string,
  overrides: Partial<SigningKey> = {}
) {
  client.scenario.post(
    `${ISSUERS_PATH}/${encodeURIComponent(issuerId)}/keys`,
    (req, res) => {
      const { importKeyId } = req.body;
      res.json(
        createSigningKey({
          issuerId,
          ...(importKeyId && { importKeyId }),
          ...overrides,
        })
      );
    }
  );
}

export function useActivateSigningKey(issuerId: string, keyId: string) {
  client.scenario.post(
    `${ISSUERS_PATH}/${encodeURIComponent(issuerId)}/keys/${encodeURIComponent(
      keyId
    )}/activate`,
    (_req, res) => {
      res.json(createSigningKey({ issuerId, keyId, status: 'active' }));
    }
  );
}

/** Immediate revocation returns the issuer, not the key. */
export function useRevokeSigningKey(issuerId: string, keyId: string) {
  client.scenario.post(
    `${ISSUERS_PATH}/${encodeURIComponent(issuerId)}/keys/${encodeURIComponent(
      keyId
    )}/revoke`,
    (_req, res) => {
      res.json(
        createIssuer(issuerId, {
          signingKeys: [createSigningKey({ issuerId, keyId: `${keyId}-next` })],
        })
      );
    }
  );
}

export function useCreateProjectGrant(issuerId: string) {
  client.scenario.post(
    `${ISSUERS_PATH}/${encodeURIComponent(issuerId)}/policies`,
    (req, res) => {
      const { projectId, environments, tokenClaims } = req.body;
      res.json(
        createProjectGrant({
          projectId,
          environments,
          ...(tokenClaims && { tokenClaims }),
        })
      );
    }
  );
}

export function useUpdateProjectGrant(issuerId: string, projectId: string) {
  client.scenario.patch(
    `${ISSUERS_PATH}/${encodeURIComponent(
      issuerId
    )}/policies/${PROJECT_GRANT_POLICY_KIND}/${encodeURIComponent(projectId)}`,
    (req, res) => {
      const { environments, tokenClaims } = req.body;
      res.json(
        createProjectGrant({
          projectId,
          ...(environments && { environments }),
          ...(tokenClaims && { tokenClaims }),
        })
      );
    }
  );
}

export function useDeleteProjectGrant(issuerId: string, projectId: string) {
  client.scenario.delete(
    `${ISSUERS_PATH}/${encodeURIComponent(
      issuerId
    )}/policies/${PROJECT_GRANT_POLICY_KIND}/${encodeURIComponent(projectId)}`,
    (_req, res) => {
      res.status(204).end();
    }
  );
}

type ErrorRoute = {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
};

/** Responds to a single KMS route with an API error payload. */
export function useKmsError(
  { method, path }: ErrorRoute,
  status: number,
  code: string,
  message: string
) {
  client.scenario[method](path, (_req, res) => {
    res.status(status).json({ error: { code, message } });
  });
}

export function useIssuerNotFound(id: string) {
  useKmsError(
    { method: 'get', path: `${ISSUERS_PATH}/${encodeURIComponent(id)}` },
    404,
    'not_found',
    'Issuer not found'
  );
}

export function useIssuerForbidden(id: string) {
  useKmsError(
    { method: 'delete', path: `${ISSUERS_PATH}/${encodeURIComponent(id)}` },
    403,
    'forbidden',
    'Not authorized'
  );
}

/** The 403 the API returns when another service provisioned the issuer. */
export function useManagedIssuerRejection(id: string) {
  useKmsError(
    { method: 'patch', path: `${ISSUERS_PATH}/${encodeURIComponent(id)}` },
    403,
    'issuer_managed_by_mismatch',
    'Issuer is managed by another service'
  );
}
