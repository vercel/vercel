import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from 'fs/promises';

(async () => {
  await mkdir('./public', { recursive: true });
  const args = ['--no-sandbox', '--disable-setuid-sandbox'];
  const browser = await puppeteer.launch({
    args: [...args, ...chromium.args],
    executablePath: await chromium.executablePath()
  });
  const page = await browser.newPage();
  await page.goto('https://example.vercel.sh', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: './public/about.png' });
  const metrics = await page.metrics();
  await writeFile('./public/index.json', JSON.stringify(metrics), 'utf8');
  browser.close();
})();
