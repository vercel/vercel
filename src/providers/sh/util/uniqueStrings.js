module.exports = function(arr) {
  const len = arr.length;
  const res = [];
  const o = {};
  let i;

  for (i = 0; i < len; i += 1) {
    o[arr[i]] = o[arr[i]] || res.push(arr[i]);
  }

  return res;
};