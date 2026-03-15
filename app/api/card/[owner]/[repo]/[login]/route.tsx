import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export const maxDuration = 30;

async function launchBrowser() {
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: {
      width: 800,
      height: 600,
      deviceScaleFactor: 2,
    },
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ owner: string; repo: string; login: string }> }
) {
  const { owner, repo, login } = await params;

  // Build the URL to the render page
  const url = new URL(request.url);
  const origin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : `${url.protocol}//${url.host}`;
  const renderUrl = `${origin}/card-render/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(login)}`;

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    const response = await page.goto(renderUrl, {
      waitUntil: 'networkidle0',
      timeout: 15000,
    });

    // If the render page returned 404, the card doesn't exist
    if (!response || response.status() === 404) {
      return new Response('Card not found', { status: 404 });
    }

    // Wait for images to load and the data-ready attribute to appear
    await page.waitForSelector('[data-ready]', { timeout: 10000 });

    // Screenshot just the card wrapper element
    const cardElement = await page.$('#card-wrapper');
    if (!cardElement) {
      return new Response('Card element not found', { status: 500 });
    }

    const screenshot = await cardElement.screenshot({
      type: 'png',
      omitBackground: true,
    });

    const buffer = Buffer.from(screenshot);
    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('Card screenshot error:', error);
    return new Response('Failed to generate card image', { status: 500 });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
