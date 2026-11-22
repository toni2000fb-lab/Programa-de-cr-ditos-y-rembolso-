# Sistema de Aprobación de Créditos y Desembolsos

Autor: Anthony Ramirez

Aplicación full-stack para registrar solicitudes de crédito, consultar un buró crediticio simulado
(lento e inestable), y que un analista las revise, apruebe o rechace contra un presupuesto global
de **Q50,000.00** (quetzales), con auditoría inmutable en tiempo real.

**Stack:** Next.js 15 (App Router) · TypeScript estricto · API Routes + Zod · Prisma · PostgreSQL 16 · Vitest · Docker Compose.

---

## Levantar el proyecto

Requisitos: Docker con Docker Compose.

```bash
docker compose up --build
```

Abre <http://localhost:3000>. Al arrancar, el contenedor aplica las migraciones, carga los usuarios
de prueba y crea el presupuesto inicial (de forma idempotente).

Para empezar desde cero (borra la base de datos): `docker compose down -v`.

Si el puerto 3000 de tu equipo está ocupado (`port is already allocated`), elige otro con `APP_PORT`.
En PowerShell: `$env:APP_PORT=3001; docker compose up`. En bash: `APP_PORT=3001 docker compose up`. Después
abre `http://localhost:3001`. También puedes dejar la variable en un archivo `.env` junto al compose.

La base de datos también queda disponible en `localhost:5433` (sólo desde tu equipo), por si quieres
conectarte con un cliente SQL o correr los tests fuera de Docker. Si ese puerto está ocupado, cambia el
valor con la variable `DB_PORT` (por ejemplo `DB_PORT=5434 docker compose up`). No afecta a la app, que
usa la red interna de Docker.

### Usuarios de prueba

En la pantalla de inicio hay un **selector de usuarios**; no hacen falta contraseñas.

| Usuario       | Rol               | Puede                                                        |
|---------------|-------------------|--------------------------------------------------------------|
| Ana Torres    | Asesor de crédito | Registrar solicitudes de sus clientes y consultar las suyas  |
| Luis Gómez    | Asesor de crédito | Ídem (sirve para comprobar que no ve las solicitudes de Ana) |
| Carla Méndez  | Analista          | Revisar, aprobar, rechazar, ver el detalle de cada cliente y la auditoría |
| Diego Rojas   | Analista          | Ídem (útil para probar dos analistas a la vez)               |

En el código y en la base de datos el rol del asesor sigue llamándose `SOLICITANTE`; solo cambia el
nombre que se muestra, porque quien solicita el crédito es el cliente y no quien usa el sistema.

### Flujo para probarlo

1. Entra como **Ana** y registra la solicitud de un cliente, eligiendo el tiempo en su trabajo actual. La tabla de
   amortización se recalcula mientras escribes.
   Prueba un monto mayor al 40 % del ingreso, o repetir el mismo documento, para ver los bloqueos.
2. La solicitud aparece con el estado del buró ("Consultando buró…"). La consulta se hace en
   segundo plano con reintentos, así que puedes seguir navegando.
3. Entra como **Carla**: "Tomar en revisión" → "Aprobar" (el monto se descuenta del presupuesto) o
   "Rechazar" (motivo de al menos 15 caracteres).
   En la lista puedes pulsar las tarjetas de estado para filtrar, buscar por nombre, documento o ID,
   y ordenar por fecha, monto o nombre. Con "Marcar urgente" una solicitud abierta aparece primero y
   con su etiqueta, y el botón "Solo urgentes" deja únicamente esas. Cada solicitud muestra además su
   prioridad (Alta, Media o Baja), que puedes filtrar y usar para ordenar.
   Al pulsar la fila de un cliente se abre su **detalle**: datos del cliente, crédito solicitado,
   verificación de las condiciones para aprobar, buró, historial de ese documento, tabla de
   amortización y seguimiento. Desde ahí también se puede revisar, aprobar, rechazar y marcar urgente.
