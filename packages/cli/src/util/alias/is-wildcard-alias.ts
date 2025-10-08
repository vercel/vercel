export default function isWildcardAlias(alias: string) {
  return alias.startsWith('*.');
}
