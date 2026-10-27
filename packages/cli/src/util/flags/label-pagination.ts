type LabelCursor = {
  version: 1;
  projectId: string;
  attribute: string | null;
  after: string;
};

export function parseLabelPagination(
  limit: number = 20,
  next: string | undefined,
  attribute: string | null
): { limit: number; cursor?: LabelCursor } {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error('The --limit option must be a positive integer.');
  }
  if (next === undefined) return { limit };
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(next) || next.length > 4096) throw new Error();
    const cursor = JSON.parse(Buffer.from(next, 'base64url').toString('utf8'));
    if (
      !cursor ||
      cursor.version !== 1 ||
      typeof cursor.projectId !== 'string' ||
      !cursor.projectId ||
      cursor.attribute !== attribute ||
      typeof cursor.after !== 'string'
    )
      throw new Error();
    return { limit, cursor };
  } catch {
    throw new Error(
      'Invalid or expired --next cursor for this list view. Omit --next to restart the list.'
    );
  }
}

export function paginateLabelItems<T>(
  items: T[],
  { limit, cursor }: ReturnType<typeof parseLabelPagination>,
  projectId: string,
  attribute: string | null,
  key: (item: T) => string
) {
  // Compare keys without locale rules; continue after the key even if its item was deleted.
  const remaining = items
    .filter(item => cursor === undefined || key(item) > cursor.after)
    .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const page = remaining.slice(0, limit);
  const next =
    remaining.length > page.length
      ? Buffer.from(
          JSON.stringify({
            version: 1,
            projectId,
            attribute,
            after: key(page[page.length - 1]),
          } satisfies LabelCursor)
        ).toString('base64url')
      : null;
  return { items: page, pagination: { next } };
}
