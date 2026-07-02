/**
 * Full diagnostic payload produced during CLI resolution.
 */
export interface ResolutionDiagnostics {
  localBinSearch: LocalBinSearchDiagnostics;
  skippedLocalBins: SkippedLocalBin[];
}

/**
 * Diagnostics from walking ancestor `node_modules/.bin` directories.
 */
export interface LocalBinSearchDiagnostics {
  searchRoot: string;
  stoppedAt: string;
  stopReason: 'project-root-marker' | 'filesystem-root';
  markerPath?: string;
  skippedNodeModules: SkippedNodeModules[];
}

/**
 * A skipped `node_modules` directory and the reason it was rejected.
 */
export interface SkippedNodeModules {
  directory: string;
  reason: string;
}

/**
 * A skipped local bin candidate and the reason it was rejected.
 */
export interface SkippedLocalBin {
  candidate: string;
  reason: string;
}
