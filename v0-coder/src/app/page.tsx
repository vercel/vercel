"use client";
import dynamic from "next/dynamic";
import React, { useState, useCallback } from "react";
import FileTree from "../components/FileTree";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export default function HomePage() {
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

  const handleSave = useCallback(async () => {
    if (!fileName) return;
    setSaving(true);
    try {
      await fetch(`/api/file?path=${encodeURIComponent(fileName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: code }),
      });
    } finally {
      setSaving(false);
    }
  }, [fileName, code]);

  return (
    <div className="h-full w-full flex flex-row">
      {/* FileTree Sidebar (hidden, since it's in layout, but for SSR safety) */}
      <div className="hidden">
        <FileTree onFileSelect={handleFileSelect} />
      </div>
      <div className="flex-1 flex flex-col">
        <div className="flex items-center px-4 py-2 border-b border-gray-800 bg-gray-950 gap-2">
          <span className="font-mono text-sm text-gray-400 flex-1 truncate">{fileName || "Select a file from the sidebar"}</span>
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded disabled:opacity-50"
            onClick={handleSave}
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
    </div>
  );
}
