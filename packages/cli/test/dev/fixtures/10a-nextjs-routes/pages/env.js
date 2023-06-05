function Env() {
  return (
    <main>
      <p>
        NEXT_PUBLIC_VERCEL_ENV: {process.env.NEXT_PUBLIC_VERCEL_ENV}
      </p>
      <p>
        NEXT_PUBLIC_VERCEL_URL: {process.env.NEXT_PUBLIC_VERCEL_URL}
      </p>
    </main>
  );
}

export default Env;
