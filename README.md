# Tienda Deportiva

E-commerce deportivo full stack construido con HTML, CSS y JavaScript vanilla, Firebase y Cloudflare Workers, con autenticación, carrito, historial de compras e integración segura con Mercado Pago Checkout Pro.

El proyecto se desarrolló con un flujo de trabajo asistido por IA, manteniendo la dirección técnica, la implementación, la revisión de cambios y la validación mediante pruebas bajo responsabilidad de su desarrollador.

## Funcionalidades

- Catálogo de 36 productos de calzado, indumentaria y equipamiento, con imágenes WebP.
- Búsqueda por prefijos con múltiples palabras, combinada con filtros de categorías.
- Carrusel de destacados con autoplay, flechas y desplazamiento táctil; diseño responsive.
- Carrito persistido bajo la clave `carrito` de localStorage, con cantidades, eliminación y total.
- Validación de elementos recuperados, renderizado seguro de filas y aviso si falla el guardado local.
- Máximo de 10 unidades por producto; el backend también suma las cantidades de entradas duplicadas.
- Registro, inicio y cierre de sesión mediante email y contraseña con Firebase Authentication.
- Historial por usuario con aprobación, reembolsos parciales, reembolsos totales y contracargos.
- Protección del historial frente a cambios de sesión y respuestas asíncronas antiguas.
- Checkout Pro con precios del servidor y órdenes persistidas en Firestore.
- Webhook firmado, aprobación idempotente y actualizaciones condicionadas para controlar concurrencia.
- Timeouts externos, límites básicos de entrada y logs estructurados y saneados.

Los reembolsos y contracargos se registran a partir del estado consultado en Mercado Pago. La tienda no incluye una interfaz ni endpoints propios para iniciarlos.

## Stack

| Capa | Tecnologías |
|---|---|
| Frontend | HTML5, CSS3 y JavaScript vanilla |
| Backend | Cloudflare Workers, REST, Web APIs y WebCrypto |
| Identidad y datos | Firebase Authentication y Cloud Firestore |
| Hosting | Firebase Hosting |
| Pagos | Mercado Pago Checkout Pro |
| Herramientas | Git, GitHub, Wrangler y Firebase CLI |

El frontend importa Firebase Web SDK 10.7.0 desde el CDN oficial. El Worker no usa Firebase Admin SDK: accede a Auth, Firestore y OAuth mediante REST. Su única dependencia directa declarada es Wrangler como dependencia de desarrollo (`^4.130.0`; el lockfile fija 4.130.0).

## Arquitectura

```text
Navegador ── registro/login ──> Firebase Authentication
    │                              │
    │ <──── Firebase ID token ──────┘
    │
    ├── nombre + cantidad + Bearer ──> Cloudflare Worker
    │                                    ├── valida token en Identity Toolkit
    │                                    ├── crea preferencia en Mercado Pago
    │                                    └── crea orden en Firestore
    │ <──────────── init_point ──────────┘
    │
    ├── pago ──> Mercado Pago ── webhook firmado ──> Worker
    │                                                ├── consulta payment en MP
    │                                                └── actualiza Firestore
    │
    └── Mis Compras ── Firebase Auth + Rules ──> Firestore
```

El navegador muestra precios, pero no decide el importe cobrado. Solo envía nombre y cantidad; el catálogo interno del Worker es la fuente de verdad del checkout. El servidor genera el UUID usado como `external_reference` y como ID del documento de compra.

El navegador no escribe compras. El Worker utiliza una service account, firma un JWT con WebCrypto y obtiene un token OAuth con acceso a Firestore. Sus permisos efectivos dependen de IAM.

La confirmación financiera proviene del webhook y de la consulta autenticada a la API de Mercado Pago. **Llegar a `success.html` no acredita un pago aprobado.** Esa página es informativa y no consulta Firestore.

## Flujo de checkout

