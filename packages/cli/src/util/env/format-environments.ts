import title from 'title';
import { formatEnvironment } from '../target/format-environment';
import type {
  CustomEnvironment,
  ProjectEnvVariable,
  ProjectLinked,
} from '@vercel-internals/types';

export default function formatEnvironments(
  link: ProjectLinked,
  env: ProjectEnvVariable,
  customEnvironments: CustomEnvironment[]
) {
  const defaultTargets = (
    Array.isArray(env.target) ? env.target : [env.target || '']
  ).map(t => {
    return formatEnvironment(link.org.slug, link.project.name, {
      id: t,
      slug: title(t),
    });
  });
  const customTargets = env.customEnvironmentIds
    ? env.customEnvironmentIds
        .map(id => customEnvironments.find(e => e.id === id))
        .filter(Boolean)
        .map(e => formatEnvironment(link.org.slug, link.project.name, e!))
    : [];
  const targetsString = [...defaultTargets, ...customTargets].join(', ');
  return env.gitBranch ? `${targetsString} (${env.gitBranch})` : targetsString;
}
