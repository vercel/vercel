import {gql} from '@shopify/hydrogen';
import type {HydrogenApiRouteOptions, HydrogenRequest} from '@shopify/hydrogen';
import type {Localization} from '@shopify/hydrogen/storefront-api-types';

export async function api(
  _request: HydrogenRequest,
  {queryShop}: HydrogenApiRouteOptions,
) {
  const {
    data: {
      localization: {availableCountries},
    },
  } = await queryShop<{
    localization: Localization;
  }>({
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
