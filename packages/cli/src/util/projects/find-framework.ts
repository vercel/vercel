import { Framework } from '@vercel/frameworks';
import frameworks from './frameworks.json';

export function findFramework(slug?: string | null): Framework | undefined {
  return (frameworks as Framework[]).find(f => f.slug === slug);
}