4. Abre **Auditoría** en otra pestaña: las transiciones aparecen en vivo.

### Desarrollo local (la app fuera de Docker)

Requisitos: Node 22 y una base PostgreSQL (la del compose sirve).

```bash
cp .env.example .env
docker compose up -d db
npm install
npx prisma migrate deploy && npx prisma db seed
npm run dev
```

Abre <http://localhost:3000>. `BUREAU_BASE_URL` debe apuntar al puerto donde corre la app, porque el
buró simulado vive en la propia aplicación.

### Ejecutar los tests

Con Docker (unitarios + integración contra PostgreSQL real):

```bash
docker compose --profile test run --rm tests
```

En local (Node 22):

```bash
npm install
docker compose up -d db
DATABASE_URL="postgresql://creditos:creditos@localhost:5433/creditos_test" npm test
```

La base `creditos_test` la crea el contenedor de Postgres al inicializarse
(`docker/init-test-db.sql`), y los tests aplican las migraciones antes de ejecutarse.

| Archivo | Qué verifica |
|---|---|
| `tests/integration/approval.test.ts` | **20 aprobaciones simultáneas** de la misma solicitud: sólo una se aplica, el presupuesto baja una vez y hay una sola entrada de auditoría. Doble clic con la **misma clave de idempotencia** devuelve la misma respuesta. Varias solicitudes compitiendo por el presupuesto **nunca lo dejan negativo**. No se puede aprobar una rechazada. Un asesor de crédito no puede aprobar. La auditoría no se puede modificar ni borrar. |
| `tests/integration/history.test.ts` | Regla de los 30 días (incluidos **envíos simultáneos** del mismo documento), el mensaje exacto del bloqueo y la validación del 40 % en el servidor. |
| `tests/unit/rules.test.ts` | Límite del 40 % (en centavos), plazos válidos, motivo de rechazo y máquina de estados. |
| `tests/unit/amortization.test.ts` | Cuota fija con 1.5 % mensual y cuadre de capital y saldo. |
| `tests/unit/retry.test.ts` | Reintentos ante 503, sin reintentos ante 4xx y backoff exponencial. |
| `tests/unit/session.test.ts` | Rechazo de cookies de sesión manipuladas o expiradas. |
| `tests/integration/routes.test.ts` | Permisos **en las rutas HTTP**: sin sesión 401, asesor de crédito 403 en cada ruta de analista, analista 403 al crear, cookie manipulada o de usuario inexistente 401, visibilidad por asesor, detalle del cliente e idempotencia de la aprobación por HTTP. |
| `tests/integration/idempotency.test.ts` | Las claves de idempotencia de más de 24 h se limpian solas y las recientes se conservan. |
| `tests/unit/bureau-retry.test.ts` | Cuándo el analista puede relanzar el buró: fallido o atascado más de 60 s, nunca completado ni en solicitudes resueltas. |
| `tests/unit/bureau-route.test.ts` | El buró simulado exige su credencial: 401 sin token o con uno incorrecto. |

Calidad estática: `npm run typecheck` y `npm run lint`. El workflow de GitHub Actions
(`.github/workflows/ci.yml`) ejecuta typecheck, lint y toda la suite contra un PostgreSQL real en cada
push y pull request.

---

## Arquitectura

```
src/
  domain/          Reglas puras, compartidas por frontend y backend
    rules.ts         Esquemas Zod (creación, rechazo), límite del 40%, constantes
    amortization.ts  Tabla de amortización
    stateMachine.ts  Transiciones permitidas
  lib/retry.ts     Reintentos con backoff exponencial y jitter
  server/
    auth/          Sesión firmada (HMAC) y guardas de rol
    services/      Casos de uso: solicitudes, flujo de aprobación, buró, auditoría, idempotencia
    http.ts        Traducción de errores de dominio a HTTP
  app/
    api/           Route handlers delgados: autentican, validan y delegan en services
    (páginas)      /login, /asesor, /analista, /analista/solicitudes/[id], /analista/auditoria
  components/      Componentes cliente
prisma/            Esquema, migración (con constraints y trigger) y seed
tests/             unit/ e integration/
```

