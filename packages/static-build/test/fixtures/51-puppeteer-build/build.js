const puppeteer = require('puppeteer');
const { promises } = require('fs');
const { mkdir, writeFile } = promises;

(async () => {
  await mkdir('./public');
  const args = ['--no-sandbox', '--disable-setuid-sandbox'];
  const browser = await puppeteer.launch({ args });
  const page = await browser.newPage();
  await page.goto('https://vercel.com/docs', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: './public/about.png' });
  const metrics = await page.metrics();
  await writeFile('./public/index.json', JSON.stringify(metrics), 'utf8');
  browser.close();
})();
