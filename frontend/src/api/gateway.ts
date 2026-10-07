import { config } from '../runtime-config';
import { requestJson } from './http';

// Llamadas directas a la pasarela con la llave PÚBLICA: los datos de la tarjeta
// van del navegador a la pasarela y nunca pasan por nuestro backend.

const flaky = { retries: 3, retryOn: (status: number) => status >= 500 || status === 404 };

export interface CardInput {
  number: string;
  cvc: string;
  expMonth: string;
  expYear: string;
  holder: string;
}

export interface CardToken {
  id: string;
  brand: string;
  lastFour: string;
}

export interface Acceptance {
  acceptanceToken: string;
  acceptPersonalAuth: string;
  termsUrl: string;
  personalDataUrl: string;
}

interface MerchantResponse {
  data: {
    presigned_acceptance: { acceptance_token: string; permalink: string };
    presigned_personal_data_auth: { acceptance_token: string; permalink: string };
  };
}

export const gateway = {
  tokenizeCard: async (card: CardInput): Promise<CardToken> => {
    const res = await requestJson<{ data: { id: string; brand: string; last_four: string } }>(
      `${config.gatewayUrl}/tokens/cards`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.gatewayPublicKey}` },
        body: JSON.stringify({
          number: card.number,
          cvc: card.cvc,
          exp_month: card.expMonth,
          exp_year: card.expYear,
          card_holder: card.holder,
        }),
      },
      flaky,
    );
    return { id: res.data.id, brand: res.data.brand, lastFour: res.data.last_four };
  },

  /** Tokens de aceptación prefirmados. Son de un solo uso: pedir unos nuevos en cada pago. */
  acceptance: async (): Promise<Acceptance> => {
    const { data } = await requestJson<MerchantResponse>(
      `${config.gatewayUrl}/merchants/${config.gatewayPublicKey}`,
      {},
      flaky,
    );
    return {
      acceptanceToken: data.presigned_acceptance.acceptance_token,
      acceptPersonalAuth: data.presigned_personal_data_auth.acceptance_token,
      termsUrl: data.presigned_acceptance.permalink,
      personalDataUrl: data.presigned_personal_data_auth.permalink,
    };
  },
};
