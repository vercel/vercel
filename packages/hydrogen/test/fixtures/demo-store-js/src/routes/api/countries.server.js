import {gql} from '@shopify/hydrogen';

export async function api(_request, {queryShop}) {
  const {
    data: {
      localization: {availableCountries},
    },
  } = await queryShop({
    query: COUNTRIES_QUERY,
  });

  return availableCountries.sort((a, b) => a.name.localeCompare(b.name));
}

const COUNTRIES_QUERY = gql`
  query Localization {
    localization {
      availableCountries {
        isoCode
        name
        currency {
          isoCode
        }
      }
    }
  }
`;
