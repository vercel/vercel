import React, { useEffect, useState } from 'react';

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileNode[];
}

interface FileTreeProps {
  projectName: string;
  onFileSelect?: (filePath: string) => void;
}

function FileTreeNode({ node, onFileSelect, refresh, projectName }: { node: FileNode; onFileSelect?: (filePath: string) => void; refresh: () => void; projectName: string }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileNode[] | null>(null);

  const handleExpand = async () => {
    if (!expanded && node.type === 'folder') {
      const res = await fetch(`/api/files?project=${projectName}&path=${encodeURIComponent(node.path)}`);
      const data = await res.json();
      setChildren(
        data.files.map((f: any) => ({ ...f, path: node.path ? `${node.path}/${f.name}` : f.name }))
      );
    }
    setExpanded(e => !e);
  };

  const handleRename = async () => {
    const newName = window.prompt('Rename to:', node.name);
    if (newName && newName !== node.name) {
      await fetch(`/api/files?project=${projectName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: node.path, newName: node.path.replace(/[^/]+$/, newName) }),
      });
      refresh();
    }
  };

  const handleDelete = async () => {
    if (window.confirm(`Delete ${node.name}?`)) {
      await fetch(`/api/files?project=${projectName}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: node.path }),
      });
      refresh();
    }
  };

  return (
    <div>
      <div
        className={`flex items-center cursor-pointer select-none py-0.5 pl-${node.path.split('/').length * 4}`}
        onClick={() => node.type === 'folder' ? handleExpand() : onFileSelect?.(node.path)}
      >
        {node.type === 'folder' ? (
          <span className="mr-1">{expanded ? '📂' : '📁'}</span>
        ) : (
          <span className="mr-1">📄</span>
        )}
        <span className="text-gray-300 font-mono text-sm flex-1">{node.name}</span>
        <button className="ml-1 text-xs text-yellow-400 hover:underline" onClick={e => { e.stopPropagation(); handleRename(); }}>Rename</button>
        <button className="ml-1 text-xs text-red-400 hover:underline" onClick={e => { e.stopPropagation(); handleDelete(); }}>Delete</button>
      </div>
      {expanded && children && (
        <div>
          {children.map(child => (
            <FileTreeNode key={child.path} node={child} onFileSelect={onFileSelect} refresh={refresh} projectName={projectName} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree({ projectName, onFileSelect }: FileTreeProps) {
  const [rootFiles, setRootFiles] = useState<FileNode[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    fetchFiles();
  }, [projectName]);

  const fetchFiles = async () => {
    const res = await fetch(`/api/files?project=${projectName}`);
    const data = await res.json();
    setRootFiles(
      data.files.map((f: any) => ({ ...f, path: f.name }))
    );
  };

  const handleNewFile = async () => {
    const name = window.prompt('New file name:');
    if (name) {
      await fetch(`/api/files?project=${projectName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content: '' }),
      });
      refresh();
    }
  };

  const handleNewFolder = async () => {
    const name = window.prompt('New folder name:');
    if (name) {
      await fetch(`/api/files?project=${projectName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: 'folder' }),
      });
      refresh();
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <button className="bg-gray-800 text-xs text-white px-2 py-1 rounded hover:bg-gray-700" onClick={handleNewFile}>+ File</button>
        <button className="bg-gray-800 text-xs text-white px-2 py-1 rounded hover:bg-gray-700" onClick={handleNewFolder}>+ Folder</button>
      </div>
      {rootFiles.map(node => (
        <FileTreeNode key={node.path} node={node} onFileSelect={onFileSelect} refresh={refresh} projectName={projectName} />
      ))}
    </div>
  );
} 