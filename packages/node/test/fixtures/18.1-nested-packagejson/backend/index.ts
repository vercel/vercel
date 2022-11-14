const ts = require('typescript');

export default function handler(req: any, res: any) {
  if (req) {
    res.end(`RANDOMNESS_PLACEHOLDER:backend ts version ${ts.version}`);
  }
}
