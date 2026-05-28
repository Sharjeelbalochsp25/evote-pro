#!/usr/bin/env node
import { chromium } from 'playwright';

const baseUrl = process.env.PROD_URL || 'https://evotepro-7deff.web.app';
const publicCode = process.env.PROD_TEST_PUBLIC_CODE;
const token = process.env.PROD_TEST_TOKEN;

function fail(message) {
  throw new Error(message);
}

async function main() {
  if (!publicCode || !token) {
    fail('PROD_TEST_PUBLIC_CODE and PROD_TEST_TOKEN must be set for production smoke');
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

  try {
    const url = `${baseUrl}/vote/${publicCode}`;
    console.log(`[smoke:prod] opening ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#public-vote-ready[data-ready="true"]', { state: 'attached', timeout: 60000 });

    await page.getByLabel('Invite token').fill(token);
    await page.getByRole('button', { name: /Validate token/i }).click();
    await page.getByText('Token verified. You can now cast one vote for this election.').waitFor({ state: 'visible', timeout: 30000 });

    const candidateButtons = page.locator('h2:text("Choose a candidate")').locator('xpath=following-sibling::div[1]//button');
    const candidateCount = await candidateButtons.count();
    if (candidateCount < 1) {
      fail('No candidate cards were available for production smoke');
    }

    await candidateButtons.first().click();
    await page.getByRole('button', { name: /Cast Vote/i }).click();
    await page.getByText('Vote recorded').waitFor({ state: 'visible', timeout: 30000 });

    console.log('[smoke:prod] Vote recorded');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('[smoke:prod] failed:', error?.message || error);
  process.exitCode = 1;
});