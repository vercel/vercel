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
