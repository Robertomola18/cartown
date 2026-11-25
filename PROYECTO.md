# Car Town — proyecto

Juego de gestión de garaje para navegador, inspirado en el clásico Car Town de Facebook. Es un proyecto fan no comercial, sin afiliación con Cie Games, Glu ni el juego original.

## Objetivo

Recuperar la experiencia de gestionar un garaje: atender clientes, reparar y personalizar coches, comprar vehículos, decorar y ampliar el taller, conducir por el pueblo y competir en carreras de cuarto de milla. La versión actual es multijugador ligero con cuentas propias, amigos, muro, visitas, retos y ranking.

## Estado

Versión actual: `20261125w`. El juego corre bajo `/cartown/` de forma autónoma, con SQLite en RAM y snapshots persistentes. Incluye tutorial guiado, administración web y CLI, y las nuevas piezas de suelo, barreras de terciopelo y mesas con herramientas auto-snapeadas.

## Tecnología

- Cliente: JavaScript, Three.js y Vite. Los coches, texturas y sonidos se generan por código, sin modelos externos.
- Servidor: Node.js, SQLite (`node:sqlite`), WebSocket y HTML generado para login/registro/admin.
- Contenedor: Node 24 Alpine, rootfs de solo lectura, tmpfs para SQLite, sin puertos publicados en el host.
- Idiomas: español, inglés y portugués de Brasil.

## Estructura

```text
src/       cliente: escenas, coches, mundo, UI, estado y red
server/    auth, saves, social, admin, páginas y servidor HTTP/WS
tests/     pruebas de la máquina del tutorial
docs/      capturas comparativas
dev/       laboratorio de modelos de coches
```

## Puesta en marcha local

Requisitos: Node.js 24 y npm.

```bash
npm ci
npm run build
npm start
```

Abre `http://localhost:3000/cartown/login`. El registro está abierto por defecto. Para cerrarlo, usa `CARTON_REGISTRATION=closed`; también puedes exigir `CARTON_INVITE_CODE`.

Para desarrollo con recarga automática:

```bash
npm start    # terminal 1: API en :3000
npm run dev  # terminal 2: Vite en :5173
```

Pruebas y build:

```bash
npm test
npm run build
```

## Docker

```bash
docker compose up -d --build
```

El contenedor escucha solo en `127.0.0.1:3000`, usa la red Docker por defecto y
guarda snapshots en el volumen `cartown_data`. La base de datos vive en
`/dev/shm/cartown` y se restaura desde `/data/emergency` al arrancar. Para copiar
snapshots fuera del host, monta un directorio en `/nas` y define `CARTON_NAS_DIR=/nas`.

No copies la base de datos en vivo con `cat`: usa `snapshotNow()` o `VACUUM INTO`, porque el WAL puede dejar la copia desfasada.

## Cuentas y administración

El primer usuario administrador se crea con:

```bash
node server/admin.js ensure-owner TU_USUARIO TU_CONTRASEÑA
```

El panel web está en `/cartown/admin` y permite gestionar cuentas, bots, coches,garajes y auditoría. La CLI ofrece `list`, `audit`, `ban`, `unban`, `admin`, `force-tutorial`, `set-money`, `reset-password`, `reset-sessions` y más; ejecuta `node server/admin.js` para ver las opciones.

## Guardado

Cada usuario tiene su propia partida en SQLite. El guardado usa revisión optimista: si dos pestañas intentan escribir a la vez, la segunda recibe un conflicto y no sobrescribe la partida válida. Los trabajos siguen avanzando por fecha aunque el juego esté cerrado. Se toman snapshots automáticos cada 5 minutos y al detener el contenedor.

## Controles

| Zona | Controles |
| --- | --- |
| Garaje | Arrastrar para mover, rueda o `+`/`−` para zoom. En el editor, `R` gira y `Esc` cancela. |
| Carrera | `Espacio` o clic para revolucionar y cambiar; `N` usa nitro. En 2 jugadores: P1 `Z`/`X`, P2 `M`/`N`. |
| Pueblo | `WASD` o flechas, `Espacio` frena, `E` entra, `C` cámara, `H` claxon, `F` coche/a pie, `Esc` vuelve. |

## Funcionalidades principales

- Garaje isométrico con elevadores, lavadero, cabina de pintura, decoración y ampliaciones.
- Clientes con servicios en tiempo real y recompensas de monedas, XP y puntos de lujo.
- Compra y personalización de coches: pintura, acabados, llantas, vinilos, mejoras mecánicas y estéticas.
- Editor de garaje con suelos, paredes, parches planos, barreras de terciopelo, mesas y herramientas pequeñas.
- Carreras de cuarto de milla contra IA, amigos NPC, jugador local y rivales online.
- Pueblo con concesionario, taller, circuito, gasolinera, lavadero y casas de amigos.
- Social: amigos, muro, likes, retos, visitas read-only y ranking global.
- Tutorial guiado y sonido sintetizado.

## Despliegue en RSILVA

Para servirlo tras un proxy inverso, mantén `CARTON_BASE_PATH` igual a la ruta
pública y pasa `/cartown/` y `/cartown/ws` sin reescribir. Activa
`CARTON_TRUST_PROXY=1` y `CARTON_COOKIE_SECURE=1` cuando el proxy termine TLS.

## Aviso

Proyecto sin ánimo de lucro. Las marcas de coches se usan solo para identificar los vehículos recreados. Todos los modelos, texturas y sonidos se generan por código.
