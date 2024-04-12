"use client";
import Link from 'next/link';

const NavBar: React.FC = () => {

  return (
    <nav style={{ backgroundColor: '#00684A', padding: '1rem' }}>
      <ol style={{ listStyleType: 'none', margin: 10, padding: 0 }}>
        <img src='/mongoDB.svg' width={"1%"} style={{ display: 'inline', marginLeft: '1rem' }} />
        <li style={{ display: 'inline', marginLeft: '5rem' }}>
          <Link href="/">
            Home
          </Link>
        </li>
        <li style={{ display: 'inline', marginLeft: '2rem' }}>
          <Link href="/ask">
            QnA
          </Link>
        </li>
        <li style={{ display: 'inline', marginLeft: '2rem' }}>
          <Link href="/teach">
            Train
          </Link>
        </li>
      </ol>
    </nav>
  );
};

export default NavBar;
