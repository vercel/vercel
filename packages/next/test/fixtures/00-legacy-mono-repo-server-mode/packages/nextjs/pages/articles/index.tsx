import { NextPage } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";

import { getAllArticles } from "../../server";

const LocalOffers: NextPage = () => {
  const [articles, setArticles] = useState<any>([]);
  useEffect(() => {
    getAllArticles().then((res) => {
      setArticles(res);
    });
  }, []);
  if (!articles.length) {
    return <p>Loading...</p>;
  }
  return (
    <ul>
      {articles.map((o) => (
        <li>
          <Link href={`/articles/${o.slug}`} passHref>
            <a>{o.name}</a>
          </Link>
        </li>
      ))}
    </ul>
  );
};

export default LocalOffers;
