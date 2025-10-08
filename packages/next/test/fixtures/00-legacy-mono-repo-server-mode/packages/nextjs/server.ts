const articleData = [
  { slug: 'one', name: 'article 1' },
  { slug: 'two', name: 'article 2' },
  { slug: 'three', name: 'article 3' },
];

export const getArticleBySlug = (slug: string) =>
  new Promise(resolve => {
    setTimeout(() => {
      const selectedArticle = articleData.find(a => a.slug === slug);
      if (selectedArticle) {
        resolve(selectedArticle);
      } else {
        resolve(null);
      }
    }, 300);
  });

export const getAllArticles = () =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve(articleData);
    }, 300);
  });
