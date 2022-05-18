// Requiring virtual module generated in-memory by plugin
const swaggerJson = require('swagger.json');
const swaggerUi = require('swagger-ui');
require('swagger-ui/dist/swagger-ui.css');

/**
 * @swagger
 * /api/hello:
 *   get:
 *     description: Returns hello message
 *     parameters:
 *       - name: subject
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 */
function getHello(name) {
  // TODO: Change this with REST API call, when it will be implemented on backend
  return { message: 'Hello ' + name + '!' };
}

var helloDiv = document.getElementById('hello');
helloDiv.innerHTML = getHello('World').message;

swaggerUi({
  spec: swaggerJson, dom_id: '#apiDocs',
  presets: [
    swaggerUi.presets.apis,
    swaggerUi.SwaggerUIStandalonePreset
  ]
});
