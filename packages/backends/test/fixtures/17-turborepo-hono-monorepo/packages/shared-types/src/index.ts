export interface User {
  id: string;
  name: string;
  email: string;
}

export type ApiResponse<T> = {
  data: T;
  status: number;
};

export const DEFAULT_PAGE_SIZE = 20;
