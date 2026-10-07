// Único punto que lee variables de Vite (en los tests se reemplaza por src/test/runtime-config.mock.ts).
export const config = {
  apiUrl: import.meta.env.VITE_API_URL ?? '/api',
  gatewayUrl: import.meta.env.VITE_GATEWAY_URL ?? '',
  gatewayPublicKey: import.meta.env.VITE_GATEWAY_PUBLIC_KEY ?? '',
};
