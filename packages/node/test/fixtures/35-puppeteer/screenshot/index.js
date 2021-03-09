import chrome from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';

async function getOptions() {
  const options = {
    args: chrome.args,
    executablePath: await chrome.executablePath,
    headless: chrome.headless,
  };
  return options;
}

async function getPage() {
  const options = await getOptions();
  const browser = await puppeteer.launch(options);
  const page = await browser.newPage();
  return page;
}

async function getScreenshot(url) {
  const page = await getPage();
  await page.setViewport({ width: 2048, height: 1170 });
  await page.goto(url);
  const file = await page.screenshot({ type: 'png' });
  return file;
}

module.exports = async (req, res) => {
  const buffer = await getScreenshot('https://vercel.com/about');
  if (buffer.length > 0) {
    res.end('screenshot:RANDOMNESS_PLACEHOLDER');
  } else {
    res.end('buffer is empty');
  }
};
