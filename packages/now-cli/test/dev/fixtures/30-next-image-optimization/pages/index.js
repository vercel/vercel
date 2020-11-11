import Image from 'next/image';

export default function Home() {
  return (
    <>
      <h1>Home Page</h1>
      <Image src="/logo.png" width="500" height="500" />
      <hr />
      <img src="/logo.png" />
    </>
  );
}
