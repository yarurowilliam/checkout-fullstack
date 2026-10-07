import { defineConfig, devices } from '@playwright/test';

// Pruebas de punta a punta en varios navegadores contra la app corriendo (por defecto, en local).
//   BASE_URL  URL del frontend (http://localhost:5173)
//   API_URL   URL de la API para leer el stock (http://localhost:3000/api)
export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  // Las compras comparten stock y el sandbox de la pasarela: se ejecutan en serie.
  workers: 1,
  fullyParallel: false,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    locale: 'es-CO',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chrome-escritorio', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'edge-escritorio', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'firefox-escritorio', use: { ...devices['Desktop Firefox'] } },
    { name: 'safari-escritorio', use: { ...devices['Desktop Safari'] } },
    { name: 'chrome-movil', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'safari-iphone-se', use: { ...devices['iPhone SE (3rd gen)'] } },
  ],
});
