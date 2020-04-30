const { describe, it } = intern.getInterface('bdd');
import harness from '@dojo/framework/testing/harness';
import { w, v } from '@dojo/framework/core/vdom';

import Profile from '../../../src/widgets/Profile';
import * as css from '../../../src/widgets/styles/Profile.m.css';

describe('Profile', () => {
	it('default renders correctly', () => {
		const h = harness(() => w(Profile, { username: 'Dojo User' }));
		h.expect(() => v('h1', { classes: [css.root] }, ['Welcome Dojo User!']));
	});
});
