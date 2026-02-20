import { revalidateTag } from 'next/cache';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const tag = searchParams.get('tag');

  if (!tag) {
    return Response.json({ revalidated: false }, { status: 400 });
  }

  revalidateTag(tag);
  return Response.json({ revalidated: true, tag });
}
