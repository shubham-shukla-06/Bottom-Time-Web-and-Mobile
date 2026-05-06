const { test, expect } = require('@playwright/test');

const EMAIL = process.env.TEST_EMAIL || 'test@bottomtime.com';
const PHONE = process.env.TEST_PHONE || '+919876543210';
const OTP = process.env.TEST_OTP || '123456';

const apiRequest = async (request, url, payload) => {
  return request.post(url, {
    data: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  });
};

test('authenticated routes load', async ({ page, request, baseURL }) => {
  const apiUrl = process.env.BACKEND_URL || baseURL;

  const emailVerify = await apiRequest(request, `${apiUrl}/api/auth/verify-otp`, {
    identifier: EMAIL,
    code: OTP,
  });
  const phoneVerify = await apiRequest(request, `${apiUrl}/api/auth/verify-otp`, {
    identifier: PHONE,
    code: OTP,
  });

  expect(emailVerify.ok()).toBeTruthy();
  expect(phoneVerify.ok()).toBeTruthy();

  const emailToken = (await emailVerify.json()).verification_token;
  const phoneToken = (await phoneVerify.json()).verification_token;

  const loginRes = await apiRequest(request, `${apiUrl}/api/auth/login-complete`, {
    email: EMAIL,
    email_verified_token: emailToken,
    phone_verified_token: phoneToken,
  });
  expect(loginRes.ok()).toBeTruthy();
  const accessToken = (await loginRes.json()).access_token;
  expect(accessToken).toBeTruthy();

  await page.addInitScript((token) => {
    window.sessionStorage.setItem('token', token);
  }, accessToken);

  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = '* { transition: none !important; animation: none !important; }';
    document.head.appendChild(style);
  });

  await page.goto('/dashboard', { wait_until: 'domcontentloaded' });
  await expect(page.getByTestId('dive-dashboard')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot('dashboard.png');

  await page.goto('/community', { wait_until: 'domcontentloaded' });
  await expect(page.getByTestId('connect-page')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot('community.png');

  await page.goto('/discover', { wait_until: 'domcontentloaded' });
  await expect(page.getByTestId('discover-page')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot('discover.png');

  await page.goto('/shop', { wait_until: 'domcontentloaded' });
  await expect(page.getByTestId('shop-page')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot('shop.png');

  await page.goto('/trips', { wait_until: 'domcontentloaded' });
  await expect(page.getByTestId('trip-planner-page')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot('trips.png');
});
