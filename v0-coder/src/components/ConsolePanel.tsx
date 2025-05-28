import React, { useEffect, useRef, useState } from 'react';

interface LogMessage {
  type: string;
  message: string;
}

export default function ConsolePanel() {
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.host}/api/logs`);
    ws.onmessage = (event) => {
      try {
        const data: LogMessage = JSON.parse(event.data);
        if (data.type === 'log') {
          setLogs((prev) => [...prev, data.message]);
        }
      } catch (e) {
        // Ignore malformed messages
      }
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="h-full w-full font-mono text-xs bg-gray-900 text-green-400 overflow-y-auto p-2">
      {logs.map((log, i) => (
        <div key={i}>{log}</div>
      ))}
      <div ref={logsEndRef} />
    </div>
  );
} 