1. El usuario inicia sesión.
2. El frontend obtiene su Firebase ID token.
3. Envía el carrito al Worker mediante POST con Authorization Bearer.
4. El Worker valida al usuario mediante `accounts:lookup`.
5. Comprueba body, productos, cantidades y límites acumulados.
6. Obtiene los precios del catálogo del servidor y calcula el total.
7. Genera un UUID de orden.
8. Crea una preferencia en Mercado Pago con ese `external_reference`.
9. Crea el documento de Firestore con estado `pending_payment`.
10. Devuelve `id` e `init_point` al frontend.
11. El usuario completa el pago en Mercado Pago.
12. Mercado Pago envía una notificación `payment`.
13. El Worker valida su firma HMAC antes de leer el body.
14. Consulta el payment directamente en Mercado Pago.
15. Busca la orden por `external_reference` y verifica monto y moneda.
16. Evalúa el estado financiero y, si corresponde, actualiza Firestore.

**`init_point` solo se entrega después de crear correctamente la orden.** Si falla esa creación, el checkout responde con error y no entrega el enlace. Puede quedar una preferencia huérfana en Mercado Pago; no se reintenta automáticamente su creación.

## Estados de compra y datos

La colección utilizada para las órdenes es `compras`.

| Estado | Significado | Visible en Mis Compras |
|---|---|---|
| `pending_payment` | Orden creada, pendiente de aprobación registrada | No |
| `approved` | Pago aprobado y acreditado | Pago aprobado |
| `partially_refunded` | Reembolso acumulado mayor que cero y menor que el total | Reembolso parcial |
| `refunded` | Reembolso acumulado igual al total | Reembolsado |
| `charged_back` | Contracargo informado por Mercado Pago | Contracargo |

El documento contiene `usuarioUid`, `usuarioEmail`, `items`, `total`, `estado`, `mercadoPagoPreferenceId`, `mercadoPagoPaymentId` y `fecha`. Cada item guarda `nombre`, `cantidad` y `precio`.

| Campo financiero | Uso |
|---|---|
| `mercadoPagoPaymentId` | Inicialmente null; se asocia al aprobar y no se reemplaza por otro pago |
| `fechaPago` | Timestamp de la primera aprobación registrada por el Worker; se conserva en duplicados y reversos |
| `montoReembolsado` | Importe acumulado en pesos, no una suma de eventos recibidos |
| `detalleEstadoPago` | Detalle financiero informado por Mercado Pago |
| `fechaActualizacionPago` | `date_last_updated` del snapshot financiero aplicado |

Firestore proporciona además `updateTime` como metadato del documento, usado como precondición de escritura; no es un campo añadido por el frontend.

Los parciales reemplazan el acumulado y no pueden reducirlo. El refund total admite los detalles `refunded` y `by_admin`. Los contracargos admiten `in_process`, `settled` y `reimbursed`, conservando el estado local `charged_back`; no inventan un monto de reembolso y mantienen el que ya existía.

El historial muestra el importe reembolsado para parciales y totales cuando está disponible. Se consulta al abrir Mis Compras; no es una suscripción en tiempo real.

## Seguridad y controles

- Productos comprobados con `Object.hasOwn`, precios numéricos positivos del servidor y cantidades numéricas enteras de 1 a 10.
- Máximo acumulado de 10 por producto, incluso si aparece en varias entradas; no se fusiona el carrito automáticamente.
- Máximo de 360 entradas de carrito y 32 KiB (32.768 bytes) de body en ambos endpoints POST.
- Content-Length sirve para rechazo temprano; también se mide el texto en bytes UTF-8 antes de parsear JSON. No se exige Content-Type.
- Auth se valida antes de procesar el carrito; HMAC antes de leer el body del webhook.
- Credenciales Firebase inválidas reconocidas producen 401. Errores operativos de Identity Toolkit, como 429/5xx, timeout o fallo de red, producen error operativo, no una falsa sesión inválida.
- Firma HMAC-SHA256 con `x-signature`, `x-request-id`, ID del pago y timestamp del manifiesto; el payment se obtiene después con la credencial del servidor.
- Se exige moneda `ARS`, correspondencia de monto y una orden asociada a `external_reference`.
- Payment ID estable e idempotencia: las repeticiones no reescriben fechaPago ni el mismo estado financiero.
- PATCH condicionado por `currentDocument.updateTime`: cada ejecución intenta como máximo un PATCH y una relectura ante HTTP 400 `FAILED_PRECONDITION`.
- Los snapshots financieros antiguos se ignoran; fechas equivalentes se comparan por instante con precisión de nanosegundos.
- Los PATCH de aprobación solo cambian estado, payment ID y fechaPago; los de reverso solo estado, montoReembolsado, detalleEstadoPago y fechaActualizacionPago.
- Los logs de anomalías registran motivo, servicio e identificadores; no se registran tokens, firmas, service accounts, bodies completos de pagos ni errores externos completos.
- Secrets fuera del frontend y del repositorio; `.env` y `.dev.vars*` están protegidos por reglas de exclusión, con excepciones para archivos de ejemplo sin credenciales.

