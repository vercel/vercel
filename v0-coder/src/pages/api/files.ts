import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

const PROJECTS_ROOT = path.join(process.cwd(), 'projects');

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method, body, query } = req;
  const { project } = query;

  if (!project || typeof project !== 'string') {
    return res.status(400).json({ error: 'Missing project parameter' });
  }

  const projectPath = path.join(PROJECTS_ROOT, project);
  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (method === 'GET') {
    // List files in the project
    const files = fs.readdirSync(projectPath, { withFileTypes: true })
      .map(d => ({ name: d.name, type: d.isDirectory() ? 'folder' : 'file' }));
    return res.status(200).json({ files });
  } else if (method === 'POST') {
    // Create a new file or folder
    const { name, content, type } = body;
    if (!name) return res.status(400).json({ error: 'Missing file name' });
    const filePath = path.join(projectPath, name);
    if (fs.existsSync(filePath)) return res.status(400).json({ error: 'File already exists' });
    if (type === 'folder') {
      fs.mkdirSync(filePath);
    } else {
      fs.writeFileSync(filePath, content || '');
    }
    return res.status(200).json({ success: true });
  } else if (method === 'PUT') {
    // Rename a file or folder
    const { oldName, newName } = body;
    if (!oldName || !newName) return res.status(400).json({ error: 'Missing oldName or newName' });
    const oldPath = path.join(projectPath, oldName);
    const newPath = path.join(projectPath, newName);
    if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'File not found' });
    if (fs.existsSync(newPath)) return res.status(400).json({ error: 'New file name already exists' });
    fs.renameSync(oldPath, newPath);
    return res.status(200).json({ success: true });
  } else if (method === 'DELETE') {
    // Delete a file or folder
    const { name } = body;
    if (!name) return res.status(400).json({ error: 'Missing file name' });
    const filePath = path.join(projectPath, name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    fs.rmSync(filePath, { recursive: true });
    return res.status(200).json({ success: true });
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  }
} 