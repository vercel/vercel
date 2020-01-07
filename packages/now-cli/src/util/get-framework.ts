import fetch from './fetch';
import { Framework } from '@now/frameworks';

let frameworks: Framework[] | null = null;

export async function getFramework(slug: string) {
  if (!frameworks) {
    const res = await fetch('https://zeit.co/frameworks-api');
    frameworks = await res.json();
  }

  return (frameworks || []).find(f => f.slug === slug);
}
