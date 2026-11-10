export interface PostureSample {
  id: string;
  label: string;
  samples?: PostureSample[];
}

export interface PostureItem {
  violationsCount: number;
  samples: PostureSample[];
  mutedCount?: number;
  computedAt?: number;
  truncated?: boolean;
  unavailable?: boolean;
  unavailableReason?: string;
}

export interface SecurityPostureMute {
  facet: string;
  entityId?: string;
  labelSnapshot?: { label: string; groupLabel?: string };
}

export interface SecurityDashboardResponse {
  report: Record<string, PostureItem | undefined>;
  mutes?: SecurityPostureMute[];
}

export interface SecurityFinding {
  id: string;
  label: string;
  groupLabel?: string;
  muted?: boolean;
}

export interface SecurityFindingsResponse {
  findings: SecurityFinding[];
  cursor: string | null;
}
