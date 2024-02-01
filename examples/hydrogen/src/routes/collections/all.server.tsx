import {type HydrogenRouteProps} from '@shopify/hydrogen';

export default function Redirect({response}: HydrogenRouteProps) {
  return response.redirect('/products');
}
