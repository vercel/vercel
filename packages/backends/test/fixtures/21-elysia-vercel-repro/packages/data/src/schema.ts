import { cols, DEFAULT_DATETIME_VALUE } from './database/columns';
import { createId } from './helpers/createId';
import type { UserRole } from '@repro/shared/userHelpers';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export const UserTable = cols.table(
  'User',
  {
    id: cols.cuid('id').primaryKey().$defaultFn(createId),
    email: cols.defaultVarchar('email'),
    password: cols.defaultVarchar('password'),
    roles: cols.json('roles').$type<UserRole[]>(),
    createdAt: cols
      .datetime('createdAt')
      .notNull()
      .default(DEFAULT_DATETIME_VALUE),
    updatedAt: cols
      .datetime('updatedAt')
      .notNull()
      .default(DEFAULT_DATETIME_VALUE)
      .$onUpdate(() => new Date()),
    deleted: cols.boolean('deleted').default(false).notNull(),
  },
  table => ({
    emailKey: cols.uniqueIndex('User_email_key').on(table.email),
  }),
);
export type User = InferSelectModel<typeof UserTable>;
export type NewUser = InferInsertModel<typeof UserTable>;
