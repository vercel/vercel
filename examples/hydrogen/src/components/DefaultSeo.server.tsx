import {CacheLong, gql, Seo, useShopQuery} from '@shopify/hydrogen';

/**
 * A server component that fetches a `shop.name` and sets default values and templates for every page on a website
 */
export function DefaultSeo() {
  const {
    data: {
      shop: {name, description},
    },
  } = useShopQuery({
    query: SHOP_QUERY,
    cache: CacheLong(),
    preload: '*',
  });

  return (
    // @ts-ignore TODO: Fix types
    <Seo
      type="defaultSeo"
      data={{
        title: name,
        description,
        titleTemplate: `%s · ${name}`,
      }}
    />
  );
}

const SHOP_QUERY = gql`
  query shopInfo {
    shop {
      name
      description
    }
  }
`;
