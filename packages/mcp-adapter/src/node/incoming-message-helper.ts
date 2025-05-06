import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';

/**
 * Converts a Node.js IncomingMessage to a standard Fetch API Request object
 * @param incomingMessage - The Node.js IncomingMessage object to convert
 * @returns A standard Request object
 */
export function incomingMessageToRequest(
  incomingMessage: IncomingMessage
): Request {
  // Extract URL from the incoming message
  const url = new URL(
    incomingMessage.url || '',
    `${incomingMessage.headers.host ? `http://${incomingMessage.headers.host}` : 'http://localhost'}`
  );

  // Convert headers from IncomingMessage to Headers object
  const headers = new Headers();
  for (const [key, value] of Object.entries(incomingMessage.headers)) {
    if (value !== undefined) {
      headers.append(key, Array.isArray(value) ? value.join(', ') : value);
    }
  }

  // Create options for the Request
  const options: RequestInit = {
    method: incomingMessage.method || 'GET',
    headers: headers,
    // Convert the IncomingMessage stream to a ReadableStream for the body
    body: incomingMessage.readable
      ? (Readable.toWeb(incomingMessage) as ReadableStream)
      : undefined,
  };

  // Create and return the Request object
  return new Request(url.toString(), options);
}
