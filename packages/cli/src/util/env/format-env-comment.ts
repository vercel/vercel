import type { ProjectEnvVariable } from '@vercel-internals/types';

const MAX_DISPLAY_LENGTH = 25;

export default function formatEnvComment(env: ProjectEnvVariable): string {
  if (env.comment === undefined) {
    return '';
  }

  if (env.comment.length > MAX_DISPLAY_LENGTH) {
    return `${env.comment.slice(0, MAX_DISPLAY_LENGTH)}...`;
  }

  return env.comment;
}
