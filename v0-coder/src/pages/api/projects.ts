import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

const PROJECTS_ROOT = path.join(process.cwd(), 'projects');

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!fs.existsSync(PROJECTS_ROOT)) {
    fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
  }
  const { method, body, query } = req;

  if (method === 'GET') {
    // List projects
    const projects = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    return res.status(200).json({ projects });
  } else if (method === 'POST') {
    // Create project
    const { name } = body;
    if (!name) return res.status(400).json({ error: 'Missing project name' });
    const projectPath = path.join(PROJECTS_ROOT, name);
    if (fs.existsSync(projectPath)) return res.status(400).json({ error: 'Project already exists' });
    fs.mkdirSync(projectPath);
    return res.status(200).json({ success: true });
  } else if (method === 'PUT') {
    // Rename project
    const { oldName, newName } = body;
    if (!oldName || !newName) return res.status(400).json({ error: 'Missing oldName or newName' });
    const oldPath = path.join(PROJECTS_ROOT, oldName);
    const newPath = path.join(PROJECTS_ROOT, newName);
    if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'Project not found' });
    if (fs.existsSync(newPath)) return res.status(400).json({ error: 'New project name already exists' });
    fs.renameSync(oldPath, newPath);
    return res.status(200).json({ success: true });
  } else if (method === 'DELETE') {
    // Delete project
    const { name } = body;
    if (!name) return res.status(400).json({ error: 'Missing project name' });
    const projectPath = path.join(PROJECTS_ROOT, name);
    if (!fs.existsSync(projectPath)) return res.status(404).json({ error: 'Project not found' });
    fs.rmdirSync(projectPath, { recursive: true });
    return res.status(200).json({ success: true });
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    return res.status(405).end(`Method ${method} Not Allowed`);
  }
} 