import { envKey } from './resolve';

/**
 * The Marketplace builds every Aurora DSQL endpoint as
 * `<cluster-id>.dsql.<region>.on.aws` — or `provisioning.dsql.<region>.on.aws`
 * when cluster creation returned no id.
 */
const DSQL_HOST = /\.dsql\.[a-z0-9-]+\.on\.aws$/;
const DSQL_PROVISIONING_HOST = /^provisioning\.dsql\./;

/**
 * Aurora PostgreSQL endpoints are AWS-assigned hostnames under
 * `rds.amazonaws.com` (`rds.amazonaws.com.cn` in China). The Marketplace
 * injects `provisioning` until the cluster is ready.
 */
const RDS_HOST = /\.rds\.amazonaws\.com(\.cn)?$/;

/**
 * Classifies the Postgres resource linked under `prefix` by its `PGHOST`.
 *
 * Aurora DSQL and Aurora PostgreSQL inject the same env var names, and so do
 * non-AWS Postgres integrations (e.g. Neon's unprefixed `PGHOST`), so the host
 * is the only thing that tells them apart. Returns `undefined` for any host
 * that is neither.
 */
export function pgHostKind(prefix: string): 'dsql' | 'rds' | undefined {
  const host = process.env[envKey(prefix, 'PGHOST')] ?? '';
  if (DSQL_HOST.test(host)) return 'dsql';
  if (RDS_HOST.test(host) || host === 'provisioning') return 'rds';
  return undefined;
}

/** Whether `host` is the placeholder for a DSQL cluster with no id yet. */
export function isProvisioningDsqlHost(host: string): boolean {
  return DSQL_PROVISIONING_HOST.test(host);
}
