import type { Driver } from '../types';
export interface OverlayStorageOptions {
    layers: Driver[];
}
declare const _default: (opts?: OverlayStorageOptions) => Driver;
export default _default;
