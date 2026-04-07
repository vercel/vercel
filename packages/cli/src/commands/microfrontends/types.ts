export interface MicrofrontendsGroup {
  id: string;
  slug: string;
  name: string;
  fallbackEnvironment?: string;
}

export interface MicrofrontendsGroupResponse {
  group: MicrofrontendsGroup;
  projects: MicrofrontendsProject[];
  config?: MicrofrontendsConfig | null;
}

export interface MicrofrontendsProject {
  id: string;
  name?: string;
  microfrontends?: {
    isDefaultApp?: boolean;
    enabled?: boolean;
    defaultRoute?: string;
  };
}

export interface MicrofrontendsConfig {
  applications?: Record<string, unknown>;
}

export interface MicrofrontendsGroupsResponse {
  groups: MicrofrontendsGroupResponse[];
  maxMicrofrontendsGroupsPerTeam: number;
  maxMicrofrontendsPerGroup: number;
}
