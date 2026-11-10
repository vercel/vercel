import chalk from 'chalk';
import ms from 'ms';
import formatTable from '../format-table';
import { printAlignedLabel } from '../output/print-aligned-label';
import type { Issuer, IssuerPolicy, SigningKey } from './types';
import { isProjectGrant } from './types';

/** Relative age of an ISO timestamp, e.g. `3m`. */
export function relativeAge(isoDate: string): string {
  const elapsed = Date.now() - new Date(isoDate).getTime();
  return elapsed > 0 ? `${ms(elapsed)} ago` : ms(-elapsed);
}

/** The active key is what KMS signs with; everything else is context. */
export function activeSigningKey(issuer: Issuer): SigningKey | undefined {
  return issuer.signingKeys.find(key => key.status === 'active');
}

/**
 * Key status plus the schedule that explains it, since `pending` and
 * `revoking` are only actionable alongside their timestamps.
 */
export function describeKeyStatus(key: SigningKey): string {
  if (key.status === 'pending') {
    return key.activateAt
      ? `pending · activates in ${ms(Math.max(0, new Date(key.activateAt).getTime() - Date.now()))}`
      : 'pending · activate manually';
  }
  if (key.status === 'revoking') {
    return key.revokeAt
      ? `revoking · revoked in ${ms(Math.max(0, new Date(key.revokeAt).getTime() - Date.now()))}`
      : 'revoking';
  }
  return 'active';
}

export function formatIssuersTable(issuers: Issuer[]): string {
  const rows = issuers.map(issuer => {
    const active = activeSigningKey(issuer);
    return [
      issuer.id,
      issuer.name,
      issuer.algorithm,
      active ? active.keyId : chalk.gray('none'),
      chalk.gray(relativeAge(issuer.createdAt)),
    ];
  });

  return formatTable(
    ['ID', 'Name', 'Algorithm', 'Active Key', 'Age'],
    ['l', 'l', 'l', 'l', 'l'],
    [{ rows }]
  );
}

export function formatSigningKeysTable(keys: SigningKey[]): string {
  const rows = keys.map(key => [
    key.keyId,
    key.algorithm,
    describeKeyStatus(key),
    key.importKeyId ?? chalk.gray('-'),
    chalk.gray(relativeAge(key.createdAt)),
  ]);

  return formatTable(
    ['Key ID', 'Algorithm', 'Status', 'JWKS kid', 'Age'],
    ['l', 'l', 'l', 'l', 'l'],
    [{ rows }]
  );
}

export function formatGrantsTable(policies: IssuerPolicy[]): string {
  const rows = policies.map(policy =>
    isProjectGrant(policy)
      ? [
          policy.kind,
          policy.projectId,
          policy.environments.join(', '),
          policy.tokenClaims ? 'yes' : chalk.gray('no'),
        ]
      : [
          policy.kind,
          policy.clientId,
          chalk.gray('-'),
          policy.tokenClaims ? 'yes' : chalk.gray('no'),
        ]
  );

  return formatTable(
    ['Kind', 'Target', 'Environments', 'Token Claims'],
    ['l', 'l', 'l', 'l'],
    [{ rows }]
  );
}

/** Indents a table one space so it sits inside the two-space body gutter. */
export function indentTable(table: string): string {
  return table.replace(/^(.*)/gm, ' $1');
}

/**
 * Durable identity of an issuer, printed after a mutation and at the top of
 * `inspect`. `gutterLabel` carries the completed phase (e.g. `Created`).
 */
export function printIssuerRows(
  issuer: Issuer,
  gutterLabel?: { label: string; gutter: string }
): void {
  if (gutterLabel) {
    printAlignedLabel(gutterLabel.label, issuer.name, {
      gutter: gutterLabel.gutter,
    });
    printAlignedLabel('Issuer', issuer.id);
  } else {
    printAlignedLabel('Issuer', issuer.id);
    printAlignedLabel('Name', issuer.name);
  }
  printAlignedLabel('Algorithm', issuer.algorithm);
  printAlignedLabel('Origin', issuer.origin);
  if (issuer.managedBy) {
    printAlignedLabel('Managed By', issuer.managedBy);
  }
}

/** Signing-key identity rows shared by the key subcommands. */
export function printSigningKeyRows(
  key: SigningKey,
  gutterLabel: { label: string; gutter: string }
): void {
  printAlignedLabel(gutterLabel.label, key.keyId, {
    gutter: gutterLabel.gutter,
  });
  printAlignedLabel('Algorithm', key.algorithm);
  printAlignedLabel('Status', describeKeyStatus(key));
  if (key.importKeyId) {
    printAlignedLabel('JWKS kid', key.importKeyId);
  }
}
