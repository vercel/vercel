import './globals.css';
import React, { useState, useCallback } from 'react';
import FileTree from '../components/FileTree';
import AIChat from '../components/AIChat';
import ConsolePanel from '../components/ConsolePanel';
import UIRenderPreview from '../components/UIRenderPreview';
import ConfirmationModal from '../components/ConfirmationModal'; // Import ConfirmationModal

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [fileName, setFileName] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uiPreviewCode, setUiPreviewCode] = useState<string>("");
  const [isUIRenderPreviewVisible, setIsUIRenderPreviewVisible] = useState<boolean>(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [confirmationData, setConfirmationData] = useState<{ current: string; suggested: string; fileName?: string } | null>(null);

  const handleFileSelect = useCallback(async (filePath: string) => {
    setLoading(true);
    setFileName(filePath);
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      setCode(data.content);
    } catch { // Remove unused _e
      setCode("// Error loading file");
    }
    setLoading(false);
  }, []);

  const handleSave = useCallback(async (contentToSave?: string) => { // Renamed for clarity, will use contentToSave or current code
    if (!fileName) return;
    setSaving(true);
    try {
      await fetch(`/api/file?path=${encodeURIComponent(fileName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentToSave ?? code }), // Use contentToSave if provided
      });
      if (contentToSave !== undefined && contentToSave !== code) { // Update internal code state if contentToSave is different
        setCode(contentToSave);
      }
    } finally {
      setSaving(false);
    }
  }, [fileName, code]);

  const handleApplyCode = useCallback((suggestedNewCode: string) => {
    setConfirmationData({
      current: code, // Current code from editor state
      suggested: suggestedNewCode,
      fileName: fileName // Current fileName from state
    });
    setIsConfirmModalOpen(true);
  }, [code, fileName]); // Add `code` and `fileName` to dependencies

  const handleConfirmCodeChange = useCallback(() => {
    if (confirmationData) {
      setCode(confirmationData.suggested);
      handleSave(confirmationData.suggested);
    }
    setIsConfirmModalOpen(false);
    setConfirmationData(null);
  }, [confirmationData, handleSave]);

  const handleCancelCodeChange = useCallback(() => {
    setIsConfirmModalOpen(false);
    setConfirmationData(null);
  }, []);

  const handleApplyMultiFileChange = useCallback(async (changes: { path: string; content: string }[]) => {
    // For multi-file changes, we might bypass the single-file confirmation
    // or implement a different multi-file review UI.
    // For now, applying directly as per original logic.
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

  const handleShowUIRenderPreview = useCallback((previewCode: string) => {
    setUiPreviewCode(previewCode);
    setIsUIRenderPreviewVisible(true);
  }, []);

  const handleHideUIRenderPreview = useCallback(() => {
    setIsUIRenderPreviewVisible(false);
    setUiPreviewCode("");
  }, []);

  return (
    <html lang="en">
      <body className="h-screen w-screen overflow-hidden bg-gray-950 text-gray-100">
        <div className="flex h-screen w-screen">
          {/* AI Chat Sidebar */}
          <aside className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col">
            <div className="p-4 font-bold text-lg border-b border-gray-800">AI Agent</div>
            <div className="flex-1 overflow-y-auto p-2">
              <AIChat
                onApplyCode={handleApplyCode}
                onApplyMultiFileChange={handleApplyMultiFileChange}
                activeFileContent={code}
                activeFileName={fileName}
                onShowUIRenderPreview={handleShowUIRenderPreview}
                // onHideUIRenderPreview={handleHideUIRenderPreview} // Not strictly needed by AIChat directly
              />
            </div>
          </aside>

          {/* File Tree Sidebar */}
          <aside className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col shrink-0"> {/* Added shrink-0 */}
            <div className="p-4 font-bold text-lg border-b border-gray-800">Files</div>
            <div className="flex-1 overflow-y-auto p-2">
              <FileTree onFileSelect={handleFileSelect} />
            </div>
          </aside>

          {/* Main Code Editor and Console */}
          <main className="flex-1 flex flex-col min-w-0"> {/* Added min-w-0 to prevent flexbox shrinkage issues */}
            {React.Children.map(children, child =>
              React.isValidElement(child) ? React.cloneElement(child as React.ReactElement<{
                fileName: string;
                code: string;
                loading: boolean;
                saving: boolean;
                setCode: (newCode: string) => void;
                handleSave: (content?: string) => Promise<void>;
              }>, {
                fileName,
                code,
                loading,
                saving,
                setCode,
                handleSave,
              }) : child
            )}
            <div className="h-40 bg-gray-900 border-t border-gray-800 p-2 overflow-y-auto shrink-0"> {/* Added shrink-0 */}
              <ConsolePanel />
            </div>
          </main>

          {/* UI Render Preview Panel */}
          {isUIRenderPreviewVisible && (
            <aside className="w-1/3 bg-gray-850 border-l border-gray-800 flex flex-col shrink-0">
              <UIRenderPreview
                codeToPreview={uiPreviewCode}
                isVisible={isUIRenderPreviewVisible}
                onClose={handleHideUIRenderPreview}
              />
            </aside>
          )}
        </div>
        {isConfirmModalOpen && confirmationData && (
          <ConfirmationModal
            isOpen={isConfirmModalOpen}
            currentCode={confirmationData.current}
            suggestedCode={confirmationData.suggested}
            fileName={confirmationData.fileName}
            onConfirm={handleConfirmCodeChange}
            onCancel={handleCancelCodeChange}
          />
        )}
      </body>
    </html>
  );
}
