import _pkg from '../../package.json';
import { PackageJson } from '@vercel/build-utils';

const pkg: PackageJson & typeof _pkg = _pkg;

export default pkg;
