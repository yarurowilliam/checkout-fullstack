# Checkout de producto con tarjeta de crédito

SPA mobile-first para comprar un producto y pagarlo con tarjeta de crédito a través de una pasarela de pagos (ambiente sandbox), con un backend propio que gestiona **stock, transacciones, clientes y entregas**.

| | |
|---|---|
| **App desplegada** | https://d3uzg2xis4rjhn.cloudfront.net |
| **Swagger (API pública)** | https://d3uzg2xis4rjhn.cloudfront.net/api/docs |
| **Repositorio** | https://github.com/yarurowilliam/checkout-fullstack |

## Contenido

- [Flujo de negocio](#flujo-de-negocio)
- [Stack](#stack)
- [Arquitectura](#arquitectura)
- [Modelo de datos](#modelo-de-datos)
- [API](#api)
- [Flujo de pago](#flujo-de-pago)
- [Resiliencia](#resiliencia)
- [Seguridad](#seguridad)
- [Pruebas y cobertura](#pruebas-y-cobertura)
- [Ejecutar en local](#ejecutar-en-local)
- [Despliegue en AWS](#despliegue-en-aws)
- [Decisiones y limitaciones conocidas](#decisiones-y-limitaciones-conocidas)

## Flujo de negocio

```
1. Producto ──► 2. Tarjeta y entrega ──► 3. Resumen ──► 4. Estado final ──► 5. Producto (stock actualizado)
```

1. **Producto**: catálogo con descripción, precio y unidades disponibles. Se elige la cantidad y se pulsa *Pagar con tarjeta de crédito*.
2. **Tarjeta y entrega** (modal): número con detección de VISA/MasterCard, titular, vencimiento, CVC, cuotas y datos de entrega. Todo se valida en el cliente y en el servidor.
3. **Resumen** (patrón [backdrop de Material](https://m2.material.io/components/backdrop)): valor del producto, tarifa base, tarifa de envío y total, más la aceptación de términos de la pasarela.
4. **Estado final**: aprobado, rechazado o error, con referencia, tarjeta enmascarada y dirección de entrega.
5. **Regreso a la tienda** (automático a los 10 s o con el botón) con el stock actualizado.

**Tarjetas de prueba (sandbox):** `4242 4242 4242 4242` → aprobada · `4111 1111 1111 1111` → rechazada. Cualquier fecha futura y CVC de 3 dígitos.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19, Redux Toolkit, Vite, CSS propio (flexbox + grid), Jest + Testing Library |
| Backend | NestJS 11, TypeScript, TypeORM, class-validator, Swagger, Jest |
| Base de datos | PostgreSQL 16 |
| Infraestructura | AWS CDK: CloudFront, S3, EC2, SSM Parameter Store; Docker Compose |

## Arquitectura

### Backend: hexagonal (puertos y adaptadores) + Railway Oriented Programming

```
backend/src/
  shared/result.ts       Result<T> y Flow: encadenamiento ROP (andThen / map)
  domain/                Modelos, reglas (cálculo de montos) y puertos (interfaces)
    ports/               ProductRepository, TransactionRepository, PaymentGateway
  application/           Casos de uso: productos y transacciones
  infrastructure/
    http/                Controladores y DTOs (adaptadores de entrada), Result → HTTP
    persistence/         Entidades y repositorios TypeORM, seed (adaptadores de salida)
    gateway/             Adaptador de la pasarela: firma de integridad y reintentos
```

- El **dominio no depende de NestJS ni de TypeORM**; los casos de uso solo conocen los puertos.
- Los casos de uso **no lanzan excepciones**: cada paso devuelve `Ok` o `Err` y la cadena se corta en el primer error.

```ts
pay(id, input) {
  return Flow.from(this.findTransaction(id))
    .andThen((tx) => ensure(tx, tx.status === 'PENDING' && !tx.gatewayTransactionId, 'CONFLICT', 'La transacción ya fue procesada'))
    .andThen((tx) => this.checkStock(tx))
    .andThen((tx) => this.charge(tx, input))
    .run();
}
```

- El controlador es el final del riel: `unwrap(result)` convierte cada código de error en su estado HTTP (`NOT_FOUND`→404, `VALIDATION`→400, `OUT_OF_STOCK`/`CONFLICT`→409, `GATEWAY`→502).

### Frontend: Flux con Redux Toolkit

```
frontend/src/
  domain/        Reglas puras: tarjeta (Luhn, marca, formato), validaciones, dinero
  api/           Adaptadores HTTP: backend y pasarela (tokenización, aceptación)
  store/         Slices de productos y checkout, thunks y persistencia
  components/    ProductPage, PaymentModal, SummaryBackdrop, ResultPage
```

- Un único flujo de datos: los componentes despachan acciones → los thunks llaman a la API → los reducers actualizan el estado → la vista se re-renderiza.
- Los thunks reciben los adaptadores HTTP como dependencia (`extraArgument`), lo que permite probarlos sin red.

## Modelo de datos

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
├ status (PENDING | APPROVED | DECLINED | ERROR | VOIDED)
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

- Montos en **centavos enteros** para evitar errores de redondeo.
- La base se carga con productos de ejemplo al iniciar si la tabla está vacía (no hay endpoint para crear productos).

## API

Documentación interactiva en **`/api/docs`** (Swagger).

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/products` | Lista productos con stock |
| GET | `/api/products/:id` | Detalle de un producto |
| GET | `/api/checkout/fees` | Tarifa base y tarifa de envío |
| POST | `/api/transactions` | Crea (o actualiza) el cliente, la transacción `PENDING` y la entrega |
| POST | `/api/transactions/:id/payment` | Cobra con el token de la tarjeta y aplica el resultado |
| GET | `/api/transactions/:id` | Estado de la transacción; si sigue `PENDING` lo sincroniza con la pasarela |
| GET | `/api/customers/:id` | Datos del cliente (nombre y email; el teléfono no se expone) |
| GET | `/api/deliveries/:id` | Entrega: dirección, transacción asociada y estado (`PENDING`, `ASSIGNED`, `CANCELLED`, `OUT_OF_STOCK`) |

<details>
<summary>Ejemplo: crear y pagar una transacción</summary>

```http
POST /api/transactions
{
  "productId": "4d6f…",
  "quantity": 1,
  "customer": { "email": "ana@test.com", "fullName": "Ana Pérez", "phone": "3001234567" },
  "delivery": { "address": "Calle 10 # 20-30", "city": "Bogotá", "region": "Cundinamarca", "postalCode": "110111" }
}
→ 201 { "id": "…", "reference": "TX-…", "status": "PENDING", "totalInCents": 19990000, … }

POST /api/transactions/{id}/payment
{ "cardToken": "tok_…", "installments": 1, "acceptanceToken": "eyJ…", "acceptPersonalAuth": "eyJ…" }
→ 200 { "status": "APPROVED", "cardBrand": "VISA", "cardLastFour": "4242", "delivery": { "status": "ASSIGNED", … }, … }
```
</details>

### Validaciones

- Producto existente y **stock suficiente al crear y otra vez antes de cobrar**.
- Cantidad 1–10, email, nombre (3–100), teléfono (7–15 dígitos), dirección, ciudad, departamento y código postal opcional de 6 dígitos.
- Token de tarjeta con formato `tok_…`, cuotas 1–36 y tokens de aceptación obligatorios.
- Se rechazan campos no declarados (`forbidNonWhitelisted`) y no se puede pagar dos veces la misma transacción (`409`).

## Flujo de pago

```
Navegador                     Backend                         Pasarela (sandbox)
   │ POST /tokens/cards (llave pública) ─────────────────────────►│  número y CVC van directo
   │◄──────────────────────────────────────────── token, marca ───│  a la pasarela
   │ POST /api/transactions ─────►│ valida stock, crea PENDING
   │ GET  /merchants (tokens de aceptación, de un solo uso) ─────►│
   │ POST /api/transactions/:id/payment ─►│ firma SHA256 + llave privada ─►│
   │                              │◄────────────────── PENDING ───│
   │                              │ consulta hasta estado final ──►│
   │                              │ BEGIN                          │
   │                              │  status := APPROVED (solo desde PENDING)
   │                              │  stock := stock - n (si stock >= n)
   │                              │  entrega := ASSIGNED
   │                              │ COMMIT                         │
   │◄─────────────── transacción final
```

- **Firma de integridad**: `SHA256(referencia + monto_en_centavos + moneda + secreto)`, calculada solo en el backend.
- **Finalización atómica e idempotente**: el cambio de estado, el descuento de stock y la asignación de la entrega ocurren en una sola transacción de base de datos y solo desde `PENDING`, aunque lleguen consultas concurrentes.
- La marca y los últimos 4 dígitos se toman **de la respuesta de la pasarela**, no del cliente.

## Resiliencia

- El progreso del checkout se guarda en `localStorage` (paso, producto, cantidad, datos de entrega, transacción) **sin el token de la tarjeta**.
- Tras un refresh:
  - en el resumen → vuelve al formulario con los datos de entrega precargados (el token no se persiste);
  - en el resultado → consulta `GET /api/transactions/:id`, que sincroniza con la pasarela si sigue `PENDING`;
  - si la transacción se creó pero no llegó a la pasarela → se reutiliza al reintentar.
- Las llamadas a la pasarela se **reintentan ante 5xx y errores de red** (el sandbox falla de forma intermitente).

## Seguridad

**[Mozilla Observatory](https://developer.mozilla.org/en-US/observatory/analyze?host=d3uzg2xis4rjhn.cloudfront.net): A+ (115/100), 12/12 pruebas superadas.**

Alineado con OWASP Top 10:

| Riesgo | Medida |
|---|---|
| Exposición de datos sensibles | La tarjeta se tokeniza en el navegador con la llave pública; el backend nunca recibe número ni CVC. Solo se guardan marca y últimos 4. Las respuestas no exponen el teléfono del cliente. |
| Secretos | Llaves e integridad en SSM Parameter Store (SecureString). Nada sensible en el repositorio. |
| Inyección | TypeORM con consultas parametrizadas; validación estricta de DTOs y whitelist de campos. |
| Abuso / fuerza bruta | Rate limiting: 120 req/min por IP y 10 pagos/min. Cuerpo JSON limitado a 10 KB. |
| Configuración segura | HTTPS en CloudFront (redirección y HSTS con preload), CSP estricta, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; Helmet en la API. |
| Superficie de red | La EC2 solo acepta tráfico del prefix list de CloudFront; PostgreSQL sin puertos expuestos; sin SSH (administración por SSM); IMDSv2 obligatorio; disco cifrado. |
| Integridad | Firma SHA256 en cada pago; pago idempotente; restricción `CHECK (stock >= 0)` en la base. |

## Pruebas y cobertura

```bash
cd backend  && npm run test:cov
cd frontend && npm run test:cov
```

**Backend** — 82 tests:

- **Unitarios** de dominio, casos de uso, controladores, DTOs y adaptadores. Los repositorios se prueban contra PostgreSQL en memoria (pg-mem) para validar el SQL real de la finalización atómica.
- **E2E de la API** (`npm run test:e2e`): levantan la aplicación completa (mismos módulos, pipes y cabeceras que producción) sobre PostgreSQL en memoria y con la pasarela simulada, y prueban por HTTP con supertest:
  - compra aprobada de punta a punta (stock, entrega, cliente);
  - pago rechazado y pasarela caída;
  - doble pago (`409`), stock insuficiente (`409`), producto inexistente (`404`);
  - validaciones (`400`) y campos no declarados;
  - cabeceras de seguridad, límite de 10 KB (`413`), rate limit (`429`) y Swagger.

| Statements | Branches | Functions | Lines |
|---|---|---|---|
| 100% | 100% | 100% | 100% |

**Frontend** — 53 tests: flujo completo de compra, validaciones, estados del resultado, persistencia y clientes HTTP.

| Statements | Branches | Functions | Lines |
|---|---|---|---|
| 99.51% | 97.2% | 98.07% | 99.7% |

**Navegadores (e2e con Playwright)** — 7 pruebas × 6 configuraciones = **42 pruebas en verde**. Recorren la interfaz real contra el backend y el sandbox de la pasarela:

| Prueba | Chrome | Edge | Firefox | Safari (WebKit) | Chrome móvil (Pixel 7) | Safari iPhone SE |
|---|---|---|---|---|---|---|
| Productos con precio y stock, sin desbordes | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Validación de tarjeta y datos de entrega | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Detección de VISA y MasterCard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cierre del modal con Escape | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Compra aprobada: descuenta el stock | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Compra rechazada: el stock no cambia | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Recupera el progreso al recargar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

```bash
cd e2e && npm install && npx playwright install firefox webkit
API_URL=http://localhost:3000/api npx playwright test   # con backend y frontend corriendo en local
```

Además, el flujo se probó de punta a punta contra el sandbox real, en local y en producción:

- Pago aprobado → `APPROVED`, stock descontado, entrega `ASSIGNED`.
- Pago rechazado → `DECLINED`, entrega `CANCELLED`, stock intacto.
- Refresh en pleno pago → la app recupera la transacción y muestra el estado final.
- Viewport de 375×667 (iPhone SE).

## Ejecutar en local

Requisitos: Node 22+, Docker.

```bash
# Base de datos (PostgreSQL en el puerto 5440)
docker compose up -d db

# Backend → http://localhost:3000/api  ·  Swagger en /api/docs
cd backend
cp .env.example .env      # completar GATEWAY_URL y las llaves del sandbox
npm install
npm run start:dev

# Frontend → http://localhost:5173
cd frontend
cp .env.example .env      # completar VITE_GATEWAY_URL y VITE_GATEWAY_PUBLIC_KEY
npm install
npm run dev
```

## Despliegue en AWS

```
                 ┌──────────────────────── CloudFront (HTTPS, HTTP/3, cabeceras de seguridad) ───────────────────────┐
 Navegador ────► │  /*      → S3 privado (OAC): SPA                                                                   │
                 │  /api/*  → EC2 t3.micro (solo desde CloudFront) ─► Docker Compose: API NestJS + PostgreSQL         │
                 └────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                        │ secretos al arrancar
                                                        ▼
                                              SSM Parameter Store (/checkout/*)
```

Todo está definido como código en [`infra/`](infra/lib/checkout-stack.ts) (AWS CDK).

```bash
./deploy/deploy.sh       # sube secretos a SSM, compila el frontend y despliega el stack
./deploy/deploy.sh api   # solo actualiza la API (git pull + docker en la instancia vía SSM)
```

- La API se sirve en el **mismo dominio** que el frontend (`/api`), así que no hay CORS en uso normal; aun así CORS se restringe al dominio de CloudFront.
- Assets con hash en caché por un año (`immutable`); `index.html` con `no-cache` e invalidación en cada despliegue.

## Decisiones y limitaciones conocidas

- **EC2 + Docker en lugar de Lambda + RDS**: la API necesita salir a internet para llamar a la pasarela. Con Lambda en VPC eso exige un NAT Gateway (~USD 32/mes) o una base de datos pública. Una t3.micro con PostgreSQL en contenedor es más barata y deja la base sin exposición.
- **Stock**: se valida antes de cobrar y se descuenta al aprobar con una actualización condicional. Si dos clientes compran la última unidad a la vez, la entrega del segundo queda `OUT_OF_STOCK` (requeriría reembolso). Para alta concurrencia: reservar stock con expiración.
- **Reintentos de la pasarela**: si un 5xx llega después de que la pasarela procesó el cobro, la transacción quedaría en `ERROR`. Mejora: conciliar por referencia.
- **Esquema**: TypeORM `synchronize` en lugar de migraciones, suficiente para un esquema estable; con evolución en producción conviene migraciones.
- **Webhook de eventos**: no se usa porque la cuenta de sandbox es compartida y no se puede configurar la URL de eventos; el estado se resuelve consultando la pasarela (al pagar y en cada `GET` de una transacción `PENDING`).
