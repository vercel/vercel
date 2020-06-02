import { v, create } from '@dojo/framework/core/vdom';

import * as css from './styles/Profile.m.css';

export interface ProfileProperties {
	username: string;
}

const factory = create().properties<ProfileProperties>();

export default factory(function Profile({ properties }) {
	const { username } = properties();
	return v('h1', { classes: [css.root] }, [`Welcome ${username}!`]);
});
