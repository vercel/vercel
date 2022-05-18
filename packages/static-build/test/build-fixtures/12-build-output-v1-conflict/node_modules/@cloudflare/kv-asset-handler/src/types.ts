export type CacheControl = {
  browserTTL: number
  edgeTTL: number
  bypassCache: boolean
}

export type AssetManifestType = Record<string, string>

export type Options = {
  cacheControl: ((req: Request) => Partial<CacheControl>) | Partial<CacheControl>
  ASSET_NAMESPACE: any
  ASSET_MANIFEST: AssetManifestType | string
  mapRequestToAsset?: (req: Request, options?: Partial<Options>) => Request
  defaultMimeType: string
  defaultDocument: string
  pathIsEncoded: boolean
}

export class KVError extends Error {
  constructor(message?: string, status: number = 500) {
    super(message)
    // see: typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html
    Object.setPrototypeOf(this, new.target.prototype) // restore prototype chain
    this.name = KVError.name // stack traces display correctly now
    this.status = status
  }
  status: number
}
export class MethodNotAllowedError extends KVError {
  constructor(message: string = `Not a valid request method`, status: number = 405) {
    super(message, status)
  }
}
export class NotFoundError extends KVError {
  constructor(message: string = `Not Found`, status: number = 404) {
    super(message, status)
  }
}
export class InternalError extends KVError {
  constructor(message: string = `Internal Error in KV Asset Handler`, status: number = 500) {
    super(message, status)
  }
}
