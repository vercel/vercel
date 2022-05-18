import type { CompatibilityEventHandler, RouterMethod } from 'h3'

interface HandlerDefinition {
  route: string
  lazy?: boolean
  middleware?: boolean
  handler: CompatibilityEventHandler | (() => Promise<CompatibilityEventHandler>)
  method?: RouterMethod
}

export const handlers: HandlerDefinition[]
