'use client';

import { useChat } from 'ai/react';
import { useState } from 'react';
import NavBar from '../component/navbar';


export default function Home() {
  const [waitingForAI, setWaitingForAI] = useState<Boolean>(false);
  const { messages, input, handleInputChange, handleSubmit } = useChat();


  return (
    <div>
      <NavBar />
      <div
        style={{height: '70vh', flexDirection: "column-reverse", display: "flex" }}
        
      >
        <>
          {waitingForAI &&
            (
              <div className="loading">
                <img src='/1484.gif'></img>
              </div>
            )}
        </>
        <>
          {messages.length == 0 &&
            (
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <img style={{ width: "25%", marginBottom: "2%" }} src='/MongoDB_White.svg' />
                <span style={{ marginBottom: '2%', fontSize: '40px', justifySelf: 'center' }}>+</span>
                <img style={{ width: "8%", marginBottom: "2%" }} src='/openAI.svg' />
              </div>
            )
          }
        </>
        <div className="pr-4 messages">
          {messages.map(m => (
            <div key={m.id} className="flex gap-3 my-4 text-gray-600 text-sm flex-1">
              <span className="relative flex shrink-0 overflow-hidden rounded-full w-8 h-8" 
                    style={{ margin: '30px', marginTop: '0px' }}>
                <div className="rounded-full bg-gray-100 border p-1">
                  {m.role === 'user' ? (
                    <img src="/user.png" />
                  ) : (
                    <img src="/bot.png" />
                  )}
                </div>
              </span>
              <p className="leading-relaxed" style={{ color: 'aliceblue' }}>
                <span className="block font-bold">{m.role}</span>
                {m.content}
              </p>
            </div>
          ))}

        </div>

        <div className="flex items-center pt-0 chat-window">
          <form className="flex items-center justify-center w-full space-x-2" onSubmit={handleSubmit}>
            <input
              value={input}
              onChange={handleInputChange}
              className="flex h-10 w-full rounded-md border border-[#e5e7eb] px-3 py-2 text-sm placeholder-[#6b7280] focus:outline-none focus:ring-2 focus:ring-[#9ca3af] disabled:cursor-not-allowed disabled:opacity-50 text-[#030712] focus-visible:ring-offset-2"
              placeholder="Ask what you have in mind"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium text-[#f9fafb] disabled:pointer-events-none disabled:opacity-50 bg-black hover:bg-[#111827E6] h-10 px-4 py-2"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