Una orden inexistente devuelve 200 con `ignored: "order_not_found"` y un log de anomalía. No se crea ni asocia una orden desde ese webhook. Esta política es coherente con entregar el checkout después de persistir la orden; un caso excepcional requiere investigación.

Las lecturas de body cargan primero el texto completo si no hubo rechazo por Content-Length: el límite de aceptación no es un techo estricto de memoria. La firma incluye el timestamp, pero no se aplica una ventana de antigüedad adicional. Estos controles no representan una garantía de seguridad absoluta.

### Timeouts externos

| Servicio / operación | Plazo |
|---|---:|
| Google OAuth | 4.000 ms |
| Identity Toolkit | 5.000 ms |
| Firestore GET/POST/PATCH | 3.000 ms |
| Mercado Pago: consultar payment | 6.000 ms |
| Mercado Pago: crear preferencia | 10.000 ms |

`fetchConTimeout` usa AbortController y cubre headers y descarga del cuerpo. Limpia timers/listeners y distingue timeout propio de cancelación externa. No hay retries internos ni presupuesto global del webhook.

Un timeout de escritura no demuestra que la operación haya fallado en el servicio remoto. No se repite automáticamente un POST/PATCH. Una notificación posterior vuelve a leer el estado y utiliza la idempotencia existente.

## Configuración y secrets

Secrets del Worker, documentados únicamente por nombre:

| Nombre | Propósito |
|---|---|
| `MP_ACCESS_TOKEN` | Acceso del servidor a Mercado Pago |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Service account codificada para autenticar el acceso administrativo a Firestore |
| `MP_WEBHOOK_SECRET` | Verificación HMAC de notificaciones |

Se administran mediante `wrangler secret put` o la configuración de Cloudflare. Los valores no se incluyen aquí. Base64 no es cifrado: el contenido de la service account sigue siendo privado.

Configuración pública existente:

- Firebase Web config en `index.html`; constante `FIREBASE_API_KEY` en el Worker para Identity Toolkit.
- La Firebase Web API Key no se trata como un secreto privado del servidor; no sustituye Auth, Rules ni IAM.
- `wrangler.jsonc`: nombre `tienda-deportiva-api`, entrada `src/worker.js`, compatibility date `2026-09-08`, workers.dev habilitado y preview URLs deshabilitadas.
- Observabilidad de logs habilitada con persistencia; trazas deshabilitadas.
- `.firebaserc`: proyecto Firebase predeterminado `tienda-deportiva-b14c3`.

El repositorio no demuestra qué valores de secrets, permisos IAM o configuración del panel están activos en producción; deben verificarse en los servicios correspondientes.

## Endpoints

