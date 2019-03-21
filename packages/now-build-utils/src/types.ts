export interface File {
  type: string;
  mode: number;
  toStream: () => NodeJS.ReadableStream;
}

export interface Files {
  [filePath: string]: File
}