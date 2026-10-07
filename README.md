# Checkout de producto con tarjeta de crédito

SPA mobile-first para comprar un producto con tarjeta de crédito a través de una pasarela de pagos (sandbox), con backend propio que gestiona stock, transacciones, clientes y entregas.

## Flujo

1. Producto (stock, descripción y precio)
2. Datos de tarjeta y entrega
3. Resumen de pago
4. Estado final de la transacción
5. Producto con stock actualizado

## Estructura

```
backend/   API NestJS (arquitectura hexagonal + ROP)
frontend/  SPA (en construcción)
```

## Backend

**Stack:** NestJS 11, TypeScript, PostgreSQL 16, TypeORM, Jest.

### Arquitectura (hexagonal: puertos y adaptadores)

```
src/
  shared/result.ts         Tipo Result<T> para Railway Oriented Programming
  domain/                  Modelos y puertos (interfaces), sin dependencias de frameworks
  application/             Casos de uso: orquestan puertos y devuelven Result
  infrastructure/
    http/                  Controladores (adaptadores de entrada) y mapeo Result → HTTP
    persistence/           Entidades TypeORM, repositorios (adaptadores de salida) y seed
```

Los controladores solo traducen HTTP ↔ casos de uso. Los casos de uso no lanzan excepciones: devuelven `Ok` o `Err` y el controlador convierte el error en el código HTTP correspondiente.

### Modelo de datos

```
products                     customers
├ id (uuid, PK)              ├ id (uuid, PK)
├ name                       ├ email (único)
├ description                ├ full_name
├ price_in_cents             ├ phone
├ stock  (CHECK >= 0)        └ created_at
└ image_url
        ▲                          ▲
        │ N:1                      │ N:1
transactions ──────────────────────┘
├ id (uuid, PK)
├ reference (único, se envía a la pasarela)
├ product_id (FK), customer_id (FK)
├ quantity
├ amount_in_cents, base_fee_in_cents, delivery_fee_in_cents, total_in_cents
├ status (PENDING | APPROVED | DECLINED | ERROR)
├ gateway_transaction_id
├ card_brand, card_last_four   (nunca se guarda el número ni el CVV)
└ created_at, updated_at
        ▲
        │ 1:1
deliveries
├ id (uuid, PK)
├ transaction_id (FK, único)
├ address, city, region, postal_code
├ status (PENDING | ASSIGNED)
└ created_at
```

Los montos se manejan en centavos (enteros) para evitar errores de redondeo.

### API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/products` | Lista productos con stock |
| GET | `/api/products/:id` | Detalle de un producto |

Documentación Swagger en `/docs`.

### Ejecutar en local

```bash
docker compose up -d db          # PostgreSQL en el puerto 5440
cd backend
cp .env.example .env
npm install
npm run start:dev                # carga productos de ejemplo al iniciar
```

### Tests

```bash
npm run test:cov
```

| Statements | Branches | Functions | Lines |
|---|---|---|---|
| 97.34% | 100% | 83.33% | 100% |

## Estado

En desarrollo.
