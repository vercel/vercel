interface EditorProps {
  projectName: string;
  filePath?: string;
}

declare const Editor: React.FC<EditorProps>;
export default Editor; 