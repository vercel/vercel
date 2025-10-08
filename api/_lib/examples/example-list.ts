import Frameworks, { Framework } from '../../../packages/frameworks';

interface Example {
  example: string;
  path: string;
  demo: string;
  description: string;
  tagline: string;
  framework: string;
}

export async function getExampleList(): Promise<Example[]> {
  return (Frameworks as Framework[])
    .filter(f => f.demo)
    .map(framework => {
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
