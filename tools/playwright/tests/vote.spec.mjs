import { test, expect } from '@playwright/test';
import { seed } from '../../../tools/seedPublicElection.mjs';
import admin from 'firebase-admin';
import fs from 'fs';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'evotepro-7deff';

test.beforeAll(async () => {
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  admin.initializeApp({ projectId: PROJECT_ID });
});

test.describe('Public voting flows', () => {
  let seedData;

  test.beforeAll(async () => {
    seedData = await seed({ inviteCount: 20 });
    // write seed for debugging
    fs.writeFileSync('tools/playwright/results/seed.json', JSON.stringify(seedData, null, 2));
  });

  test('Desktop: normal vote flow', async ({ page }) => {
    const token = seedData.invites[0];
    const url = `${BASE}/vote/${seedData.PUBLIC_CODE}`;
    await page.goto(url);
    // wait for frontend data+auth readiness marker
    await page.waitForFunction(() => !!document.querySelector('#public-vote-ready[data-ready="true"]'), null, { timeout: 30000 });
    // fill by label/placeholder used in the app
    await page.getByLabel('Invite token').fill(token);
    await page.getByRole('button', { name: /Validate token/i }).click();
    await page.getByRole('button', { name: /E2E Candidate/i }).click();
    // wait until Cast Vote is enabled
    const castBtn = page.getByRole('button', { name: /Cast Vote/i });
    await expect(castBtn).toBeEnabled({ timeout: 10000 });
    await castBtn.click();
    await expect(page.getByText('Vote recorded')).toBeVisible({ timeout: 10000 });

    // verify in admin DB
    const db = admin.firestore();
    const invite = await db.doc(`publicElections/${seedData.PUBLIC_CODE}/invites/${token}`).get();
    expect(invite.exists).toBeTruthy();
    expect(invite.data().used).toBeTruthy();
  });

  test('Mobile: slow network and refresh during vote', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const token = seedData.invites[1];
    const url = `${BASE}/vote/${seedData.PUBLIC_CODE}`;

    // add global delay to simulate latency
    await page.route('**/*', async (route) => {
      await new Promise((r) => setTimeout(r, 250));
      await route.continue();
    });

    await page.goto(url);
    await page.waitForFunction(() => !!document.querySelector('#public-vote-ready[data-ready="true"]'), null, { timeout: 30000 });
    await page.getByPlaceholder('Enter the token you received').fill(token);
    await page.getByRole('button', { name: /Validate token/i }).click();
    await page.waitForSelector('text=Token verified', { timeout: 10000 });
    await page.getByRole('button', { name: /E2E Candidate/i }).click();

    // refresh right before casting
    await page.reload();
    await page.getByRole('button', { name: /E2E Candidate/i }).click();
    const castBtn = page.getByRole('button', { name: /Cast Vote/i });
    await expect(castBtn).toBeEnabled();
    await castBtn.click();
    await expect(page.getByText('Vote recorded')).toBeVisible();
    await context.close();
  });

  test('Offline then online retry', async ({ page }) => {
    const token = seedData.invites[2];
    const url = `${BASE}/vote/${seedData.PUBLIC_CODE}`;
    await page.goto(url);
    await page.waitForFunction(() => !!document.querySelector('#public-vote-ready[data-ready="true"]'), null, { timeout: 30000 });
    await page.getByLabel('Invite token').fill(token);
    await page.getByRole('button', { name: /Validate token/i }).click();
    await page.getByRole('button', { name: /E2E Candidate/i }).click();
    await expect(page.getByRole('button', { name: /Cast Vote/i })).toBeEnabled();

    // simulate offline and attempt to cast
    await page.context().setOffline(true);
    await page.getByRole('button', { name: /Cast Vote/i }).click();
    // expect an error area to be visible
    await expect(page.getByText(/Failed to cast vote|Unable to validate|network/i)).toBeVisible();

    // go online and retry by clicking Cast Vote again
    await page.context().setOffline(false);
    await page.getByRole('button', { name: /Cast Vote/i }).click();
    await expect(page.getByText('Vote recorded')).toBeVisible();
  });

  test('Duplicate token attempt should fail second time', async ({ page }) => {
    const token = seedData.invites[3];
    const url = `${BASE}/vote/${seedData.PUBLIC_CODE}`;
    await page.goto(url);
    await page.waitForFunction(() => !!document.querySelector('#public-vote-ready[data-ready="true"]'), null, { timeout: 30000 });
    await page.getByLabel('Invite token').fill(token);
    await page.getByRole('button', { name: /Validate token/i }).click();
    await page.getByRole('button', { name: /E2E Candidate/i }).click();
    await expect(page.getByRole('button', { name: /Cast Vote/i })).toBeEnabled();
    await page.getByRole('button', { name: /Cast Vote/i }).click();
    await expect(page.getByText('Vote recorded')).toBeVisible();

    // second attempt should show token used message
    await page.goto(url);
    await page.getByLabel('Invite token').fill(token);
    await page.getByRole('button', { name: /Validate token/i }).click();
    await expect(page.getByText('This invite token has already been used.')).toBeVisible();
  });

  test('Revoked/invalid token handling', async ({ page }) => {
    const invalid = 'INVALID-TOKEN-XYZ';
    const url = `${BASE}/vote/${seedData.PUBLIC_CODE}`;
    await page.goto(url);
    await page.waitForFunction(() => !!document.querySelector('#public-vote-ready[data-ready="true"]'), null, { timeout: 30000 });
    await page.getByLabel('Invite token').fill(invalid);
    await page.getByRole('button', { name: /Validate token/i }).click();
    await expect(page.getByText(/Invalid invite token|Election not found/)).toBeVisible();
  });

  test('Concurrent session voting (multiple tokens)', async ({ browser }) => {
    const tokens = seedData.invites.slice(5, 10);
    const contexts = await Promise.all(tokens.map(() => browser.newContext()));
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    const url = `${BASE}/vote/${seedData.PUBLIC_CODE}`;

    await Promise.all(pages.map((p, i) => p.goto(url)));
    await Promise.all(pages.map((p) => p.waitForFunction(() => !!document.querySelector('#public-vote-ready[data-ready="true"]'), null, { timeout: 30000 })));
    await Promise.all(pages.map((p, i) => p.getByLabel('Invite token').fill(tokens[i])));
    await Promise.all(pages.map((p) => p.getByRole('button', { name: /Validate token/i }).click()));
    await Promise.all(pages.map((p) => p.getByRole('button', { name: /E2E Candidate/i }).click()));
    for (const page of pages) {
      const castBtn = page.getByRole('button', { name: /Cast Vote/i });
      await expect(castBtn).toBeEnabled({ timeout: 15000 });
      await castBtn.click();
      await expect(page.getByText('Vote recorded')).toBeVisible({ timeout: 15000 });
    }

    await Promise.all(contexts.map((c) => c.close()));
  });
});
