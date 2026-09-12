export const CUSTOM_ENVIRONMENTS_PER_PACK = 5;

/** Example pack count used in help text and error messages. */
export const CUSTOM_ENVIRONMENT_EXAMPLE_PACK_COUNT = 2;

const CUSTOM_ENVIRONMENT_ADDON_ALIASES = new Set([
  'customenvironment',
  'custom-environment',
  'custom-environments',
  'custom_environment',
  'custom_environments',
]);

export function isCustomEnvironmentAddonAlias(name: string): boolean {
  return CUSTOM_ENVIRONMENT_ADDON_ALIASES.has(name.toLowerCase());
}

export function customEnvironmentPackEnvironments(packs: number): number {
  return packs * CUSTOM_ENVIRONMENTS_PER_PACK;
}
