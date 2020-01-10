import './service-worker-registration';
import { app } from 'hyperapp';
import actions from './actions/counter';
import state from './states/counter';
import view from './views/counter';

app(state, actions, view, document.body);
