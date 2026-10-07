import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { GatewayPayment, PaymentGateway, PaymentRequest } from '../../domain/ports/payment-gateway';
import { TransactionStatus } from '../../domain/transaction';
import { err, ok, Result } from '../../shared/result';

interface GatewayTransaction {
  id: string;
  status: TransactionStatus;
  payment_method?: { extra?: { brand?: string; last_four?: string } };
}

const CURRENCY = 'COP';

// Adaptador de la pasarela de pagos (API REST de tarjetas, ambiente sandbox).
@Injectable()
export class CardPaymentGateway implements PaymentGateway {
  private readonly baseUrl: string;
  private readonly publicKey: string;
  private readonly privateKey: string;
  private readonly integritySecret: string;
  private readonly retries: number;
  private readonly retryDelayMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow('GATEWAY_URL');
    this.publicKey = config.getOrThrow('GATEWAY_PUBLIC_KEY');
    this.privateKey = config.getOrThrow('GATEWAY_PRIVATE_KEY');
    this.integritySecret = config.getOrThrow('GATEWAY_INTEGRITY_SECRET');
    this.retries = Number(config.get('GATEWAY_RETRIES', 3));
    this.retryDelayMs = Number(config.get('GATEWAY_RETRY_DELAY_MS', 500));
  }

  /** Firma de integridad: SHA256(referencia + monto en centavos + moneda + secreto). */
  signature(reference: string, amountInCents: number): string {
    return createHash('sha256').update(`${reference}${amountInCents}${CURRENCY}${this.integritySecret}`).digest('hex');
  }

  createPayment(req: PaymentRequest): Promise<Result<GatewayPayment>> {
    return this.request('/transactions', this.privateKey, {
      method: 'POST',
      body: JSON.stringify({
        acceptance_token: req.acceptanceToken,
        accept_personal_auth: req.acceptPersonalAuth,
        amount_in_cents: req.amountInCents,
        currency: CURRENCY,
        signature: this.signature(req.reference, req.amountInCents),
        customer_email: req.customerEmail,
        reference: req.reference,
        payment_method: { type: 'CARD', token: req.cardToken, installments: req.installments },
      }),
    });
  }

  getPayment(id: string): Promise<Result<GatewayPayment>> {
    return this.request(`/transactions/${encodeURIComponent(id)}`, this.publicKey, { method: 'GET' });
  }

  // ponytail: reintenta también el POST ante 5xx; la referencia única evita cobros dobles pero
  // un 5xx tras procesar dejaría la transacción en ERROR. Conciliar por referencia si pasa en producción.
  private async request(path: string, key: string, init: RequestInit): Promise<Result<GatewayPayment>> {
    let lastError = 'Sin respuesta de la pasarela';
    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) return ok(this.toPayment(body.data));
        lastError = JSON.stringify(body.error ?? body);
        if (res.status < 500) break;
      } catch (e) {
        lastError = (e as Error).message;
      }
      if (attempt < this.retries) await new Promise((r) => setTimeout(r, this.retryDelayMs * attempt));
    }
    return err('GATEWAY', lastError);
  }

  private toPayment(data: GatewayTransaction): GatewayPayment {
    return {
      id: data.id,
      status: data.status,
      cardBrand: data.payment_method?.extra?.brand ?? null,
      cardLastFour: data.payment_method?.extra?.last_four ?? null,
    };
  }
}
