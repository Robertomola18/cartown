# Car Town — guía del juego

Car Town es un juego de gestión de garaje y coches para navegador, inspirado en
el clásico Car Town de Facebook. Es un proyecto fan no comercial: no está
afiliado a Cie Games, Glu ni al juego original.

La partida empieza con un garaje pequeño, un coche y algo de dinero. A partir de
ahí puedes atender clientes, ganar monedas y experiencia, comprar y mejorar
coches, ampliar el taller, decorar el garaje, conducir por el pueblo y competir
en carreras de cuarto de milla contra la IA o contra otros jugadores.

## Acceso

- En local: `http://localhost:3000/cartown/login` después de `npm start`.
- En Docker: `http://localhost:3000/cartown/login` después de `docker compose up -d --build`.
- Detrás de un proxy inverso: la ruta pública debe coincidir con `CARTON_BASE_PATH` y debe pasar `/cartown/` y `/cartown/ws` sin reescribir el prefijo.
- El panel de administración está en `/cartown/admin` tras iniciar sesión con una cuenta con rol de administrador.

El juego usa cuentas propias, independientes de KMtracker: usuario y contraseña,
sin correo electrónico. La primera visita redirige al registro o al inicio de
sesión. El registro está abierto por defecto; se puede cerrar con
`CARTON_REGISTRATION=closed` y proteger con `CARTON_INVITE_CODE`.

## Qué se puede hacer

| Zona | Contenido |
| --- | --- |
| **Garaje** | Garaje isométrico con elevadores, zona de lavado, cabina de pintura, decoración y ampliaciones de parcela. |
| **Clientes** | Coches NPC que llegan y piden servicios: aceite, neumáticos, frenos, puesta a punto, lavado, cera o repintado. |
| **Trabajos y taller** | Coches de la calle de 1-3 min con pago bajo y hasta 8 encargos del panel Trabajos de hasta 24 h / 2600 monedas, más una mejora de un coche propio al 60 % del precio. Cada estación solo admite el servicio correspondiente y cada mecánico atiende un coche; se pueden contratar hasta 6 mecánicos. |
| **Comprar coches** | Expositor con los vehículos integrados más los coches creados desde el panel de administración, incluidas 4 hipercoches de nivel 100–200. |
| **Pintura y tuning** | Pintura, acabados, techo bicolor, llantas, pinzas, vinilos, alerones, tintado, altura, neón y mejoras de motor, turbo, cambio, neumáticos, peso y nitro. |
| **Editar garaje** | Compra, coloca, mueve, gira y vende objetos; cambia suelos, paredes y amplía el taller. |
| **Carreras** | Cuarto de milla con árbol de salida, revoluciones, cambio en zona verde y nitro. Incluye IA, amigos NPC, multijugador local y carreras online. |
| **Pueblo** | Conduce el coche activo o baja a pie (`F`): concesionario, taller de pintura, circuito, gasolinera (monedas o Car Town Cash), lavadero, tu garaje y casas de amigos. Al salir de una tienda vuelves al pueblo. |
| **Social** | Amigos por usuario o código, muro, me gusta, retos, visitas a garajes de amigos o bots (solo lectura, con likes), y ranking global con opción de ocultarse. |
| **Idiomas** | Español, inglés y portugués de Brasil, además de tutorial guiado y sonido sintetizado. |

## Controles

| Lugar | Teclas |
| --- | --- |
| Garaje | Arrastrar para mover, rueda o `+`/`−` para zoom, clic en coches y clientes. En el editor, `R` gira y `Esc` cancela. |
| Carrera individual | `Espacio` o clic: mantener para revolucionar antes de la salida y pulsar para cambiar. `N` usa el nitro. |
| Carrera de 2 jugadores | Jugador 1: `Z` revoluciona/cambia, `X` nitro. Jugador 2: `M` revoluciona/cambia, `N` nitro. |
| Pueblo | `WASD` o flechas para conducir, `Espacio` frena, `E` entra en un sitio, `C` cambia la cámara, `H` toca el claxon, `F` alterna coche/a pie y `Esc` vuelve al garaje. |

## Cuenta, progreso y guardado

