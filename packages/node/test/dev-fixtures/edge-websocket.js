/* eslint-disable -- flakey application of `global TextEncoderStream, ReadableStream, Response, WebSocket` eslint directive */

export const config = { runtime: 'edge' };

const createWebSocket = url =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = reject;
  });

let data = [...Array(4).keys()];

export default async () => {
  const ws = await createWebSocket('wss://ws.postman-echo.com/raw');
  const interval = 100;
  let timer;

  const end = controller => {
    clearInterval(timer);
    setTimeout(() => {
      controller.close();
      ws.close();
    }, interval);
  };

  const readable = new ReadableStream({
    async start(controller) {
      ws.onmessage = ({ data }) => controller.enqueue(data);
      timer = setInterval(() => {
        const value = data.pop();
        if (value === undefined) return end(controller);
        ws.send(value);
      }, interval);
    },
    cancel() {
      clearInterval(timer);
    },
  }).pipeThrough(new TextEncoderStream());

  return new Response(readable);
};
