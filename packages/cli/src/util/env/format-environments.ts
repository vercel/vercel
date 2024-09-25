import title from 'title';
import { formatEnvironment } from '../target/format-environment';
import type Client from '../client';
import type {
  CustomEnvironment,
  ProjectEnvVariable,
  ProjectLinked,
} from '@vercel-internals/types';

export default function formatEnvironments(
  client: Client,
  link: ProjectLinked,
  env: ProjectEnvVariable,
  customEnvironments: CustomEnvironment[]
) {
  const defaultTargets = (
    Array.isArray(env.target) ? env.target : [env.target || '']
  ).map(t => {
    return formatEnvironment(client, link.org.slug, link.project.name, {
      id: t,
      name: title(t),
    });
  });
  const customTargets = env.customEnvironmentIds
    ? env.customEnvironmentIds
        .map(id => customEnvironments.find(e => e.id === id))
        .filter(Boolean)
        .map(e =>
          formatEnvironment(client, link.org.slug, link.project.name, e!)
        )
    : [];
  const targetsString = [...defaultTargets, ...customTargets].join(', ');
  return env.gitBranch ? `${targetsString} (${env.gitBranch})` : targetsString;
}
