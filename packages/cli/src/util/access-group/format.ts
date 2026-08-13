import chalk from 'chalk';
import ms from 'ms';
import table from '../output/table';
import { formatDateWithoutTime } from '../format-date';
import type { AccessGroup } from './types';

function age(createdAt: string): string {
  const created = Number(createdAt);
  if (!Number.isFinite(created) || created <= 0) {
    return chalk.gray('—');
  }
  return chalk.gray(ms(Date.now() - created));
}

function list(values: string[] | undefined): string {
  return values && values.length > 0 ? values.join(', ') : '—';
}

export function formatAccessGroupsTable(accessGroups: AccessGroup[]): string {
  return `${table(
    [
      ['id', 'name', 'members', 'projects', 'age'].map(header =>
        chalk.dim(header)
      ),
      ...accessGroups.map(accessGroup => [
        accessGroup.accessGroupId,
        accessGroup.name,
        String(accessGroup.membersCount ?? 0),
        String(accessGroup.projectsCount ?? 0),
        age(accessGroup.createdAt),
      ]),
    ],
    { align: ['l', 'l', 'r', 'r', 'r'], hsep: 2 }
  ).replace(/^(.*)/gm, '  $1')}\n`;
}

export function formatAccessGroupDetails(accessGroup: AccessGroup): string {
  const rows: string[][] = [
    ['Name', accessGroup.name],
    ['ID', accessGroup.accessGroupId],
    ['Members', String(accessGroup.membersCount ?? 0)],
    ['Projects', String(accessGroup.projectsCount ?? 0)],
    ['Team roles', list(accessGroup.teamRoles)],
    ['Team permissions', list(accessGroup.teamPermissions)],
  ];

  if (accessGroup.entitlements && accessGroup.entitlements.length > 0) {
    rows.push(['Entitlements', accessGroup.entitlements.join(', ')]);
  }

  if (accessGroup.isDsyncManaged) {
    rows.push(['Directory synced', 'yes']);
  }

  rows.push(['Created', formatDateWithoutTime(Number(accessGroup.createdAt))]);
  rows.push(['Updated', formatDateWithoutTime(Number(accessGroup.updatedAt))]);

  return `${table(rows, { align: ['l', 'l'], hsep: 2 }).replace(/^(.*)/gm, '  $1')}\n`;
}
