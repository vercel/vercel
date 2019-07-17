import hash, { sha256Hex } from './hash';

const say = (text: string) =>
  `${text} from a transpiled yarn workspace package ${sha256Hex(text)}`;

export default hash;
export { say };
