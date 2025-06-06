import { useState } from 'react';
import ProjectSwitcher from '../components/ProjectSwitcher';
import FileTree from '../components/FileTree';
import Editor from '../components/Editor';

export default function Home() {
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');

  return (
    <div>
      <ProjectSwitcher onSelect={setSelectedProject} />
      {selectedProject && (
        <>
          <FileTree projectName={selectedProject} onFileSelect={setSelectedFilePath} />
          <Editor projectName={selectedProject} filePath={selectedFilePath} />
        </>
      )}
    </div>
  );
} 