function encodeComma(tag: string): string {
  return tag.replaceAll(',', '%2C');
}

export function encodeTags(tags: string[]): string[] {
  return tags.map(encodeComma);
}

export function encodeTag(tag: string | string[]): string | string[] {
  return Array.isArray(tag) ? encodeTags(tag) : encodeComma(tag);
}
