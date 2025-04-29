/**
 * Type declarations for the global fetch API in Node.js 18+
 *
 * These types are simplified versions of the native fetch API types
 * to provide compatibility with the previous node-fetch implementation.
 */

export interface HeadersInit {
  [key: string]: string | string[];
}

export interface Headers {
  append(name: string, value: string): void;
  delete(name: string): void;
  get(name: string): string | null;
  has(name: string): boolean;
  set(name: string, value: string): void;
  forEach(callback: (value: string, name: string) => void): void;
}

export interface Request {
  readonly headers: Headers;
  readonly method: string;
  readonly url: string;
  readonly body: ReadableStream | null;
}

export interface RequestInit {
  body?: BodyInit;
  headers?: HeadersInit;
  method?: string;
  redirect?: string;
  signal?: AbortSignal;
  agent?: any;
}

export interface Response {
  readonly headers: Headers;
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly body: ReadableStream | null;
  json(): Promise<any>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type BodyInit =
  | string
  | ArrayBuffer
  | ArrayBufferView
  | ReadableStream
  | null;

// @ts-ignore - Using native fetch API from Node.js 18+
export const fetch = (global as any).fetch;

export class Headers implements Headers {
  private headers: Record<string, string> = {};

  constructor(init?: HeadersInit) {
    if (init) {
      Object.entries(init).forEach(([key, value]) => {
        this.set(key, Array.isArray(value) ? value.join(', ') : value);
      });
    }
  }

  append(name: string, value: string): void {
    const existing = this.get(name);
    if (existing) {
      this.set(name, `${existing}, ${value}`);
    } else {
      this.set(name, value);
    }
  }

  delete(name: string): void {
    delete this.headers[name.toLowerCase()];
  }

  get(name: string): string | null {
    return this.headers[name.toLowerCase()] || null;
  }

  has(name: string): boolean {
    return name.toLowerCase() in this.headers;
  }

  set(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }

  forEach(callback: (value: string, name: string) => void): void {
    Object.entries(this.headers).forEach(([name, value]) => {
      callback(value, name);
    });
  }

  toJSON(): Record<string, string> {
    return { ...this.headers };
  }
}
