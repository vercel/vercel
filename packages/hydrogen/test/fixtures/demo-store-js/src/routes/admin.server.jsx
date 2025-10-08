import {useShopQuery, gql, CacheLong} from '@shopify/hydrogen';

/*
  This route redirects you to your Shopify Admin
  by querying for your myshopify.com domain.
  Learn more about the redirect method here:
  https://developer.mozilla.org/en-US/docs/Web/API/Response/redirect
*/

export default function AdminRedirect({response}) {
  const {data} = useShopQuery({
    query: SHOP_QUERY,
    cache: CacheLong(),
  });

  const {url} = data.shop.primaryDomain;
  return response.redirect(`${url}/admin`);
}

const SHOP_QUERY = gql`
  query {
    shop {
      primaryDomain {
        url
      }
    }
  }
`;
