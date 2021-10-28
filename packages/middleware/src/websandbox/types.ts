export interface NodeHeaders {
  [header: string]: string | string[] | undefined;
}

export interface RequestData {
  geo?: {
    city?: string;
    country?: string;
    region?: string;
  };
  headers: NodeHeaders;
  ip?: string;
  method: string;
  page?: {
    name?: string;
    params?: { [key: string]: string };
  };
  url: string;
}

export interface FetchEventResult {
  response: Response;
  waitUntil: Promise<any>;
}
