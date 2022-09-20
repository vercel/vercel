const Home = () => {
  return (
    <div>
      <h1>Legacy Peer Dependencies</h1>
      <p>
        This project contains invalid Peer Dependencies that were generated
        using <code>npm install --legacy-peer-deps</code> on npm@8.5.5 and
        subsequent <code>npm install</code> would work.
      </p>
      <p>
        However, once bumping to npm@8.6.0, running <code>npm install</code>{' '}
        will fail with <code>Conflicting peer dependency: react@18.2.0</code>.
      </p>
      <p>
        So the solution is to try <code>npm install</code> and if there was a
        failure, retry with <code>npm install --legacy-peer-deps</code>.
      </p>
    </div>
  );
};
