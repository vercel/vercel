/**
 * @template T
 * @param {number} minChunks minimum number of chunks
 * @param {number} maxChunks maximum number of chunks
 * @param {T[]} items
 * @returns {T[][]}
 */
function intoChunks(minChunks, maxChunks, items) {
  const chunkSize = Math.max(minChunks, Math.ceil(items.length / maxChunks));
  const chunks = [];
  for (let index = 0; index < maxChunks; index++) {
    chunks.push(items.slice(index * chunkSize, (index + 1) * chunkSize));
  }
  return chunks.filter(chunk => chunk.length > 0);
}

module.exports = { intoChunks };
