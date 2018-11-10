const streamToBuffer = require('fast-stream-to-buffer');

module.exports = async function (stream) {
  return await new Promise((resolve, reject) => {
    streamToBuffer(stream, function (error, buffer) {
      if (error) return reject(error);
      resolve(buffer);
    });
  });
};
