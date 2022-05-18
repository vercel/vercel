export type DefaultMessages = Record<"statusCode" | "statusMessage" | "description", string | boolean | number >
declare const template: (data: Partial<DefaultMessages>) => string
export { template }