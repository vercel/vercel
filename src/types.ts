export interface NowContext {
  apiUrl: string,
  authConfig: {
    token: string,
  },
  config: {
    currentTeam: string,
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
  userId: string,
  teamId: string | null,
  boughtAt: number,
  createdAt:  number,
  expiresAt:  number,
  serviceType: 'zeit.world' | 'external' | 'na',
  cdnEnabled: boolean,
  verified: boolean,
  nsVerifiedAt: number | null,
  txtVerifiedAt: number | null,
  suffix: boolean,
  verificationRecord: string,
  nameServers: string[],
  intendedNameServers: string[],
}

export type DomainExtra = {
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
