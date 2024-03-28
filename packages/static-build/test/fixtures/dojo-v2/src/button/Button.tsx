import { create, tsx } from '@dojo/framework/core/vdom';
import theme from '@dojo/framework/core/middleware/theme';

import * as css from '../theme/default/Button.m.css';

export interface ButtonProperties {
	/** Handler for the button click */
	onClick: () => void;
}

const factory = create({ theme }).properties<ButtonProperties>();
export default factory(function Button({ children, properties, middleware: { theme } }) {
	const themedCss = theme.classes(css);
	return <button onclick={() => { properties().onClick(); }} classes={[themedCss.root, theme.variant()]}>{children()}</button>;
});
