"use client";
import dynamic from "next/dynamic";
import React from "react"; // Removed useState, useCallback

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface HomePageProps {
  fileName: string;
  code: string;
  loading: boolean;
  saving: boolean;
  setCode: (newCode: string) => void;
  handleSave: (content?: string) => Promise<void>;
}

export default function HomePage({
  fileName,
  code,
  loading,
  saving,
  setCode,
  handleSave,
}: HomePageProps) {
  // All state and handlers are now passed as props

  return (
    // The outer div with h-full, w-full, flex flex-row is no longer needed here,
    // as page.tsx is now a child within layout.tsx's flex structure.
    // It should represent the main content area for the editor.
    <div className="flex-1 flex flex-col min-h-0"> {/* Ensure it fills space and allows editor to scroll */}
      <div className="flex items-center px-4 py-2 border-b border-gray-800 bg-gray-950 gap-2">
        <span className="font-mono text-sm text-gray-400 flex-1 truncate">
          {fileName || "Select a file from the sidebar"}
        </span>
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded disabled:opacity-50"
          onClick={() => handleSave(code)} // Pass current code to handleSave
          disabled={!fileName || saving || loading} // Disable if loading too
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      <div className="flex-1 min-h-0"> {/* Ensure editor takes remaining space */}
        <MonacoEditor
          height="100%" // Editor should fill its container
          language={fileName.endsWith('.ts') || fileName.endsWith('.tsx') ? "typescript" : "javascript"}
          value={code}
          theme="vs-dark"
          onChange={value => setCode(value || "")} // Use setCode prop
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              automaticLayout: true,
              readOnly: loading || !fileName, // Use loading and fileName props
            }}
          />
        </div>
      </div>
  );
}
