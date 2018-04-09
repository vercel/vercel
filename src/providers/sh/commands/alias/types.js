// @flow
type FetchOptions = {
  body: any,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
}

export interface Now {
  fetch(url: string, options?: FetchOptions): Promise<any>,
  list(appName: string, {version: number}): Deployment[],
  listAliases(): Alias[]
}

export interface Output {
  debug(msg: string): void,
  error(msg: string): void,
  log(msg: string): void,
  note(msg: string): void,
  print(msg: string): void,
  success(msg: string): void,
  warn(msg: string): void,
}

export type User = {
  uid: string,
  email: string,
  username: string,
  avatar: string
}

export type Config = {
  alias?: string[] | string,
  aliases?: string[] | string,
  name?: string,
}

export type Scale = {
  min: number,
  max: number
}

export type DeploymentScale = { 
  [dc: string]: Scale
}

export type NpmDeployment = {
  uid: string,
  url: string,
  name: string,
  type: 'NPM',
  state: 'FROZEN' | 'READY',
  created: number,
  creator: { uid: string },
  sessionAffinity: string,
  scale: DeploymentScale
}

export type StaticDeployment = {
  uid: string,
  url: string,
  name: string,
  type: 'STATIC',
  state: 'FROZEN' | 'READY',
  created: number,
  creator: { uid: string },
  sessionAffinity: string,
}

export type BinaryDeployment = {
  uid: string,
  url: string,
  name: string,
  type: 'BINARY',
  state: 'FROZEN' | 'READY',
  created: number,
  creator: { uid: string },
  sessionAffinity: string,
  scale: DeploymentScale
}

export type Deployment =
  NpmDeployment |
  StaticDeployment |
  BinaryDeployment

export type Alias = {
  uid: string,
  alias: string,
  created: string,
  deployment: {
    id: string,
    url: string
  },
  creator: {
    uid: string,
    username: string,
    email: string
  },
  deploymentId: string,
  rules: Array<{
    pathname: string,
    method: Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>,
    dest: string,
  }>
}

export type AliasRecord = {
  uid: string,
  alias: string,
  created?: string,
  oldDeploymentId?: string
}

export type PathRule = {
  dest: string,
  pathname?: string,
  method?: Array<string>,
}
