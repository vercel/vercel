const { describe, it } = intern.getInterface('bdd');
import harness from '@dojo/framework/testing/harness';
import { w, v } from '@dojo/framework/core/vdom';

import Home from '../../../src/widgets/Home';
import * as css from '../../../src/widgets/styles/Home.m.css';

describe('Home', () => {
	it('default renders correctly', () => {
		const h = harness(() => w(Home, {}));
		h.expect(() => v('h1', { classes: [css.root] }, ['Home Page']));
	});
});
