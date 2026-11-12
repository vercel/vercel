import {
  createWriteBuildResult,
  findDirs,
  isLambda,
  OUTPUT_DIR,
  type PathOverride,
} from '@vercel-internals/builder-orchestration/write-build-result';
import output from '../output-manager';

export { findDirs, isLambda, OUTPUT_DIR, type PathOverride };
export const {
  filesWithoutFsRefs,
  relocateRootBuildOutputToService,
  writeBuildResult,
} = createWriteBuildResult(output);
