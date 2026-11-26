# Car Town — remake 3D

[English](README.en.md) · [Português (Brasil)](README.pt.md) · **Español**

Car Town es un remake 3D para navegador del clásico juego social de garaje, creado con [three.js](https://threejs.org). No es un proyecto oficial ni comercial: es una reconstrucción hecha a mano con modelos, texturas y sonidos generados por código.

Gestiona tu oficina, atiende clientes, compra y tunea coches, decora y amplía tu garaje, conduce por una ciudad con tráfico y peatones, compite en carreras de cuarto de milla y comparte progreso con amigos.

## Capturas del juego

Las imágenes son capturas del juego enfrentadas al original y a las fotos de referencia usadas para modelar los coches.

| Garaje del juego frente al original | Primera tanda de coches |
| --- | --- |
| ![Garaje del juego comparado con el original](docs/garage-vs-screenshot.jpg) | ![Coches del juego comparados con las fotos](docs/cars-vs-photos.jpg) |

| Segunda tanda de coches | Detalle del Opel Frontera |
| --- | --- |
| ![Segunda tanda de coches comparada con las fotos](docs/cars-vs-photos-2.jpg) | ![Opel Frontera del juego comparado con la foto](docs/frontera-vs-photo.jpg) |

Capturas directas de una partida; hay más en el [`MANUAL.md`](MANUAL.md):

| Garaje y ciudad | Menú de Carreras con miniaturas 3D |
| --- | --- |
| ![Garaje y ciudad](docs/manual/01-garage.jpg) | ![Menú de Carreras](docs/manual/02-race-menu.jpg) |

| Carrera de cuarto de milla | Concesionario y personalización |
| --- | --- |
| ![Carrera en curso](docs/manual/03-race.jpg) | ![Tienda y personalización](docs/manual/04-shop.jpg) |

## Una vuelta por el juego

1. **Entra en tu garaje.** Elige idioma, sigue el tutorial y revisa el HUD: dinero, experiencia, nivel, combustible, trabajos y menú principal.
2. **Atiende clientes de la calle.** Llegan coches NPC, aparcan y piden aceite, neumáticos, frenos, puesta a punto, lavado, encerado o repintado. Son encargos cortos de **1-3 minutos** con pago bajo: monedas base del servicio más propinas de lujo/nivel, además de XP.
3. **Usa el panel Trabajos.** Puedes aceptar hasta **8 encargos largos** (hasta **24 h** y **2600 monedas**) que siguen avanzando con el juego cerrado; además, reserva el hueco de mejora para instalar la próxima pieza con descuento.
4. **Compra y prepara coches.** El concesionario muestra 21 vehículos con estadísticas y color inicial. Después puedes cambiar acabado, techo bicolor, llantas, vinilos, alerones, cristales, suspensión, luces y mecánica.
5. **Decora el garaje.** Coloca, mueve, gira y vende elevadores, lavadero, cabina de pintura, arcade, jukebox, mesas, herramientas, alfombras, baldosas y mucho más. Hay temas de suelo y pared y ampliaciones del solar.
6. **Sal a la ciudad.** Conduce por el concesionario, taller, pista, gasolinera, lavadero, tu garaje y casas de amigos. La ciudad tiene calles, aceras, pasos de peatones, parques, mobiliario, tráfico, peatones y minimapa.
7. **Corre el cuarto de milla.** Salida con semáforo, revolucionar, cambiar en la zona verde y nitro. Compite contra IA, amigos NPC, rivales en línea o un segundo jugador en el mismo teclado.
8. **Haz amigos.** Añade usuarios por nombre o código, publica en el muro, da me gusta, envía retos, visita talleres ajenos en modo solo lectura y sube en la clasificación global.

## Qué incluye

| Área | Características |
| --- | --- |
| **Mi garaje** | Garaje isométrico con pósters, elevadores rojos, cartel de pared, barrera de terciopelo, cruce con tráfico, coches de amigos aparcados fuera y editor de objetos. |
| **Clientes** | Coches NPC con peticiones de aceite, neumáticos, frenos, tuning, lavado, encerado y repintado. Cada servicio consume combustible y entrega monedas, experiencia y propinas. |
| **Trabajos** | Clientes de calle de 1-3 min con pago bajo; hasta 8 encargos del panel de hasta 24 h y 2600 monedas, progreso persistente y un hueco de taller para mejoras con descuento. |
| **Comprar coches** | Concesionario con 21 vehículos, estadísticas, ocho modelos destacados y elección de color antes de la compra. |
| **Pintar y tuning** | Acabados, techo bicolor, 13 diseños de llantas, vinilos, alerones, cristales, suspensión, underglow y mejoras mecánicas. |
| **Editar garaje** | Compra, coloca, mueve, gira y vende elevadores, lavadero, cabina de pintura, arcade, jukebox, mesas, herramientas y baldosas. Incluye temas de suelo y pared, ampliaciones y anclaje de herramientas a mesas. |
| **Pueblo** | Ciudad con calles, aceras elevadas, pasos de peatones, farolas, zonas verdes, mobiliario, tráfico, peatones y minimapa. Entra en concesionario, pintura, pista, gasolinera, lavadero, garaje y casas de amigos. |
| **Carreras** | Salida con semáforo, revolucionar, cambiar en la zona verde y nitro. Carreras de cuarto de milla contra IA, amigos NPC, rivales en línea o un segundo jugador en el mismo teclado. |
| **Social** | Amigos por nombre de usuario o código, muro, me gusta, retos, visitas de solo lectura y clasificación global. |
| **Tutorial y accesibilidad** | Tutorial guiado en español, inglés y portugués, con pasos persistentes, eventos identificados, avisos accesibles y repetición desde Ajustes. |
| **Sonido** | Efectos y música sintetizados por código; no hay archivos de audio externos. |

## Controles

| Zona | Controles |
| --- | --- |
| Garaje | Arrastra para mover, rueda o `+`/`−` para acercar. En el editor, `R` gira y `Esc` cancela. |
| Concesionario | Usa el HUD para comparar coches, elegir color y comprar. |
| Carrera en solitario | `Espacio` o clic para revolucionar y cambiar; `N` activa el nitro. |
| Carrera a dos jugadores | P1: `Z` revoluciona/cambia y `X` nitro. P2: `M` revoluciona/cambia y `N` nitro. |
| Pueblo | `WASD` o flechas para conducir, `Espacio` frena, `E` entra, `C` cambia la cámara, `H` toca el claxon y `Esc` vuelve al garaje. |

## Guardado y partidas

- Cada usuario tiene su propia partida en SQLite.
- La base en vivo se mantiene en memoria y se guarda mediante snapshots automáticos; los trabajos siguen avanzando aunque el juego esté cerrado.
- El primer inicio permite elegir español, inglés o portugués de Brasil. El tutorial puede repetirse desde Ajustes.
- Las cuentas son locales a la instalación: nombre de usuario y contraseña, sin correo electrónico. Las contraseñas usan scrypt y las sesiones se guardan en el servidor.

## Inicio rápido

Requisitos: Node.js 24 o superior y npm. El juego se sirve bajo `/cartown/` por defecto; define `CARTON_BASE_PATH=/` para servirlo en la raíz. La ruta pública debe coincidir con este valor.

```bash
npm ci
npm run build
npm start
```

Abre `http://localhost:3000/cartown/login`.

Para desarrollo con recarga automática, ejecuta `npm start` en una terminal y `npm run dev` en otra. Vite escucha en `:5173` y redirige la API al servidor Node en `:3000`.

```bash
npm start
npm run dev
```

## Cuentas y administración

```bash
node server/admin.js ensure-owner TU_USUARIO TU_CONTRASEÑA
node server/admin.js list
node server/admin.js force-tutorial TU_USUARIO
node server/admin.js set-money TU_USUARIO 50000 25
node server/admin.js ranking-opt-out TU_USUARIO
node server/admin.js audit 40
```

El panel web de administración está en `/cartown/admin` después de iniciar sesión con una cuenta de administrador. Permite banear o desbanear cuentas, reiniciar partidas o contraseñas, ajustar nivel y dinero, forzar el tutorial, gestionar la visibilidad en la clasificación y eliminar cuentas.

## Configuración

| Variable | Valor por defecto | Función |
| --- | --- | --- |
| `PORT` | `3000` | Puerto HTTP y WebSocket. |
| `HOST` | `0.0.0.0` | Dirección de escucha. |
| `CARTON_BASE_PATH` | `/cartown` | Prefijo público; `/` sirve el juego en la raíz. |
| `CARTON_DATA_DIR` | `var/` | Snapshots persistentes y archivos de emergencia. |
| `CARTON_RAM_DIR` | `<data>/ram` | Base de SQLite en vivo; usa tmpfs. |
| `CARTON_SNAPSHOT_MINUTES` | `5` | Intervalo entre snapshots. |
| `CARTON_REGISTRATION` | `open` | `closed` desactiva los registros. |
| `CARTON_INVITE_CODE` | vacío | Solicita un código de invitación si el registro está abierto. |
| `CARTON_SESSION_DAYS` | `30` | Duración de las sesiones. |
| `CARTON_TRUST_PROXY` | `0` | Usa `1` detrás de un proxy inverso. |
| `CARTON_COOKIE_SECURE` | `0` | Usa `1` cuando TLS termina en el proxy. |
| `CARTON_MAX_STATE_BYTES` | `2097152` | Tamaño máximo aceptado de una partida guardada. |
| `CARTON_NAS_DIR` | `<data>/nas` | Directorio opcional para copias de snapshots. |

## Docker y proxy inverso

```bash
docker compose up -d --build
```

El contenedor escucha solo en `127.0.0.1:3000`, usa la red Docker predeterminada y no necesita servicios externos. Coloca delante un proxy inverso y pasa `/cartown/` y `/cartown/ws` sin reescribir el prefijo:

```nginx
location /cartown/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Cuando el proxy gestione HTTPS, activa `CARTON_TRUST_PROXY=1` y `CARTON_COOKIE_SECURE=1`. Los datos persistentes están en el volumen `cartown_data`; la base de datos en vivo está en tmpfs. Para copiar snapshots fuera del servidor, monta un directorio en `/nas` y define `CARTON_NAS_DIR=/nas`.

## Cómo se modelan los coches

Los coches se generan por código en `src/cars/`; no hay archivos de malla externos. `bodyV2.js` crea una carrocería lisa a partir de curvas medidas en metros; `featured.js`, `featured2.js` y `featured3.js` contienen los ocho coches destacados; `archetypes.js` y `generic.js` generan el resto de modelos. Los cristales, faros, parrillas, matrículas y vinilos se dibujan en lienzos y se proyectan sobre la carrocería. Cada coche tiene dos niveles de detalle: uno para expositor y carreras, y otro ligero para garaje, tráfico y pueblo.

`dev/cars.html` sirve como laboratorio para inspeccionar los modelos, por ejemplo `http://localhost:5173/dev/cars.html?model=amgsuv&view=fq&rot=0&dist=6`. También admite cámara exacta (`pos`, `look`, `fov`) e iluminación `env=studio`.

## Estructura del proyecto

```text
src/
  app.js            cambio de escenas y conexión de sistemas
  core/             bucle de render, audio, i18n y utilidades
  cars/             generación de coches, ruedas y pintura
  game/             estado, economía, clientes, carreras, amigos y red
  scenes/           garaje, expositor, circuito y pueblo
  world/            objetos, personajes, texturas, tráfico y entorno
  ui/               HUD, tienda, pintura, editor, carreras y paneles
server/             autenticación, guardados, social, administración y WebSocket
tests/              pruebas de la máquina del tutorial
```

## Pruebas

```bash
npm test
npm run build
```

Para más detalles del juego consulta [`JUEGO.md`](JUEGO.md) y, en español, [`PROYECTO.md`](PROYECTO.md). El manual detallado con capturas está en [`MANUAL.md`](MANUAL.md).

## Aviso legal

Este proyecto es fan-made, no comercial y no está afiliado a Cie Games, Glu ni al Car Town original. Los nombres de marcas y modelos se usan únicamente para identificar los coches recreados. Todos los modelos, texturas y sonidos de este repositorio se generan por código.
