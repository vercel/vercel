import crypto from 'crypto';

const hash = (algo, digest) => s =>
  crypto.createHash(algo).update(s).digest(digest);

const sha256Hex = hash('sha256', 'hex');

export default hash;
export { sha256Hex };