Base actual: [Cloudflare Worker](https://tienda-deportiva-api.lautaroantonini10.workers.dev).

| Endpoint | Autenticación | Propósito y respuesta |
|---|---|---|
| `GET /` | Ninguna | Estado básico: `{ "ok": true, "servicio": "tienda-deportiva-api" }` |
| `POST /createPreference` | Firebase ID token en Authorization Bearer | Crea preferencia y orden; responde `{ id, init_point }` |
| `POST /paymentWebhook` | Firma HMAC y datos de notificación | Consulta y procesa payment; responde `{ received: true }`, opcionalmente `ignored`, o un error |

Request del checkout:

```json
{
  "carrito": [
    { "nombre": "Velocity Aura", "cantidad": 1 }
  ]
}
```

Los errores usan `{ error: "..." }`: 400 para entrada inválida, 401 para autenticación/firma rechazada cuando corresponde, 413 para body excesivo y 500 para fallos operativos. El webhook devuelve 400 si faltan datos de firma. Las anomalías financieras ignoradas mantienen 200 sin escritura. Las rutas no reconocidas devuelven 404; OPTIONS tiene respuesta CORS 204.

Webhook configurado para el evento `payment`:

[https://tienda-deportiva-api.lautaroantonini10.workers.dev/paymentWebhook](https://tienda-deportiva-api.lautaroantonini10.workers.dev/paymentWebhook)

El ID se toma de `data.id` o `data_id` en la query. El body puede aportar `type`; tipos distintos de `payment` se ignoran. Un body inválido o no objeto, dentro del límite, conserva el tratamiento como objeto vacío.

## Firestore y catálogo

`firestore.rules` establece:

- `compras/{compraId}`: lectura solo con usuario autenticado cuyo UID coincida con `usuarioUid`; creación, actualización y eliminación prohibidas para el navegador.
- `productos/{productoId}`: lectura pública y escrituras prohibidas desde clientes sujetos a Rules.
- No existen reglas que concedan acceso a otras rutas.

El Worker escribe mediante OAuth de service account e IAM. La colección `productos` tiene reglas, pero no es la fuente utilizada por el checkout: los 36 nombres y precios vigentes están en `catalogo`, dentro de `worker.js`. La presentación de productos está en el frontend.

Al cambiar un nombre o precio, sincronizar la presentación frontend y el catálogo backend. Un nombre distinto puede ser rechazado; cambiar solo el precio visual no cambia el cobro del servidor.

## Estructura

```text
/
├── README.md
├── index.html
├── estilos.css
├── script.js
├── success.html
├── pending.html
├── failure.html
├── 404.html
├── img/
│   └── optimizado/
│       ├── calzado/
│       ├── indumentaria/
│       ├── equipamiento/
│       └── hero/
├── .gitignore
├── .firebaserc
├── firebase.json
├── firestore.rules
└── tienda-deportiva-api/
    ├── .gitignore
    ├── package.json
    ├── package-lock.json
    ├── wrangler.jsonc
    └── src/
        └── worker.js
```

## Desarrollo local

Requisitos: Node.js 22 o superior y npm, según los engines de Wrangler en el lockfile; Firebase CLI instalada por separado; acceso autorizado a los proyectos de Firebase, Cloudflare y Mercado Pago.

Desde la raíz, instalar las dependencias del Worker y ejecutarlo:

```sh
cd tienda-deportiva-api
npm ci
npm run dev
```

`npm start` también ejecuta `wrangler dev`. Los scripts reales son `dev`, `start` y `deploy`. No existe un script de tests en package.json.

Para desarrollo local, Wrangler puede usar `tienda-deportiva-api/.dev.vars` con los nombres de secrets documentados. Ese archivo está ignorado y no se incluye en el repositorio. Utilizar credenciales y recursos de prueba adecuados: ejecutar localmente el Worker no convierte automáticamente sus llamadas REST en emuladas.

El frontend es estático: no hay package.json raíz, build ni comando npm formal para servirlo. Servir la raíz mediante un servidor HTTP local elegido por el desarrollador. Firebase Auth requiere que el dominio utilizado esté autorizado.

El endpoint del checkout en `script.js` apunta al Worker remoto. Servir el frontend localmente no lo conecta automáticamente a `wrangler dev`; tampoco cambia el proyecto Firebase. No hay selección automática de entornos.

La configuración Firebase no declara emuladores. Firebase CLI se utiliza para administrar el proyecto y desplegar Hosting/Rules; su instalación no es una dependencia npm de este repositorio.

## Deploy

Los siguientes comandos se documentan para ejecución manual autorizada; crear este README no los ejecuta. Worker y Hosting se publican por separado.

### Cloudflare Worker

Con las dependencias instaladas, cuenta autenticada y secrets configurados, desde la raíz:

```sh
cd tienda-deportiva-api
npx wrangler deploy
```

Alternativa equivalente dentro de esa carpeta: `npm run deploy`. Wrangler utiliza `wrangler.jsonc` y `src/worker.js`.

### Firebase Hosting

Desde la raíz, con Firebase CLI autenticada:

```sh
firebase deploy --only hosting
```

`firebase.json` publica desde `"."`; `.firebaserc` selecciona el proyecto predeterminado. Hosting excluye el Worker, dependencias, archivos ocultos y configuración enumerada en `hosting.ignore`. No hay compilación frontend previa. README.md no está excluido y quedará dentro del contenido público de Hosting.

Este comando no publica el Worker ni las reglas de Firestore. Si se modifica `firestore.rules`, su publicación es una operación separada y explícita desde la raíz:

```sh
firebase deploy --only firestore:rules
```

Revisar los cambios y comprobar el destino antes de publicar. Las dos configuraciones de despliegue son independientes.

## Configuración de Mercado Pago

Utilizar la aplicación y credencial de producción correspondientes a la tienda, y configurar la notificación `payment` con la URL del webhook indicada arriba. El secreto de firma debe corresponder a esa configuración.

El Worker utiliza Checkout Pro y crea preferencias con estas URLs de retorno:

- [success.html](https://tienda-deportiva-b14c3.web.app/success.html)
- [pending.html](https://tienda-deportiva-b14c3.web.app/pending.html)
- [failure.html](https://tienda-deportiva-b14c3.web.app/failure.html)

`auto_return` se configura como `approved`. Las páginas de retorno no escriben ni certifican el estado financiero. La confirmación se obtiene del webhook validado y del payment consultado a la API de Mercado Pago.

## Pruebas antes y después de publicar

Comprobación sintáctica desde la raíz:

```sh
node --check tienda-deportiva-api/src/worker.js
node --check script.js
```

Estas comprobaciones no sustituyen las pruebas funcionales. Los escenarios de hardening se validaron mediante simulaciones controladas; no hay una suite automatizada persistida en el repositorio.

- [ ] Registro/login/logout y panel de cuenta.
- [ ] Carrito persistente, cantidades, eliminación, total y bloqueo al superar 10 unidades.
- [ ] Búsqueda de varias palabras, categorías, destacados y responsive.
- [ ] Checkout con token válido: preferencia, orden `pending_payment` y posterior entrega de `init_point`.
- [ ] Webhook válido, primera aprobación y duplicados sin escrituras adicionales.
- [ ] Conflictos de monto, moneda y payment ID sin aprobación indebida.
- [ ] Mis Compras: estados visibles, montos reembolsados y exclusión de pendientes.
- [ ] Logout/cambio de usuario y respuestas antiguas sin mostrar datos de otra sesión.
- [ ] Refund parcial, refund total y contracargo; preservación de fechaPago y payment ID.
- [ ] Timeouts, entradas inválidas, límites de body y carreras de actualización.
- [ ] Página de retorno informativa y navegación a la tienda.

Usar entornos o simuladores seguros para refunds, chargebacks, fallos y concurrencia. No es obligatorio ni recomendable provocar un contracargo real en producción para completar el checklist. Después de publicar, verificar disponibilidad y el flujo autorizado sin generar operaciones financieras innecesarias.

## Limitaciones y evolución

- Evaluar rate limiting administrado en Cloudflare según hostname, plan y tráfico; no hay contadores globales en memoria ni un limitador implementado.
- Considerar lectura de body con corte por bytes si se necesita protección estricta de memoria.
- Conectar logs estructurados con alertas externas y un procedimiento de revisión de anomalías.
- Incorporar reconciliación de preferencias huérfanas/resultados inciertos, sin reintentos ciegos de escrituras.
- Añadir comprobaciones explícitas de `live_mode` y `collector_id` si se decide fijar entorno/cuenta.
- Evaluar una política temporal adicional contra replay y un presupuesto total del webhook si las mediciones lo justifican.
- Completar favicon y detalles visuales.
- Extraer en el futuro un starter-ecommerce: parametrizar catálogo, marca, URLs y proyectos. Esa abstracción no existe actualmente.

Son mejoras de operación y reutilización, no una afirmación de fallos críticos presentes en el flujo validado.

## Producción y versionado

| Recurso | Referencia |
|---|---|
| Firebase Hosting | [tienda-deportiva-b14c3.web.app](https://tienda-deportiva-b14c3.web.app) |
| Cloudflare Worker | [tienda-deportiva-api.lautaroantonini10.workers.dev](https://tienda-deportiva-api.lautaroantonini10.workers.dev) |
| Firebase Project ID | `tienda-deportiva-b14c3` |

Estas referencias coinciden con la configuración del proyecto; el repositorio no certifica qué revisión está desplegada en cada servicio.

La versión estable se etiquetará **`v1.0-production`** después de las verificaciones y del despliegue autorizado. Este documento no crea el tag ni afirma que ya exista. La versión npm del paquete privado del Worker permanece en `0.0.0`; el tag previsto identifica la entrega estable del proyecto completo.

