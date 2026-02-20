import { Hono } from 'hono';
import sharp from 'sharp';

const app = new Hono();

// Get Sharp version/format info to verify native bindings work
app.get('/', async (c) => {
  const formats = sharp.format;
  const version = sharp.versions;
  return c.json({
    message: 'Sharp native bindings loaded successfully',
    sharpVersion: version,
    supportedFormats: Object.keys(formats),
  });
});

// Generate a simple 100x100 red PNG image
app.get('/image', async (c) => {
  const image = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();

  return new Response(image, {
    headers: {
      'Content-Type': 'image/png',
    },
  });
});

// Resize endpoint - takes width/height query params
app.get('/resize', async (c) => {
  const width = parseInt(c.req.query('width') || '50');
  const height = parseInt(c.req.query('height') || '50');

  const image = await sharp({
    create: {
      width: 200,
      height: 200,
      channels: 4,
      background: { r: 0, g: 128, b: 255, alpha: 1 },
    },
  })
    .resize(width, height)
    .png()
    .toBuffer();

  return new Response(image, {
    headers: {
      'Content-Type': 'image/png',
    },
  });
});

export default app;
