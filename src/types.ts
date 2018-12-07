export type User = {
  uid: string,
  avatar: string,
  bio?: string,
  date: number,
  email: string,
  platformVersion: number,
  username: string,
  website?: string,
  billingChecked: boolean,
  billing: {
    addons: string[],
    cancelation?: number,
    period: { start: number, end: number },
    plan: string,
    platform: string,
    trial: { start: number, end: number }
  }
  github?: {
    email: string,
    installation: {
      id: string,
      login: string,
      loginType: string
    },
    login: string,
    updatedAt: number,
  }
}
