import React, { useState, useRef, FormEvent, useEffect } from 'react';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

type Provider = 'openai' | 'anthropic' | 'gemini';

const PROVIDER_LABELS: Record<Provider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
};

function getApiKey(provider: Provider) {
  return localStorage.getItem(`ai-key-${provider}`) || '';
}
function setApiKey(provider: Provider, key: string) {
  localStorage.setItem(`ai-key-${provider}`, key);
}

function extractFirstCodeBlock(text: string): string | null {
  const match = text.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

function extractMultiFileChanges(text: string): { path: string; content: string }[] | null {
  const match = text.match(/```json\n([\s\S]*?)```/);
  if (match) {
    try {
      const arr = JSON.parse(match[1]);
      if (Array.isArray(arr) && arr.every(f => typeof f.path === 'string' && typeof f.content === 'string')) {
        return arr;
      }
    } catch {}
  }
  return null;
}

interface AIChatProps {
  onApplyCode?: (code: string) => void;
  onApplyMultiFileChange?: (changes: { path: string; content: string }[]) => void;
  activeFileContent?: string;
  activeFileName?: string;
  onShowUIRenderPreview?: (code: string) => void; // Added new prop
}

// Basic heuristic to check for UI code (HTML/JSX-like)
function isLikelyUiCode(code: string): boolean {
  const trimmedCode = code.trim();
  return trimmedCode.startsWith('<') && trimmedCode.endsWith('>');
}

export default function AIChat({
  onApplyCode,
  onApplyMultiFileChange,
  activeFileContent,
  activeFileName,
  onShowUIRenderPreview, // Destructure new prop
}: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: 'Hi! I am your AI coding assistant. How can I help you today?' },
  ]);
  const [input, setInput] = useState('');
  const [provider, setProvider] = useState<Provider>('openai');
  const [apiKey, setApiKeyState] = useState('');
  const [loading, setLoading] = useState(false);
  const [multiFileDialog, setMultiFileDialog] = useState<{ changes: { path: string; content: string }[] } | null>(null);
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setApiKeyState(getApiKey(provider));
  }, [provider]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !apiKey) return;

    const currentInput = input; // Save current input before clearing
    setMessages(msgs => [...msgs, { role: 'user', content: currentInput }]);
    setInput('');
    setLoading(true);
    setStreaming(false);

    const conversationHistory = messages.map(msg => ({ // Changed let to const
      role: msg.role === 'ai' ? 'assistant' : 'user',
      content: msg.content,
    }));

    const messagesForApi = [];
    if (activeFileContent && activeFileName && currentInput.trim()) {
      messagesForApi.push({
        role: 'system', // Using system role for context
        content: `You are an AI coding assistant. The user is working on a file named "${activeFileName}". Its current content is:
\`\`\`
${activeFileContent}
\`\`\`

The following is the conversation history and the user's current request.`
      });
    }
    messagesForApi.push(...conversationHistory);
    messagesForApi.push({ role: 'user', content: currentInput });


    if (provider === 'openai') {
      // Streaming for OpenAI
      setStreaming(true);
      let aiContent = '';
      setMessages(msgs => [...msgs, { role: 'ai', content: '' }]); // Add placeholder for AI response
      const params = new URLSearchParams({
        provider,
        apiKey,
        model: '', // Model can be set here or in API based on provider
        messages: JSON.stringify(messagesForApi),
      });
      // The 'prompt' parameter is removed as its content is now part of `messagesForApi`
      const eventSource = new EventSource('/api/ai/stream-proxy?' + params.toString());
      
      eventSource.onmessage = (event) => {
        if (event.data === '[DONE]') {
          setStreaming(false);
          setLoading(false);
          eventSource.close();
          // Check for multi-file changes
          const multiFile = extractMultiFileChanges(aiContent);
          if (multiFile && multiFile.length && onApplyMultiFileChange) {
            setMultiFileDialog({ changes: multiFile });
          }
          return;
        }
        aiContent += JSON.parse(event.data);
        setMessages(msgs => {
          const newMsgs = [...msgs];
          newMsgs[newMsgs.length - 1] = { role: 'ai', content: aiContent };
          return newMsgs;
        });
      };
      eventSource.onerror = () => {
        setStreaming(false);
        setLoading(false);
        eventSource.close();
      };
      return;
    }
    // Non-streaming fallback for other providers
    try {
      // For non-streaming, construct the prompt for Gemini if it's the provider,
      // otherwise use messagesForApi for other providers like Anthropic (if it supports it).
      let requestBody: {
        provider: Provider;
        apiKey: string;
        messages?: typeof messagesForApi; // messages is optional
        prompt?: string; // prompt is optional, used for Gemini
      } = {
        provider,
        apiKey,
        messages: messagesForApi, // Use the full context
      };

      // Gemini currently expects a single prompt in the existing API structure.
      // We'll concatenate the context and the latest user message for Gemini.
      if (provider === 'gemini') {
        let geminiPrompt = "";
        if (activeFileContent && activeFileName && currentInput.trim()) {
          geminiPrompt += `The user is currently working on the file named "${activeFileName}". Here is the current content of this file:\n\n\`\`\`\n${activeFileContent}\n\`\`\`\n\nUser's request related to this file (or a general request) is: ${currentInput}`;
        } else {
          geminiPrompt = currentInput;
        }
        // If there's conversation history, prepend it. (Simplified for now)
        // For a more robust Gemini integration, its API endpoint in `ai.ts` would need to be updated
        // to handle a message history similarly to OpenAI.
        // For now, the 'prompt' field will carry the constructed context + query.
        const historyString = conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n');
        if (historyString) {
            geminiPrompt = `Conversation History:\n${historyString}\n\n${geminiPrompt}`;
        }

        requestBody = { // Overwrite for Gemini
            provider,
            apiKey,
            prompt: geminiPrompt, // Gemini specific prompt construction
            // messages will be ignored by the current Gemini implementation in `pages/api/ai.ts`
        };
      }


      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      let aiContent = '';
      if (provider === 'anthropic' && data.response && data.response.content) {
        aiContent = Array.isArray(data.response.content) ? data.response.content.map((c: any) => c.text).join('\n') : data.response.content;
      } else if (provider === 'gemini' && data.response && data.response.candidates && data.response.candidates[0]?.content?.parts) {
        aiContent = data.response.candidates[0].content.parts.map((p: any) => p.text).join('\n');
      } else if (data.error) {
        aiContent = `Error: ${data.error}`;
      } else {
        aiContent = 'No response from AI.';
      }
      setMessages(msgs => [...msgs, { role: 'ai', content: aiContent }]);
      // Check for multi-file changes
      const multiFile = extractMultiFileChanges(aiContent);
      if (multiFile && multiFile.length && onApplyMultiFileChange) {
        setMultiFileDialog({ changes: multiFile });
      }
    } catch (err: any) {
      setMessages(msgs => [...msgs, { role: 'ai', content: `Error: ${err.message}` }]);
    }
    setLoading(false);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleApiKeySave = () => {
    setApiKey(provider, apiKey);
    setMessages(msgs => [...msgs, { role: 'ai', content: 'API key saved locally.' }]);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 p-1 border-b border-gray-800 items-center">
        <select
          className="bg-gray-800 text-gray-100 px-2 py-1 rounded"
          value={provider}
          onChange={e => setProvider(e.target.value as Provider)}
        >
          {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <input
          className="flex-1 rounded bg-gray-800 text-gray-100 px-2 py-1 outline-none"
          placeholder="API Key"
          value={apiKey}
          onChange={e => setApiKeyState(e.target.value)}
          type="password"
        />
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
          onClick={handleApiKeySave}
        >Save</button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 p-1">
        {messages.map((msg, i) => {
          const codeBlock = msg.role === 'ai' ? extractFirstCodeBlock(msg.content) : null;
          const multiFile = msg.role === 'ai' ? extractMultiFileChanges(msg.content) : null;
          const canPreviewUi = codeBlock && isLikelyUiCode(codeBlock) && onShowUIRenderPreview;

          return (
            <div key={i} className={msg.role === 'user' ? 'text-right' : 'text-left'}>
              <span className={msg.role === 'user' ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-200'}
                style={{ borderRadius: 8, padding: '4px 8px', display: 'inline-block', maxWidth: '90%' }}>
                {msg.content}
                {streaming && i === messages.length - 1 && msg.role === 'ai' && <span className="ml-2 animate-pulse text-blue-400">Thinking…</span>}
              </span>
              {(codeBlock && onApplyCode) || (canPreviewUi) || (multiFile && onApplyMultiFileChange) ? (
                <div className="mt-1 flex gap-2 justify-start"> {/* Use flex for button alignment */}
                  {codeBlock && onApplyCode && (
                    <button
                      className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs"
                      onClick={() => onApplyCode(codeBlock)}
                    >Apply Change</button>
                  )}
                  {canPreviewUi && (
                    <button
                      className="bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded text-xs"
                      onClick={() => onShowUIRenderPreview(codeBlock!)} // codeBlock is checked by canPreviewUi
                    >Preview UI</button>
                  )}
                  {multiFile && onApplyMultiFileChange && (
                    <button
                      className="bg-yellow-600 hover:bg-yellow-700 text-white px-2 py-1 rounded text-xs" // Changed color for distinction
                      onClick={() => setMultiFileDialog({ changes: multiFile })}
                    >Review Multi-file Changes</button>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSend} className="flex gap-2 p-1 border-t border-gray-800">
        <input
          className="flex-1 rounded bg-gray-800 text-gray-100 px-2 py-1 outline-none"
          placeholder="Ask the AI..."
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading || !apiKey}
        />
        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded" disabled={loading || !apiKey}>
          {loading ? '...' : 'Send'}
        </button>
      </form>
      {multiFileDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded shadow-lg max-w-lg w-full">
            <h2 className="text-lg font-bold mb-2 text-white">Review Multi-file Changes</h2>
            <div className="max-h-64 overflow-y-auto mb-4">
              {multiFileDialog.changes.map((change, idx) => (
                <div key={idx} className="mb-2">
                  <div className="font-mono text-xs text-gray-400">{change.path}</div>
                  <pre className="bg-gray-800 text-green-200 p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap">{change.content}</pre>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs"
                onClick={() => {
                  onApplyMultiFileChange && onApplyMultiFileChange(multiFileDialog.changes);
                  setMultiFileDialog(null);
                }}
              >Apply All</button>
              <button
                className="bg-gray-700 hover:bg-gray-800 text-white px-3 py-1 rounded text-xs"
                onClick={() => setMultiFileDialog(null)}
              >Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 