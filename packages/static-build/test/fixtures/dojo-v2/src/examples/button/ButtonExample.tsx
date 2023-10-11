import { create, tsx } from '@dojo/framework/core/vdom';
import Button from '../../button/Button';

const factory = create();

export default factory(function ButtonExample() {
	return <Button onClick={() => console.log('clicked')}>Click Me</Button>;
});
