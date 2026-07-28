import fs from 'fs';
import { join } from 'path';
import type { PythonPackage } from '@vercel/python-analysis';

export const PROXY_ADAPTER_FILENAME = 'vc__proxy__python.py';
export const PROXY_DEPENDENCY_GROUP = 'proxy';

const proxyAdapterPath = join(__dirname, '..', 'templates', 'vc_proxy.py');
const proxyAdapterSource = fs.readFileSync(proxyAdapterPath, 'utf8');

export function getProxyAdapterSource(): string {
  return proxyAdapterSource;
}

export function hasProxyDependencyGroup(pythonPackage: PythonPackage): boolean {
  const dependencyGroups = pythonPackage.manifest?.data?.['dependency-groups'];
  return (
    dependencyGroups !== undefined &&
    Object.prototype.hasOwnProperty.call(
      dependencyGroups,
      PROXY_DEPENDENCY_GROUP
    )
  );
}
