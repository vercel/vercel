import Image from 'next/image';

export default function Home() {
  return (
    <>
      <h1>Home Page</h1>
      <hr />
      <h2>Optimized</h2>
      <Image src="/test.png" width="400" height="400" />
      <hr />
      <h2>Original</h2>
      <img src="/test.png" width="400" height="400" />
    </>
  );
}
