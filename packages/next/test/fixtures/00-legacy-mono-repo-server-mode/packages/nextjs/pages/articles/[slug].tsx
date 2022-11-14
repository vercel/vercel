import { GetStaticProps, GetStaticPaths, NextPage } from "next";

import { getArticleBySlug } from "../../server";

type Props = {
  article: { slug: string; name: string };
};

const ArticlePage: NextPage<Props> = ({ article }) => {
  return <h1>{article.name}</h1>;
};

export const getStaticProps: GetStaticProps = async ({ params: { slug } }) => {
  const article = await getArticleBySlug(slug as string);

  if (!article) {
    console.log("returning notFound for", { slug });
    return {
      notFound: true,
    };
  }

  return {
    props: {
      article,
    },
  };
};

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: [],
  fallback: "blocking",
});

export default ArticlePage;
