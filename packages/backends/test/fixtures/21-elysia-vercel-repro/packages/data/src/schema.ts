import { tableName } from './database/columns';
import type { UserRole } from '@repro/shared/userHelpers';

export const UserTable = tableName('User');

export interface User {
  id: string;
  email: string | null;
  password: string | null;
  roles: UserRole[] | null;
  createdAt: Date;
  updatedAt: Date;
  deleted: boolean;
}

export type NewUser = Partial<User> & { id: string };
