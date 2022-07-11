import chalk from 'chalk';

// Used for including uids in the output
// example: `(dom_ji13dj2fih4fi2hf)`
export default (id: string) => chalk.gray(`(${id})`);
