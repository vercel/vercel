//@ts-ignore test will compile during deployment
import express from 'express';
const router = express.Router();

export default function handler(req: any, res: any) {
  if (router && req) res.end('default-import:RANDOMNESS_PLACEHOLDER');
  else res.end('failed to fetch default import');
}
