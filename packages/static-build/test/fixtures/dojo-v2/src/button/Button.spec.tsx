const { describe, it } = intern.getInterface('bdd');
import { tsx } from '@dojo/framework/core/vdom';
import renderer, { assertion } from '@dojo/framework/testing/renderer';

import Button from './Button';
import * as css from '../theme/default/Button.m.css';

const baseAssertion = assertion(() => {
	return (
		<button classes={[css.root, undefined]} onclick={() => {}}>Click Me!</button>
	);
});

describe('Button', () => {
	it('render', () => {
		const r = renderer(() => <Button onClick={() => {}}>Click Me!</Button>);
		r.expect(baseAssertion);
	});
});
