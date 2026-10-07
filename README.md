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
    http/                  Controladores y DTOs (adaptadores de entrada), mapeo Result → HTTP
    persistence/           Entidades TypeORM, repositorios (adaptadores de salida) y seed
    gateway/               Adaptador de la pasarela de pagos (firma, reintentos)
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
├ status (PENDING | ASSIGNED | CANCELLED | OUT_OF_STOCK)
└ created_at
```

Los montos se manejan en centavos (enteros) para evitar errores de redondeo.

### API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/products` | Lista productos con stock |
| GET | `/api/products/:id` | Detalle de un producto |
| GET | `/api/checkout/fees` | Tarifa base y tarifa de envío |
| POST | `/api/transactions` | Crea cliente, transacción PENDING y entrega |
| POST | `/api/transactions/:id/payment` | Cobra con el token de la tarjeta y aplica el resultado |
| GET | `/api/transactions/:id` | Estado de la transacción (sincroniza con la pasarela si sigue PENDING) |

Documentación Swagger en `/docs`.

### Flujo de pago

1. El front tokeniza la tarjeta directamente contra la pasarela con la llave pública: **el número y el CVV nunca llegan al backend**.
2. `POST /api/transactions` valida el stock y crea la transacción `PENDING` con su número de referencia.
3. `POST /api/transactions/:id/payment` vuelve a validar el stock, firma la petición (SHA256 de referencia + monto + moneda + secreto de integridad) y crea el pago en la pasarela. Luego consulta el estado hasta obtener uno final.
4. Con el resultado, en una sola transacción de base de datos:
   - `APPROVED` → descuenta el stock y asigna la entrega.
   - `DECLINED` / `ERROR` → cancela la entrega.
   La finalización es idempotente: solo se aplica una vez desde `PENDING`, aunque lleguen consultas concurrentes.
5. Si el cliente refresca, `GET /api/transactions/:id` recupera el estado y, si sigue `PENDING`, lo sincroniza con la pasarela.

La marca y los últimos 4 dígitos de la tarjeta se toman de la respuesta de la pasarela, no del cliente. Las llamadas a la pasarela se reintentan ante errores 5xx o de red (el sandbox falla de forma intermitente).

### Validaciones

- Cantidad entre 1 y 10, stock suficiente al crear y al pagar.
- Email, nombre (3–100), teléfono (7–15 dígitos), dirección, ciudad, región y código postal opcional de 6 dígitos.
- Token de tarjeta con formato `tok_…`, cuotas entre 1 y 36, tokens de aceptación obligatorios.
- Se rechazan campos no declarados y se impide pagar dos veces la misma transacción (`409`).
- La respuesta no expone el teléfono ni el id interno del cliente.

### Ejecutar en local

```bash
docker compose up -d db          # PostgreSQL en el puerto 5440
cd backend
cp .env.example .env
npm install
npm run start:dev                # carga productos de ejemplo al iniciar
```

Completar en `.env` la URL del sandbox y las llaves de la pasarela (`GATEWAY_*`).

### Tests

```bash
npm run test:cov
```

56 tests. El repositorio de transacciones se prueba contra PostgreSQL en memoria (pg-mem) para validar el SQL real de la finalización atómica.

| Statements | Branches | Functions | Lines |
|---|---|---|---|
| 100% | 100% | 100% | 100% |

## Estado

En desarrollo.
