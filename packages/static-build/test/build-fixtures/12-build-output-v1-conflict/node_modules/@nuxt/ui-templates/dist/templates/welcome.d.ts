export type DefaultMessages = Record<"title" | "readDocs" | "followTwitter" | "starGitHub", string | boolean | number >
declare const template: (data: Partial<DefaultMessages>) => string
export { template }