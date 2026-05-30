import chalk from 'chalk';
import type { Resource } from './types';

export type ClaimStatusJson = 'sandbox' | 'claimed' | 'na';

export interface ClaimStatusDisplay {
  label: string;
  color: (text: string) => string;
  jsonValue: ClaimStatusJson;
}

export function getClaimStatus(resource: Resource): ClaimStatusDisplay {
  switch (resource.ownership) {
    case 'sandbox':
      return {
        label: 'Sandbox',
        color: chalk.yellow,
        jsonValue: 'sandbox',
      };
    case 'linked':
      return {
        label: 'Claimed',
        color: chalk.green,
        jsonValue: 'claimed',
      };
    default:
      return {
        label: '–',
        color: chalk.gray,
        jsonValue: 'na',
      };
  }
}

export function isSandboxResource(resource: Resource): boolean {
  return resource.ownership === 'sandbox';
}
