import npa from 'npm-package-arg';

function isManagedSpec(spec: string, managedNames: ReadonlySet<string>) {
  const parsed = npa(spec);
  return (
    !!parsed.name &&
    managedNames.has(parsed.name) &&
    parsed.type === 'tag' &&
    (parsed.rawSpec === '' || parsed.rawSpec === 'latest')
  );
}

export function partitionBuilderSpecs(
  specs: ReadonlySet<string>,
  managedNames: ReadonlySet<string>
) {
  const managed = new Map<string, string>();
  const legacy = new Set<string>();

  for (const spec of specs) {
    if (isManagedSpec(spec, managedNames)) {
      managed.set(spec, npa(spec).name!);
    } else {
      legacy.add(spec);
    }
  }
  return { managed, legacy };
}
