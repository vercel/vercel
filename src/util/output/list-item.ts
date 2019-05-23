import gray from 'chalk';

// listItem('woot') === '- woot'
// listItem('->', 'woot') === '-> woot'
// listItem(1, 'woot') === '1. woot'
const listItem = (msg: string, n?: string | number) => {
  if (!n) {
    n = '-';
  }
  if (Number(n)) {
    n += '.';
  }
  return `${gray(n.toString())} ${msg}`;
};

export default listItem;
