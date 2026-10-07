import { expect, test, type Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:3000/api';
const PRODUCT = 'Morral urbano';

const CARDS = { approved: '4242424242424242', declined: '4111111111111111', mastercard: '5555555555554444' };

const product = (page: Page) => page.locator('article').filter({ hasText: PRODUCT });

async function stockOf(page: Page): Promise<number> {
  const res = await page.request.get(`${API_URL}/products`);
  const items: { name: string; stock: number }[] = await res.json();
  return items.find((p) => p.name === PRODUCT)!.stock;
}

async function openPayment(page: Page) {
  await page.goto('/');
  await product(page).getByRole('button', { name: 'Pagar con tarjeta de crédito' }).click();
  await expect(page.getByRole('dialog', { name: 'Pago con tarjeta' })).toBeVisible();
}

async function fillForm(page: Page, card: string) {
  const values: [string, string][] = [
    ['Número de tarjeta', card],
    ['Nombre en la tarjeta', 'Ana Perez'],
    ['Vence (MM/AA)', '0830'],
    ['CVC', '123'],
    ['Nombre completo', 'Ana Pérez'],
    ['Email', 'ana@test.com'],
    ['Teléfono', '3001234567'],
    ['Dirección', 'Calle 10 # 20-30'],
    ['Ciudad', 'Bogotá'],
    ['Departamento', 'Cundinamarca'],
  ];
  for (const [label, value] of values) {
    const input = page.getByLabel(label, { exact: false }).first();
    await input.fill('');
    await input.pressSequentially(value);
  }
}

async function goToSummary(page: Page, card: string) {
  await openPayment(page);
  await fillForm(page, card);
  await page.getByRole('button', { name: 'Continuar' }).click();
  const summary = page.getByRole('dialog', { name: 'Resumen de pago' });
  await expect(summary).toBeVisible({ timeout: 60_000 });
  return summary;
}

async function pay(page: Page, card: string) {
  const summary = await goToSummary(page, card);
  await summary.getByRole('checkbox').check();
  await summary.getByRole('button', { name: /Pagar/ }).click();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('muestra los productos con precio y stock, sin desbordes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('article')).toHaveCount(3);
  await expect(product(page).getByText(/\$\s?125\.000/)).toBeVisible();
  await expect(product(page).getByText(/\d+ disponibles/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('valida la tarjeta y los datos de entrega antes de enviar', async ({ page }) => {
  await openPayment(page);
  await page.getByLabel('Número de tarjeta').pressSequentially('4242424242424241');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Número de tarjeta inválido')).toBeVisible();
  await expect(page.getByText('Ingresa tu nombre completo')).toBeVisible();
  await expect(page.getByText('Email inválido')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('detecta VISA y MasterCard mientras se escribe', async ({ page }) => {
  await openPayment(page);
  const number = page.getByLabel('Número de tarjeta');
  await number.pressSequentially(CARDS.approved);
  await expect(number).toHaveValue('4242 4242 4242 4242');
  await expect(page.getByRole('img', { name: 'VISA' })).toBeVisible();
  await number.fill('');
  await number.pressSequentially(CARDS.mastercard);
  await expect(page.getByRole('img', { name: 'MasterCard' })).toBeVisible();
});

test('se cierra con Escape y vuelve a la tienda', async ({ page }) => {
  await openPayment(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(product(page)).toBeVisible();
});

test('compra aprobada: descuenta el stock', async ({ page }) => {
  const before = await stockOf(page);
  const summary = await goToSummary(page, CARDS.approved);
  await expect(summary.getByText('Tarifa base')).toBeVisible();
  await expect(summary.getByText('Envío')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await summary.getByRole('checkbox').check();
  await summary.getByRole('button', { name: /Pagar/ }).click();

  await expect(page.getByText('¡Pago aprobado!')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('VISA •••• 4242')).toBeVisible();
  await page.getByRole('button', { name: 'Volver a la tienda' }).click();
  await expect(product(page).getByText(`${before - 1} disponibles`)).toBeVisible();
  expect(await stockOf(page)).toBe(before - 1);
});

test('compra rechazada: no cambia el stock', async ({ page }) => {
  const before = await stockOf(page);
  await pay(page, CARDS.declined);
  await expect(page.getByText('Pago rechazado')).toBeVisible({ timeout: 90_000 });
  expect(await stockOf(page)).toBe(before);
});

test('recupera el progreso al recargar la página', async ({ page }) => {
  await goToSummary(page, CARDS.approved);
  await page.reload();
  // El token de la tarjeta no se persiste: vuelve al formulario con los datos de entrega.
  await expect(page.getByRole('dialog', { name: 'Pago con tarjeta' })).toBeVisible();
  await expect(page.getByLabel('Nombre completo')).toHaveValue('Ana Pérez');
  await expect(page.getByLabel('Dirección')).toHaveValue('Calle 10 # 20-30');
});
