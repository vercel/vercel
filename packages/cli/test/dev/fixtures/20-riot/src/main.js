import '@riotjs/hot-reload';
import { component } from 'riot';
import Random from './random.riot';

component(Random)(document.getElementById('app'), {
  title: 'Hi there!'
});
