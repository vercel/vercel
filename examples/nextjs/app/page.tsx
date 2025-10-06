import React, { useEffect, useState } from "react";

export default function DigitalClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-md p-8 border rounded-2xl shadow-sm">
        <div className="text-center">
          <div className="font-mono text-6xl tracking-tight tabular-nums select-none">
            {time}
          </div>
          <div className="mt-3 text-neutral-500 text-sm select-none">
            {date}
          </div>
        </div>
      </div>
    </div>
  );
}
