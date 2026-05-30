import type { Resource } from './types';

export function isSandboxResource(resource: Resource): boolean {
  return resource.ownership === 'sandbox';
}