Los route handlers no contienen lógica de negocio. Los servicios reciben el cliente de BD y el actor
como parámetros, así que los tests de integración los llaman directamente contra PostgreSQL.

## Decisiones técnicas

### Concurrencia en la aprobación y el presupuesto
La aprobación ocurre en **una sola transacción** con dos actualizaciones condicionales
(compare-and-set):

1. `UPDATE credit_requests SET status='APROBADA' WHERE id=$1 AND status='EN_REVISION' AND bureau_status='COMPLETADO'`
2. `UPDATE budget SET available = available - $monto WHERE id=1 AND available >= $monto`

Con READ COMMITTED de PostgreSQL, una segunda transacción concurrente espera el bloqueo de fila de
la primera y, al reevaluar el `WHERE`, no encuentra filas: sólo una gana y las demás reciben `409`.
Si el presupuesto no alcanza, se revierte toda la transacción (la solicitud sigue `EN_REVISION`).
Además hay un `CHECK (available_cents >= 0)` en la BD como última línea de defensa.

### Idempotencia
`POST /approve` y `POST /reject` exigen la cabecera `Idempotency-Key`. La respuesta se guarda en la
misma transacción que el cambio de estado. Si se repite la clave, se devuelve la respuesta original
(cabecera `Idempotent-Replayed: true`) sin volver a ejecutar nada. La interfaz genera una clave por
cada intención de decisión y deshabilita el botón mientras la petición está en curso. Las claves se
conservan 24 h y se limpian solas al completar una decisión, así la tabla no crece sin límite.

### Regla de historial de 30 días y concurrencia al crear
La creación toma un `pg_advisory_xact_lock` por documento, así que dos envíos simultáneos del mismo
documento no pueden saltarse la regla.

### Buró crediticio simulado y resiliencia
- `GET /api/bureau/:documento` simula el servicio externo: latencia de 2 a 4 s y alrededor de 30 % de
  respuestas `503`. El puntaje es determinista por documento. Como servicio externo exige su propia
  credencial en la cabecera `x-internal-token`: se deriva de `SESSION_SECRET` (o se fija con
  `BUREAU_API_TOKEN`) y el cliente de la app la envía sola. Sin ella responde `401` al instante.
- El cliente (`fetchBureauReport`) hace hasta **5 intentos** con **backoff exponencial**
  (0.5 s, 1 s, 2 s, 4 s, con jitter del 30 %) y un timeout de 6 s por intento. Sólo reintenta
  errores transitorios (5xx, 429, red y timeout), nunca un 4xx.
- Al crear la solicitud, la consulta se ejecuta **después de responder** (`after()` de Next.js), así
  que el usuario no espera. La interfaz muestra el estado (`Consultando…`, puntaje o
  `No disponible`) y consulta periódicamente. Si se agotan los reintentos, el analista puede pulsar
  "Reintentar buró". El mismo botón aparece si una consulta lleva más de 60 s sin avanzar (por ejemplo,
  si el servidor se reinició a mitad de la consulta), y el servidor aplica el mismo umbral para no
  duplicar consultas que sí están en curso.
- **Aprobar exige una consulta de buró completada.** Rechazar no la exige.

### Roles y seguridad
- La cookie de sesión está firmada con HMAC-SHA256 (`SESSION_SECRET`), es `httpOnly` y sólo contiene
  el id del usuario y la expiración. **El rol se lee siempre de la base de datos** en el servidor.
- Cada endpoint llama a `requireUser(rol)`, y los servicios vuelven a comprobar el rol (defensa en
  profundidad). Un asesor de crédito solo ve las solicitudes que registró, y una que no es suya responde `404`.
