import React, { useEffect, useState } from 'react';
import { RouterTypes } from 'umi';

const App: React.SFC<RouterTypes> = () => {
  const [date, setDate] = useState(null);
  useEffect(() => {
    async function getDate() {
      const res = await fetch('/api/date');
      const newDate = await res.text();
      setDate(newDate);
    }
    getDate();
  }, []);
  return (
    <main>
      <h1>UmiJS + Node.js API</h1>
      <h2>
        Deployed with{' '}
        <a
          href="https://vercel.com/docs"
          target="_blank"
          rel="noreferrer noopener"
        >
          Vercel
        </a>
        !
      </h2>
      <p>
        This project is a <a href="https://umijs.org/">UmiJS</a> app with two directories,{' '}
        <code>/pages</code> for content and components, and <code>/api</code>{' '}
        which contains a serverless <a href="https://nodejs.org/en/">Node.js</a>{' '}
        function. See{' '}
        <a href="/api/date">
          <code>api/date</code> for the Date API with Node.js
        </a>
        .
      </p>
      <br />
      <h2>The date according to Node.js is:</h2>
      <p>{date ? date : 'Loading date...'}</p>
    </main>
  );
};

export default App;
