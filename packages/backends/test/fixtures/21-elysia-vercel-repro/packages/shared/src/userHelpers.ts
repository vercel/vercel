export type UserRole = 'admin' | 'user' | 'support';

export const isAdmin = (roles: UserRole[] | null | undefined): boolean =>
  roles?.includes('admin') ?? false;
