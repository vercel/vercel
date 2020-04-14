import sirv from 'sirv';
import polka from 'polka';
import compression from 'compression';
import * as sapper from '@sapper/server';

console.log('imports done')

const { PORT, NODE_ENV } = process.env;
const dev = NODE_ENV === 'development';

const app = polka() // You can also use Express
	.use(
		compression({ threshold: 0 }),
		sirv('static', { dev }),
		sapper.middleware()
  )
  
console.log('PORT is', PORT)

app.listen(PORT, err => {
  if (err) console.log('error', err);
})
  
export default app.handler
