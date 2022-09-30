import fs from 'fs';
import path from 'path';

export default function Page({ foo }) {
  return (
    <>
      <p>hello from pages {foo}</p>
    </>
  );
}

export async function getServerSideProps() {
  const dataFile = path.join(process.cwd(), 'data', 'strings.json');
  const strings = JSON.parse(fs.readFileSync(dataFile));
  return {
    props: strings,
  };
}
