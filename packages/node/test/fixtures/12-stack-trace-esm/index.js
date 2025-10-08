export default function handler(req, res) {
  try {
    if (req) {
      // eslint-disable-next-line no-unused-expressions
      req.notdefined.something;
    }
    res.end('Should not print');
  } catch (error) {
    res.end(error.stack);
  }
}
