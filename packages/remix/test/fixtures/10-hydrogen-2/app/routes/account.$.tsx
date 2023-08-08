import type {LoaderArgs} from '@shopify/remix-oxygen';
import {redirect} from '@shopify/remix-oxygen';

export async function loader({context}: LoaderArgs) {
  if (await context.session.get('customerAccessToken')) {
    return redirect('/account');
  }
  return redirect('/account/login');
}
