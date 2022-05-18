export type DefaultMessages = Record<"statusCode" | "statusMessage" | "description" | "stack", string | boolean | number >
declare const template: (data: Partial<DefaultMessages>) => string
export { template }