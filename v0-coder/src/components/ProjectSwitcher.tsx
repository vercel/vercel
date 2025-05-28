import { useState, useEffect } from 'react';

interface ProjectSwitcherProps {
  onSelect: (projectName: string) => void;
}

export default function ProjectSwitcher({ onSelect }: ProjectSwitcherProps) {
  const [projects, setProjects] = useState<string[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    const res = await fetch('/api/projects');
    const data = await res.json();
    setProjects(data.projects);
  };

  const handleCreateProject = async () => {
    if (!newProjectName) return;
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newProjectName }),
    });
    setNewProjectName('');
    fetchProjects();
  };

  const handleSelectProject = (projectName: string) => {
    setSelectedProject(projectName);
    onSelect(projectName);
  };

  return (
    <div>
      <select value={selectedProject} onChange={(e) => handleSelectProject(e.target.value)}>
        <option value="">Select a project</option>
        {projects.map((project) => (
          <option key={project} value={project}>{project}</option>
        ))}
      </select>
      <input
        type="text"
        value={newProjectName}
        onChange={(e) => setNewProjectName(e.target.value)}
        placeholder="New project name"
      />
      <button onClick={handleCreateProject}>Create Project</button>
    </div>
  );
} 