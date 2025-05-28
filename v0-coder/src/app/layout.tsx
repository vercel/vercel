import './globals.css';
import React, { useState, useCallback } from 'react';
import FileTree from '../components/FileTree';
import AIChat from '../components/AIChat';
import ConsolePanel from '../components/ConsolePanel';
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [fileName, setFileName] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFileSelect = useCallback(async (filePath: string) => {
    setLoading(true);
    setFileName(filePath);
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      setCode(data.content);
    } catch (e) {
      setCode("// Error loading file");
    }
    setLoading(false);
  }, []);

  const handleSave = useCallback(async (newCode?: string) => {
    if (!fileName) return;
    setSaving(true);
    try {
      await fetch(`/api/file?path=${encodeURIComponent(fileName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newCode ?? code }),
      });
      if (newCode !== undefined) setCode(newCode);
    } finally {
      setSaving(false);
    }
  }, [fileName, code]);

  const handleApplyCode = useCallback((newCode: string) => {
    setCode(newCode);
    handleSave(newCode);
  }, [handleSave]);

  const handleApplyMultiFileChange = useCallback(async (changes: { path: string; content: string }[]) => {
    for (const change of changes) {
      await fetch(`/api/file?path=${encodeURIComponent(change.path)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: change.content }),
      });
      // If the current file is changed, update the editor
      if (change.path === fileName) {
        setCode(change.content);
      }
      // Optionally: log to console or show notification
      // (You can expand this to use a notification system or update the ConsolePanel)
      console.log(`Applied change to ${change.path}`);
    }
  }, [fileName]);

  return (
    <html lang="en">
      <body className="h-screen w-screen overflow-hidden bg-gray-950 text-gray-100">
        <div className="flex h-screen w-screen">
          {/* AI Chat Sidebar */}
          <aside className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col">
            <div className="p-4 font-bold text-lg border-b border-gray-800">AI Agent</div>
            <div className="flex-1 overflow-y-auto p-2">
              <AIChat onApplyCode={handleApplyCode} onApplyMultiFileChange={handleApplyMultiFileChange} />
            </div>
          </aside>

          {/* File Tree Sidebar */}
          <aside className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col">
            <div className="p-4 font-bold text-lg border-b border-gray-800">Files</div>
            <div className="flex-1 overflow-y-auto p-2">
              <FileTree onFileSelect={handleFileSelect} />
            </div>
          </aside>

          {/* Main Code Editor and Console */}
          <main className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col">
              <div className="flex items-center px-4 py-2 border-b border-gray-800 bg-gray-950 gap-2">
                <span className="font-mono text-sm text-gray-400 flex-1 truncate">{fileName || "Select a file from the sidebar"}</span>
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded disabled:opacity-50"
                  onClick={() => handleSave()}
                  disabled={!fileName || saving}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <MonacoEditor
                  height="100%"
                  language={fileName.endsWith('.ts') || fileName.endsWith('.tsx') ? "typescript" : "javascript"}
                  value={code}
                  theme="vs-dark"
                  onChange={value => setCode(value || "")}
                  options={{
                    fontSize: 14,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    automaticLayout: true,
                    readOnly: loading || !fileName,
                  }}
                />
              </div>
            </div>
            <div className="h-40 bg-gray-900 border-t border-gray-800 p-2 overflow-y-auto">
              <ConsolePanel />
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
