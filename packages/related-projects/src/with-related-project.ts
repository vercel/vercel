import { relatedProjects } from './related-projects';

export function withRelatedProject({
  projectName,
  defaultHost,
}: {
  projectName: string;
  defaultHost: string;
}): string {
  const vercelEnv = process.env.VERCEL_ENV;
  const projects = relatedProjects({ noThrow: true });
  if (projects.length > 0) {
    const project = projects.find(p => p.project.name === projectName);
    if (!project) {
      return defaultHost;
    }
    if (vercelEnv === 'preview' && project.preview.branch) {
      return `https://${project.preview.branch}`;
    }
    if (vercelEnv === 'production') {
      if (project.production.alias) {
        return `https://${project.production.alias}`;
      }

      if (project.production.url) {
        return `https://${project.production.url}`;
      }
    }
    return defaultHost;
  }

  return defaultHost;
}
