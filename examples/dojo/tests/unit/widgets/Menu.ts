const { describe, it } = intern.getInterface('bdd');
import harness from '@dojo/framework/testing/harness';
import { w } from '@dojo/framework/core/vdom';
import Link from '@dojo/framework/routing/ActiveLink';
import Toolbar from '@dojo/widgets/toolbar';

import Menu from '../../../src/widgets/Menu';
import * as css from '../../../src/widgets/styles/Menu.m.css';

describe('Menu', () => {
	it('default renders correctly', () => {
		const h = harness(() => w(Menu, {}));
		h.expect(() =>
			w(Toolbar, { heading: 'My Dojo App!', collapseWidth: 600 }, [
				w(
					Link,
					{
						to: 'home',
						classes: [css.link],
						activeClasses: [css.selected]
					},
					['Home']
				),
				w(
					Link,
					{
						to: 'about',
						classes: [css.link],
						activeClasses: [css.selected]
					},
					['About']
				),
				w(
					Link,
					{
						to: 'profile',
						classes: [css.link],
						activeClasses: [css.selected]
					},
					['Profile']
				)
			])
		);
	});
});
