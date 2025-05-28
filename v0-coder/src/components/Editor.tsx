import { useState, useEffect } from 'react';

interface EditorProps {
  projectName: string;
  filePath?: string;
}

export default function Editor({ projectName, filePath }: EditorProps) {
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    if (filePath) {
      fetchFileContent();
    } else {
      setContent('');
    }
  }, [filePath]);

  const fetchFileContent = async () => {
    const res = await fetch(`/api/files?project=${projectName}&path=${encodeURIComponent(filePath || '')}`);
    const data = await res.json();
    setContent(data.content || '');
  };

  return (
    <div>
      <h2>Editor for {projectName}</h2>
      {filePath ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{ width: '100%', height: '300px' }}
        />
      ) : (
        <p>No file selected.</p>
      )}
    </div>
  );
} 