- Las páginas también redirigen según el rol, pero la seguridad no depende de eso.
- El selector de usuarios es un mecanismo de demostración que la prueba permite explícitamente.
  En producción se reemplazaría por un proveedor de identidad real.

### Auditoría inmutable y en tiempo real
- Cada transición inserta una fila en `audit_logs` **dentro de la misma transacción** que el cambio
  de estado, con id de la solicitud, usuario, rol, timestamp ISO 8601, estado anterior, estado nuevo
  y comentario.
- Un **trigger de PostgreSQL** rechaza cualquier `UPDATE`, `DELETE` o `TRUNCATE` sobre la tabla.
- El panel recibe las entradas nuevas por **Server-Sent Events** (`/api/audit/stream`) y se reconecta
  solo si se corta la conexión.

### Dinero
Los importes se muestran en **quetzales** (`Q50,000.00`). Todos se guardan como **enteros en centavos**,
así se evitan los errores de coma flotante. El límite del 40 % se calcula con aritmética entera (`monto·10 ≤ ingreso·4`) y está
replicado como `CHECK` en la BD.

### Validación en frontend y backend
El mismo esquema Zod (`src/domain/rules.ts`) valida el formulario mientras se escribe y el cuerpo
de la petición en la API. La regla de historial se consulta en vivo al escribir el documento
(`/api/requests/eligibility`) y se vuelve a verificar al crear.

## Interpretaciones de la especificación

- **Estado "PENDIENTE"**: la regla de los 30 días menciona un estado `PENDIENTE` que no existe en el
  ciclo `CREADA → EN_REVISION → APROBADA/RECHAZADA`. Se interpreta como **toda solicitud aún no
  resuelta: `CREADA` o `EN_REVISION`**. Para esas se usa la fecha de creación. Para las `RECHAZADA` se
  usa la **fecha del rechazo**, así que el bloqueo dura 30 días desde la decisión.
- **Límite del 40 %**: la especificación lo aplica al **monto solicitado** (no a la cuota mensual),
  y así se implementó, literalmente. Si la intención fuera limitar la cuota, sólo habría que cambiar
  `exceedsDebtLimit` en `src/domain/rules.ts` y el `CHECK` de la migración.
- **Tabla de amortización**: se usa el sistema francés (cuota fija) con interés fijo del 1.5 %
  mensual sobre el saldo. La última cuota absorbe los redondeos a centavos.
- **Moneda**: la especificación habla de un presupuesto de `$50,000.00 USD`. Como la operación es en
  Guatemala, la interfaz y los mensajes muestran quetzales. No hay conversión, el presupuesto sigue
  siendo el mismo número (`Q50,000.00`). Para volver a dólares basta con cambiar `CURRENCY_CODE`,
  `CURRENCY_SYMBOL` y `formatMoney` en `src/domain/money.ts`, y las etiquetas `(GTQ)` del formulario.
- **Prioridad por antigüedad laboral**: el asesor de crédito registra cuánto tiempo lleva el cliente en su trabajo
  actual y de ahí sale la prioridad por una regla fija: menos de 1 año es **Baja**, de 1 a menos de
  3 años es **Media** y 3 años o más es **Alta**. Los rangos se dejaron contiguos para que no quede
  ningún valor sin cubrir. Solo se guarda la antigüedad (`employment_tenure`); la prioridad se calcula
  al mostrarla, así que cambiar la regla es editar una tabla en `src/domain/priority.ts`. Las
  solicitudes anteriores a este dato muestran "Sin dato" y van al final al ordenar por prioridad. Con
  la misma prioridad se atiende primero la que lleva más tiempo esperando. La prioridad solo ordena la
  cola, no cambia ninguna regla: el 40 %, los 30 días, el buró y el presupuesto se aplican igual.
