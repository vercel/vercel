export type DefaultMessages = Record<"loading", string | boolean | number >
declare const template: (data: Partial<DefaultMessages>) => string
export { template }