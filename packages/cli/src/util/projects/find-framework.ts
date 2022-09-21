import { frameworks } from '@vercel/frameworks';
import type { Framework } from '@vercel/frameworks';

export function findFramework(slug?: string | null) {
  return (frameworks as any as Framework[]).find((f) => f.slug === slug);
}
