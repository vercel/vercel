import chalk from 'chalk';
import output from '../../output-manager';
import { sanitizeForTerminal } from '../../util/connex/sanitize';
import type { ConnexNetwork } from './types';

/**
 * Build the public JSON representation of a network. Fields are copied
 * explicitly (rather than passing the raw API object through) so private
 * response fields such as `teamPrincipalRoleArn` are never surfaced.
 */
export function serializeNetwork(
  network: ConnexNetwork
): Record<string, unknown> {
  return {
    id: network.id,
    name: network.name,
    status: network.status,
    region: network.region ?? null,
    awsRegion: network.awsRegion,
    cidr: network.cidr,
    awsAccountId: network.awsAccountId,
    awsAvailabilityZoneIds: network.awsAvailabilityZoneIds ?? [],
    vpcId: network.vpcId ?? null,
    egressCidrBlock: network.egressCidrBlock ?? null,
    egressIpAddresses: network.egressIpAddresses ?? [],
    hostedZones: network.hostedZones ?? null,
    peeringConnections: network.peeringConnections ?? null,
    projects: network.projects ?? null,
    createdAt: network.createdAt,
    teamId: network.teamId,
  };
}

/**
 * Print a network's full details as an aligned key/value block for `inspect`.
 * Rendered to stderr (via the output manager); team-controlled values (name)
 * are sanitized for terminal safety.
 */
export function printNetworkDetails(network: ConnexNetwork): void {
  const rows: [string, string][] = [
    ['ID', network.id],
    ['Name', sanitizeForTerminal(network.name || '') || '–'],
    ['Status', network.status],
    ['Region', network.region ?? '–'],
    ['AWS Region', network.awsRegion],
    ['CIDR', network.cidr],
    ['AWS Account', network.awsAccountId],
  ];

  if (network.awsAvailabilityZoneIds?.length) {
    rows.push([
      'Availability Zones',
      network.awsAvailabilityZoneIds.join(', '),
    ]);
  }
  if (network.vpcId) {
    rows.push(['VPC ID', network.vpcId]);
  }
  if (network.egressCidrBlock) {
    rows.push(['Egress CIDR', network.egressCidrBlock]);
  }
  if (network.egressIpAddresses?.length) {
    rows.push(['Egress IPs', network.egressIpAddresses.join(', ')]);
  }
  if (network.peeringConnections) {
    rows.push([
      'Peering Connections',
      String(network.peeringConnections.count),
    ]);
  }
  if (network.hostedZones) {
    rows.push(['Hosted Zones', String(network.hostedZones.count)]);
  }
  if (network.projects) {
    rows.push(['Projects', String(network.projects.count)]);
  }
  rows.push(['Created', new Date(network.createdAt).toISOString()]);

  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) {
    output.print(
      `${chalk.bold(chalk.cyan(label.padEnd(labelWidth)))}  ${value}\n`
    );
  }
}
