import frameworks, { Framework } from '@vercel/frameworks';

interface Example {
  example: string;
  path: string;
  demo: string;
  description: string;
  tagline: string;
  framework: string;
}

export function getExampleList(): Example[] {
  return (frameworks as Framework[])
    .filter(f => f.demo)
    .map(framework => {
      if (!framework.tagline || !framework.demo || !framework.slug) {
        throw new Error(
          `Malformed framework: ${framework.name || framework.slug}`
        );
      }
      return {
        example: framework.name,
        path: `/${framework.slug}`,
        demo: framework.demo,
        description: framework.description,
        tagline: framework.tagline,
        framework: framework.slug,
      };
    });
}
