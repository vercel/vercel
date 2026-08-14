import { isPythonFramework, type Builder } from '@vercel/build-utils';
import type { Rewrite } from '@vercel/routing-utils';

export const BACKEND_REWRITE_BEHAVIOR_WARNING =
  'Internal rewrites in backend framework projects now route requests using the rewritten destination path. This behavior was previously unsupported and may change which application route handles a request. Review your rewrite configuration to ensure this behavior is expected.';

function hasInternalPathRewrite(rewrites: Rewrite[] | undefined): boolean {
  return (
    rewrites?.some(
      rewrite =>
        typeof rewrite.destination === 'string' &&
        rewrite.destination.startsWith('/')
    ) ?? false
  );
}

export function hasBackendRewriteBehaviorChange({
  projectRewrites,
  builders,
}: {
  projectRewrites?: Rewrite[];
  builders?: Builder[] | null;
}): boolean {
  return (
    hasInternalPathRewrite(projectRewrites) &&
    (builders ?? []).some(builder =>
      isPythonFramework(builder.config?.framework)
    )
  );
}
