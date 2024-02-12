const rawBody = stream =>
  new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    stream
      .on('error', reject)
      .on('end', () => resolve(Buffer.concat(chunks, bytes)))
      .on('data', chunk => {
        chunks.push(chunk)
        bytes += chunk.length
      })
  })

module.exports = async (req, res) => {
  res.json({
    body: req.body,
    readBody: JSON.parse((await rawBody(req)).toString())
  })
};
