import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export default async function Page() {
  async function serverAction() {
    'use server';
    await new Promise(resolve => setTimeout(resolve, 1000));
    revalidatePath('/dynamic');
  }

  return (
    <form action={serverAction}>
      <button>Submit</button>
    </form>
  );
}
