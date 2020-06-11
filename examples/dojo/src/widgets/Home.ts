import { v, create } from '@dojo/framework/core/vdom';

import * as css from './styles/Home.m.css';

const factory = create();

export default factory(function Profile() {
	return v('h1', { classes: [css.root] }, ['Home Page']);
});
