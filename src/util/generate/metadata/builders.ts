import { Locale } from '../helpers';

export type Builder = {
  use: string
  locale?: Locale
}

export const noop: Builder = {
  use: '@now/static',
  locale: {
    single: 'This is a public static file',
    many: 'These are public static files'
  }
}

export const staticBuild: Builder = {
  use: '@now/static-build',
  locale: {
    single: 'This file needs to be built as static',
    many: 'These files need to be built as static'
  }
}

export const next: Builder = {
  use: '@now/next',
  locale: {
    single: 'This is a Next.js project',
    many: 'This is a Next.js project'
  }
}

export const node: Builder = {
  use: '@now/node',
  locale: {
    single: 'This is a Node.js lambda',
    many: 'Each of these are indivudual Node.js endpoints'
  }
}

export const nodeServer: Builder = {
  use: '@now/node-server',
  locale: {
    single: 'This is Node.js app listening on a port',
    many: 'These form a Node.js app listening on a port'
  }
}

export const rust: Builder = {
  use: '@now/rust'
}

export const markdown: Builder = {
  use: '@now/md'
}

export const go: Builder = {
  use: '@now/go'
}

export const php: Builder = {
  use: '@now/php'
}

export const bash: Builder = {
  use: '@now/bash'
}

export const python: Builder = {
  use: '@now/python'
}
