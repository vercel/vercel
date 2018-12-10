export interface NowContext {
  argv: string[],
  apiUrl: string,
  authConfig: {
    token: string,
  },
  config: {
    currentTeam: string,
    updateChannel: string
  }
}

type Billing = {
  addons: string[];
  cancelation?: number;
  period: { start: number; end: number };
  plan: string;
  platform: string;
  trial: { start: number; end: number };
};

export type User = {
  uid: string;
  avatar: string;
  bio?: string;
  date: number;
  email: string;
  platformVersion: number;
  username: string;
  website?: string;
  billingChecked: boolean;
  billing: Billing;
  github?: {
    email: string;
    installation: {
      id: string;
      login: string;
      loginType: string;
    };
    login: string;
    updatedAt: number;
  };
};

export type Team = {
  id: string;
  avatar?: string;
  billing: Billing;
  created: string;
  creatorId: string;
  membership: { uid: string; role: 'MEMBER' | 'OWNER'; created: number };
  name: string;
  platformVersion: number;
  slug: string;
};

export type Domain = {
  id: string,
  name: string,
  boughtAt: number,
  createdAt:  number,
  expiresAt:  number,
  serviceType: 'zeit.world' | 'external' | 'na',
  cdnEnabled: boolean,
  verified: boolean,
  nsVerifiedAt: number | null,
  txtVerifiedAt: number | null,
  creator: {
    id: string,
    username: string,
    email: string
  }
}

export type DomainExtra = {
  suffix: boolean,
  nameServers: string[],
  verificationRecord: string,
  intendedNameServers: string[],
  aliases: Array<{
    id: string,
    alias: string,
    created: number,
  }>,
  certs: Array<{
    id: string,
    cns: string[]
  }>
}
