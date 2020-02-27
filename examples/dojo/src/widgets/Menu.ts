import { create, w } from '@dojo/framework/core/vdom';
import Link from '@dojo/framework/routing/ActiveLink';
import Toolbar from '@dojo/widgets/toolbar';

import * as css from './styles/Menu.m.css';

const factory = create();

export default factory(function Menu() {
	return w(Toolbar, { heading: 'My Dojo App!', collapseWidth: 600 }, [
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
	]);
});
