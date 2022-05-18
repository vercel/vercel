export default blobFromSync;
/**
 * @param {string} path filepath on the disk
 * @param {string} [type] mimetype to use
 */
export function blobFromSync(path: string, type?: string): Blob;
import File from "./file.js";
import Blob from "./index.js";
/**
 * @param {string} path filepath on the disk
 * @param {string} [type] mimetype to use
 */
export function blobFrom(path: string, type?: string): any;
/**
 * @param {string} path filepath on the disk
 * @param {string} [type] mimetype to use
 */
export function fileFrom(path: string, type?: string): any;
/**
 * @param {string} path filepath on the disk
 * @param {string} [type] mimetype to use
 */
export function fileFromSync(path: string, type?: string): File;
export { File, Blob };