- **Marca de urgente**: es una herramienta interna del analista para atender antes a un cliente
  importante. Solo se puede cambiar mientras la solicitud está abierta (`CREADA` o `EN_REVISION`), el
  asesor de crédito no la ve y no cambia ninguna regla: el 40 %, los 30 días, el buró y el presupuesto se
  aplican igual. Cada cambio queda en la auditoría con el mismo estado como anterior y nuevo.
- **Detalle del cliente**: es solo para analistas y reúne en una pantalla lo que hoy se sabe de la
  solicitud. El bloque "Verificación para aprobar" repite las mismas condiciones que el servidor
  exige al aprobar (en revisión, buró completado y presupuesto suficiente) más la regla del 40 %,
  para que el analista vea de un vistazo qué falta. No decide nada: el servidor vuelve a validar
  todo al aprobar. La cuota sobre el ingreso se muestra como dato informativo, sin umbral, porque
  la especificación no define uno.
- **"Tomar en revisión"** es una acción explícita del analista (`CREADA → EN_REVISION`) y queda
  auditada como cualquier otra transición.

## API

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` · `/api/auth/logout` | — | Iniciar / cerrar sesión con un usuario de prueba |
| GET | `/api/requests` | ambos | Listado (el asesor solo ve las suyas) |
| GET | `/api/requests/:id` | Analista | Detalle del cliente: solicitud, asesor, historial del documento, auditoría y presupuesto |
| POST | `/api/requests` | Asesor de crédito | Crear solicitud (exige `employmentTenure`) |
| GET | `/api/requests/eligibility?documentId=` | Asesor de crédito | Comprobar la regla de 30 días |
| POST | `/api/requests/:id/review` | Analista | `CREADA → EN_REVISION` |
| POST | `/api/requests/:id/approve` | Analista | Aprobar (requiere `Idempotency-Key`) |
| POST | `/api/requests/:id/reject` | Analista | Rechazar con `{ reason }` (requiere `Idempotency-Key`) |
| POST | `/api/requests/:id/bureau` | Analista | Volver a consultar el buró |
| POST | `/api/requests/:id/urgent` | Analista | Marcar o quitar la marca de urgente con `{ urgent: true }` |
| GET | `/api/budget` | Analista | Presupuesto global |
| GET | `/api/audit` · `/api/audit/stream` | Analista | Auditoría (listado / SSE) |
| GET | `/api/bureau/:documentId` | token interno | Buró simulado (servicio "externo"), cabecera `x-internal-token` |

Los errores siguen el formato `{ "error": { "code", "message", "details" } }` con su código HTTP
(400 validación, 401, 403, 404, 409 conflictos de negocio, 422 clave de idempotencia reutilizada).

## Variables de entorno

Ver `.env.example`. `docker-compose.yml` ya trae valores para desarrollo. Para cualquier despliegue
real, define `SESSION_SECRET`.

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a PostgreSQL. |
| `SESSION_SECRET` | Sí | Clave (mínimo 16 caracteres) con la que se firma la cookie de sesión. |
| `BUREAU_BASE_URL` | Sí | URL desde la que la app consulta su propio buró simulado. |
| `COOKIE_SECURE` | No | Con `true` la cookie de sesión lleva el atributo `Secure`. Actívala siempre que se sirva por HTTPS. |
| `BUREAU_API_TOKEN` | No | Credencial del buró (mínimo 16 caracteres). Si falta, se deriva de `SESSION_SECRET`. |

## Limitaciones conocidas

- La antigüedad laboral es un dato declarado: el sistema no guarda ni verifica la constancia laboral.
  El formulario recuerda que debe poder respaldarse y la comprobación queda en manos del analista.
- La auditoría en vivo consulta la base de datos cada 1.5 s por cada panel abierto. Con muchos
  analistas conectados convendría `LISTEN/NOTIFY` de PostgreSQL.
- El contenedor de la app se ejecuta como root; para producción habría que añadir un usuario sin
  privilegios en el Dockerfile.
- El lint no se ejecuta durante `docker build` (se hace en `npm run lint` y en el CI) para que la
  imagen no dependa de él.
