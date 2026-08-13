export interface PostureSample {
  id: string;
  label: string;
  samples?: PostureSample[];
}

export interface PostureItem {
  violationsCount: number;
  samples: PostureSample[];
  mutedCount?: number;
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
