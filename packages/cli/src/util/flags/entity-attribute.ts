export function parseEntityAttributeSelector(input: string): {
  kind: string;
  attribute: string;
} {
  const trimmed = input.trim();
  const separatorIndex = trimmed.indexOf('.');
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    throw new Error(
      `Invalid entity attribute "${input}". Use ENTITY.ATTRIBUTE, for example user.signupAt.`
    );
  }

  return {
    kind: trimmed.slice(0, separatorIndex),
    attribute: trimmed.slice(separatorIndex + 1),
  };
}
