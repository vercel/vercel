/**
 * @template T
 * @param {number} minChunks minimum number of chunks
 * @param {number} maxChunks maximum number of chunks
 * @param {T[]} arr
 * @returns {T[][]}
 */
function intoChunks(minChunks, maxChunks, arr) {
  const chunkSize = Math.max(minChunks, Math.ceil(arr.length / maxChunks));
  const chunks = [];
  for (let i = 0; i < maxChunks; i++) {
    chunks.push(arr.slice(i * chunkSize, (i + 1) * chunkSize));
  }
  return chunks.filter(x => x.length > 0);
}

module.exports = { intoChunks };
