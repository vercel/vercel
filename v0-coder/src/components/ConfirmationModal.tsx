import React from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  currentCode: string;
  suggestedCode: string;
  onConfirm: () => void;
  onCancel: () => void;
  fileName?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  currentCode,
  suggestedCode,
  onConfirm,
  onCancel,
  fileName,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-gray-100">
            Confirm Changes to {fileName ? `"${fileName}"` : 'Current File'}
          </h2>
        </div>

        <div className="px-6 py-4 flex-1 overflow-y-auto">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-medium text-gray-300 mb-2">Current Code</h3>
              <pre className="bg-gray-800 p-3 rounded-md text-sm text-gray-200 whitespace-pre-wrap overflow-auto max-h-96">
                {currentCode}
              </pre>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-green-400 mb-2">Suggested Code</h3>
              <pre className="bg-gray-800 p-3 rounded-md text-sm text-green-300 whitespace-pre-wrap overflow-auto max-h-96">
                {suggestedCode}
              </pre>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-md text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            Confirm & Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
