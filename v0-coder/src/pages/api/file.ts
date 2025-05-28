import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

const ROOT_DIR = path.resolve(process.cwd());

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { query, method, body } = req;
  const relPath = typeof query.path === 'string' ? query.path : '';
  const absPath = path.join(ROOT_DIR, relPath);

  if (!absPath.startsWith(ROOT_DIR)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  if (method === 'GET') {
    try {
      const content = fs.readFileSync(absPath, 'utf8');
      res.status(200).json({ content });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  } else if (method === 'POST') {
    try {
      if (body.type === 'folder') {
        fs.mkdirSync(absPath, { recursive: true });
        res.status(200).json({ success: true });
      } else {
        fs.writeFileSync(absPath, body.content || '', 'utf8');
        res.status(200).json({ success: true });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  } else if (method === 'PUT') {
    try {
      const newRelPath = typeof body.newPath === 'string' ? body.newPath : '';
      const newAbsPath = path.join(ROOT_DIR, newRelPath);
      if (!newAbsPath.startsWith(ROOT_DIR)) {
        return res.status(400).json({ error: 'Invalid new path' });
      }
      fs.renameSync(absPath, newAbsPath);
      res.status(200).json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  } else if (method === 'DELETE') {
    try {
      if (fs.lstatSync(absPath).isDirectory()) {
        fs.rmdirSync(absPath, { recursive: true });
      } else {
        fs.unlinkSync(absPath);
      }
      res.status(200).json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).end(`Method ${method} Not Allowed`);
  }
} 