export default function Home() {
  return (
    <main>
      <h1>Next.js + Python API Repro</h1>
      <p>
        This project reproduces the <code>spawn /usr/local/bin/uv ENOENT</code>{' '}
        error when the Python runtime tries to install vercel-runtime.
      </p>
      <ul>
        <li>
          <a href="/api/hello">GET /api/hello</a> (Python API route)
        </li>
      </ul>
    </main>
  );
}
