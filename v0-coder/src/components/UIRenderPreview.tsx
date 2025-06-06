import React from 'react';

interface UIRenderPreviewProps {
  codeToPreview: string;
  isVisible: boolean;
  onClose: () => void;
}

const UIRenderPreview: React.FC<UIRenderPreviewProps> = ({
  codeToPreview,
  isVisible,
  onClose,
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="bg-gray-850 flex flex-col h-full w-full">
      <div className="flex items-center justify-between p-2 bg-gray-900 border-b border-gray-800">
        <span className="font-semibold text-sm text-gray-300">UI Preview</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-100 px-2 py-1 rounded text-xs"
          aria-label="Close UI Preview"
        >
          &times; Close
        </button>
      </div>
      <div className="flex-1 p-1 overflow-hidden">
        {codeToPreview ? (
          <iframe
            srcDoc={codeToPreview}
            title="UI Preview"
            sandbox="allow-scripts allow-same-origin" // Minimal sandbox permissions
            className="w-full h-full border-0 bg-white" // bg-white for typical HTML page background
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            No UI code to preview.
          </div>
        )}
      </div>
    </div>
  );
};

export default UIRenderPreview;
