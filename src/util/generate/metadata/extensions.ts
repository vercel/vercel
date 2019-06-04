import * as Builders from './builders'

export type Language = {
  builders: Builders.Builder[]
}

export const javascript = {
  builders: [
    Builders.node,
    Builders.nodeServer,
    Builders.noop
  ]
}

export const typescript = {
  builders: [
    Builders.node,
    Builders.nodeServer
  ]
}

export const rust = {
  builders: [
    Builders.rust
  ]
}

export const markdown = {
  builders: [
    Builders.markdown
  ]
}

export default {
  js: javascript,
  jsx: javascript,
  ts: typescript,
  tsx: typescript,
  rs: rust,
  md: markdown,
  markdown
} as {
  [key: string]: Language
}
