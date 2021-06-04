export default function getSafeAlias(alias: string): string {
  return alias
    .replace(/^https:\/\//i, '')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .toLowerCase();
}
