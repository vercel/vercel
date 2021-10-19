import { frameworks } from '@vercel/frameworks';

export function findFramework(slug?: string | null) {
  return frameworks.find(f => f.slug === slug);
}
