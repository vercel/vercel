import Link from "next/link";

export default function Page() {
  return (
    <div>
      <p>index page</p>
      <Link href="/about/">Go to about</Link>
    </div>
  );
}
