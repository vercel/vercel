import crypto, { HexBase64Latin1Encoding } from 'crypto';
type Algo = 'sha256' | 'sha512' | 'md5';

const hash = (algo: Algo, encoding: HexBase64Latin1Encoding) => (s: string) =>
  crypto.createHash(algo).update(s).digest(encoding);

const sha256Hex = hash('sha256', 'hex');

export default hash;
export { sha256Hex, Algo };
