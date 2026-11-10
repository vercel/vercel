import { frameworkList, type Framework } from '@vercel/frameworks';

export type DeploymentFramework = Pick<Framework, 'name' | 'slug'>;

function toDeploymentFramework(framework: Framework): DeploymentFramework {
  return {
    name: framework.name,
    slug: framework.slug,
  };
}

export function resolveDeploymentFrameworkPreset({
  localFramework,
  projectFramework,
}: {
  localFramework?: string | null;
  projectFramework?: string | null;
}): DeploymentFramework {
  const frameworkSlug =
    typeof localFramework === 'undefined' ? projectFramework : localFramework;
  const frameworkPreset = frameworkList.find(
    framework => framework.slug === frameworkSlug
  );
  const otherPreset = frameworkList.find(framework => framework.slug === null);

  return frameworkPreset
    ? toDeploymentFramework(frameworkPreset)
    : otherPreset
      ? toDeploymentFramework(otherPreset)
      : { name: 'Other', slug: null };
}
