/**
 * A naive isURL
 */
export default function isURL(str: any): boolean {
  return typeof str === 'string' && /^https?:\/\//.test(str);
}
