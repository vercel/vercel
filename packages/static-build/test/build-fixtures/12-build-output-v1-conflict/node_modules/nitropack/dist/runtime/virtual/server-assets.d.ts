export interface AssetMeta { type?: string, etag?: string, mtime?: string }
export function readAsset<T = any> (id: string): Promise<T>
export function statAsset (id: string): Promise<AssetMeta>
export function getKeys() : Promise<string[]>
