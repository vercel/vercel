import hash, { sha256Hex } from './hash';

const say = text =>
  `${text} from a transpiled yarn workspace package ${sha256Hex(text)}`;

export { say, hash };
