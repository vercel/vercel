interface Route {
  src: string;
  dest: string;
  headers?: {
    [key: string]: string;
  };
  status?: number;
  methods?: string[];
}

interface Build {
  src: string;
  use: string;
}

export interface Deployment {
  id: string;
  deploymentId?: string;
  uid?: string;
  url: string;
  name: string;
  meta: {
    [key: string]: string | number | boolean;
  };
  version: number;
  regions: string[];
  routes: Route[];
  builds: Build[];
  plan: string;
  public: boolean;
  ownerId: string;
  readyState:
    | 'INITIALIZING'
    | 'ANALYZING'
    | 'BUILDING'
    | 'DEPLOYING'
    | 'READY'
    | 'ERROR';
  state?:
    | 'INITIALIZING'
    | 'ANALYZING'
    | 'BUILDING'
    | 'DEPLOYING'
    | 'READY'
    | 'ERROR';
  createdAt: string;
  createdIn: string;
  env: {
    [key: string]: string;
  };
  build: {
    env: {
      [key: string]: string;
    };
  };
  target: string;
  alias: string[];
}
