import { db } from '../database/database';
import { UserTable, type User } from '../schema';

export const getUserById = async (id: string): Promise<User | null> => {
  const result = await db().execute(
    `SELECT * FROM \`${UserTable}\` WHERE id = ? LIMIT 1`,
    [id],
  );
  return (result.rows[0] as User | undefined) ?? null;
};

export const getUserByEmail = async (email: string): Promise<User | null> => {
  const result = await db().execute(
    `SELECT * FROM \`${UserTable}\` WHERE email = ? LIMIT 1`,
    [email],
  );
  return (result.rows[0] as User | undefined) ?? null;
};