- Las contraseñas se guardan con scrypt y las sesiones viven en SQLite.
- No hay longitud mínima de contraseña: solo se rechaza una contraseña vacía y
  se limita el máximo a 128 caracteres.
- Cada usuario tiene su propia partida, sus coches, su garaje, sus trabajos y sus
  estadísticas.
- El estado se guarda en el servidor con debounce desde el cliente.
- El guardado usa **revisión optimista**: si dos pestañas intentan guardar a la
  vez, la segunda recibe un conflicto, se avisa al jugador y no se sobrescribe
  la partida buena.
- La base de datos SQLite vive en RAM (`/dev/shm/cartown`) para no castigar la
  tarjeta SD. Se hacen snapshots periódicos y al parar el contenedor, y el
  servidor restaura el último snapshot válido al arrancar.
- Los trabajos se calculan por fecha (`endsAt`), así que el tiempo sigue
  pasando aunque el contenedor esté apagado.

## Cuentas y administración

La administración web está en `/cartown/admin` y requiere una cuenta con rol de
administrador. Permite ver usuarios, banear cuentas, resetear partidas o
contraseñas, ajustar nivel y dinero, forzar el tutorial, gestionar la
visibilidad en el ranking, borrar cuentas y crear o editar bots y coches
personalizados.

También existe una CLI de administración:

```bash
node server/admin.js ensure-owner
node server/admin.js list
node server/admin.js force-tutorial TU_USUARIO
node server/admin.js set-money TU_USUARIO 50000 25
node server/admin.js ranking-opt-out TU_USUARIO
node server/admin.js audit 40
```

Al resetear una contraseña se revocan las sesiones anteriores. Los campos de
dinero o nivel vacíos conservan el valor actual.

## Despliegue

El juego sirve `/cartown/` por defecto; define `CARTON_BASE_PATH=/` para
servirlo en la raíz.

```bash
docker compose up -d --build
```

El contenedor usa:

- Escucha solo en `127.0.0.1:3000`; exponlo a internet mediante tu proxy inverso.
- Red Docker local, sin dependencias de redes externas.
- Volumen `cartown_data` para snapshots y datos persistentes.
- tmpfs para SQLite y `/tmp`.
- Sistema de ficheros de solo lectura, `cap_drop: ALL` y `no-new-privileges`.
- `restart: unless-stopped`.

Tras un proxy HTTPS, activa `CARTON_TRUST_PROXY=1` y `CARTON_COOKIE_SECURE=1`.
El proxy debe pasar la ruta completa, incluidas `/cartown/` y `/cartown/ws`, sin
reescribir el prefijo.

Para copiar snapshots fuera del host, monta un directorio en `/nas` y define
`CARTON_NAS_DIR=/nas`.

## Estructura técnica

```text
src/
  app.js            cambio de escenas y conexión de sistemas
  core/             bucle de render, audio, i18n y utilidades
  cars/             generación de coches, ruedas y pintura
  game/             estado, economía, clientes, física, amigos y red
  scenes/           garaje, expositor, circuito y pueblo
  world/            atrezzo, personajes, texturas, tráfico y entorno
  ui/               HUD, tienda, pintura, editor, carreras y paneles
server/
  server.js         HTTP, WebSocket y ficheros estáticos
  auth.js           contraseñas scrypt, sesiones, CSRF y límites
  db.js             usuarios, partidas, social y snapshots
  social.js         amigos, muro, me gusta, retos, visitas y ranking
  admin.js          CLI de administración
  adminOps.js       acciones compartidas de administración
  pages.js          login, registro y panel de administración
  state.js          saneado y validación del estado de partida
```

Para detalles de modelos de coches, controles y desarrollo local, consulta el
[`README.md`](README.md).

## Mantenimiento

- No borres el volumen `cartown_data` sin una copia verificada.
- Haz copias con `snapshotNow()` o `VACUUM INTO`; nunca copies la BD en vivo con `cat`.
- Mantén `CARTON_TRUST_PROXY=1` y `CARTON_COOKIE_SECURE=1` detrás de un proxy HTTPS.
- Si el proxy reescribe `/cartown`, el login, los assets y la API fallan: pasa la
  ruta completa al servidor.
- Para un rollback, conserva la imagen anterior y recrea el contenedor con esa
  etiqueta usando el mismo volumen.
