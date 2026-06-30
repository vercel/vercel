import { Elysia, t } from 'elysia';
import { getUserById } from '@repro/data';

export const users = new Elysia().get(
  '/users/:id',
  async ({ params, set }) => {
    const user = await getUserById(params.id);
    if (!user) {
      set.status = 404;
      return { message: 'NOT_FOUND' as const };
    }
    return { id: user.id, email: user.email };
  },
  {
    params: t.Object({ id: t.String() }),
  },
);
