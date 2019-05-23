/**
 * A fast implementation of an algorithm that takes an array and returns a copy of the array without duplicates.
 * We used to use `array-unique` ( https://github.com/jonschlinkert/array-unique/blob/5d1fbe560da8125e28e4ad6fbfa9daaf9f2ec120/index.js )
 * but from running benchmarks, found the implementation to be too slow. This implementation has show to be upto ~10x faster for large
 * projects
 * @param {Array} arr Input array that potentially has duplicates
 * @returns {Array} An array of the unique values in `arr`
 */
export default (arr: string[]) => {
  const len = arr.length;
  const res: string[] = [];
  const o: { [key: string]: string | number } = {};

  let i: number;

  for (i = 0; i < len; i += 1) {
    o[arr[i]] = o[arr[i]] || res.push(arr[i]);
  }

  return res;
};
