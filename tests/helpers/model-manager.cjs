const assert = require('node:assert/strict');

async function editActiveModel(page, options = {}) {
  await page.locator('[data-view="settings"]').click();
  await page.locator('.model-profile-row.is-active .edit-model-profile').click();
  for (const [key, selector] of [
    ['baseUrl', '#profile-baseUrl'],
    ['model', '#profile-model'],
    ['name', '#profile-name'],
  ]) {
    if (options[key] !== undefined) await page.locator(selector).fill(options[key]);
  }
  if (Object.hasOwn(options, 'apiKey')) {
    if (await page.locator('#profile-apiKey').evaluate((input) => input.readOnly)) {
      await page.locator('#replace-profile-apiKey').click();
    }
    await page.locator('#profile-apiKey').fill(options.apiKey);
  }
  if (
    options.demoMode !== undefined &&
    (await page.locator('#profile-demoMode').isChecked()) !== options.demoMode
  ) {
    await page.locator('label:has(#profile-demoMode)').click();
  }
  await page.locator(options.test ? '#save-test-model-profile' : '#save-model-profile').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#model-profile-dialog')?.open === false &&
      document.querySelector('#add-model-profile')?.disabled === false,
  );
}

async function assertSavedModelKey(page) {
  await page.locator('.model-profile-row.is-active .edit-model-profile').click();
  const input = page.locator('#profile-apiKey');
  assert.equal(await input.inputValue(), '••••••••••••••••');
  assert.equal(await input.evaluate((element) => element.readOnly), true);
  await page.locator('#replace-profile-apiKey').click();
  assert.equal(await input.inputValue(), '');
  await page.locator('#replace-profile-apiKey').click();
  assert.equal(await input.inputValue(), '••••••••••••••••');
  await page.locator('#cancel-model-profile').click();
}

async function verifyActiveModel(page) {
  await page.locator('.model-profile-row.is-active .test-model-profile').click();
  await page.waitForFunction(
    () =>
      document.querySelector('.model-profile-row.is-active .test-model-profile')?.disabled ===
      false,
  );
}

module.exports = { editActiveModel, assertSavedModelKey, verifyActiveModel };
