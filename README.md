# Car Town Remake

A fan-made 3D browser remake of the classic **Car Town** social game, built with
[three.js](https://threejs.org). Run your own garage, service NPC customers for
coins and XP, buy and customize cars, decorate and expand your lot, drive around
town and drag race your friends in a small social hub with friends, a wall,
challenges, visits and a global ranking.

Every car is modelled in code, at real-world proportions. That includes the six
cars from the reference photos: the **smart #2**, the **Hyundai IONIQ 3 N Line**,
the yellow **Mercedes-AMG GLC EV**, the red **Vapid** sport truck, the silver
**Opel Frontera** and the **KGM Musso Grand** pickup.

## Run it

Requirements: Node.js 24+ and npm, or Docker with Compose. The app is served
under `/cartown/` by default; set `CARTON_BASE_PATH=/` to serve it at the root.
The public path must match this value.

```bash
npm ci
npm run build
npm start
```

Open `http://localhost:3000/cartown/login`. Development mode runs Vite on
`:5173` and proxies the API to the Node server on `:3000`:

```bash
npm start
npm run dev
```

Accounts are local to this installation: username + password, no email. The
first visit redirects to the login page; registration is open by default.
Passwords are hashed with scrypt and sessions are stored server-side.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP/WebSocket port. |
| `HOST` | `0.0.0.0` | Bind address. |
| `CARTON_BASE_PATH` | `/cartown` | Public URL prefix; `/` serves at the root. |
| `CARTON_DATA_DIR` | `var/` | Persistent snapshots and emergency files. |
| `CARTON_RAM_DIR` | `<data>/ram` | Live SQLite database; use tmpfs. |
| `CARTON_SNAPSHOT_MINUTES` | `5` | Snapshot interval. |
| `CARTON_REGISTRATION` | `open` | Set to `closed` to disable signups. |
| `CARTON_INVITE_CODE` | empty | Require an invite code when registration is open. |
| `CARTON_TRUST_PROXY` | `0` | Set to `1` behind a reverse proxy. |
| `CARTON_COOKIE_SECURE` | `0` | Set to `1` when TLS terminates at the proxy. |
| `CARTON_NAS_DIR` | `<data>/nas` | Optional snapshot copy directory. |

Progress is saved per user in SQLite (in RAM, with snapshots) and synchronised
when the game is open. Jobs keep running while the game is closed. The first
visit can choose Spanish, English or Brazilian Portuguese; the tutorial is
available again from Settings.

Server administration uses the same environment variables:

```bash
node server/admin.js ensure-owner TU_USUARIO TU_CONTRASEÑA
node server/admin.js list
node server/admin.js force-tutorial TU_USUARIO
node server/admin.js set-money TU_USUARIO 50000 25
node server/admin.js ranking-opt-out TU_USUARIO
node server/admin.js audit 40
```

The web admin panel lives at `/cartown/admin` after logging in as an admin.
It can ban/unban accounts, reset saves or passwords, adjust level/money, force
the tutorial, manage ranking visibility and delete accounts.

### Docker

```bash
docker compose up -d --build
```

The compose file listens only on `127.0.0.1:3000`, uses the default Docker
network and needs no external services. Put any reverse proxy in front of it
and pass `/cartown/` and `/cartown/ws` through without rewriting the prefix:

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

Set `CARTON_TRUST_PROXY=1` and `CARTON_COOKIE_SECURE=1` when the proxy handles
HTTPS. Data lives in the `cartown_data` volume; the live SQLite database lives
in tmpfs. To copy snapshots off-host, mount any directory at `/nas` and set
`CARTON_NAS_DIR=/nas`.

## What's in the game

| Area | Features |
| --- | --- |
| **My Garage** | Isometric garage that copies the original layout: walls with posters, red service lifts, the corner billboard, the crossroads with traffic, and friends' cars parked outside with name badges. |
| **Customers** | NPC cars drive in, park on a lift, wash bay or paint booth, and ask for a service (oil, tires, brakes, tune-up, wash, wax, respray). Each service uses fuel. You earn coins and XP, plus tips from your Luxury Points. |
| **HUD** | Speedometer level gauge with an odometer for XP, coins and Car Town Cash, a fuel gauge that refills over time, Photo button, sound, fullscreen and zoom, daily goals, friends, jobs and settings. |
| **Jobs** | Up to two customer errands that run in real time and pay fuel/coins/XP when collected, plus one workshop slot per garage: install the next upgrade on one of your own cars at 60% of the normal price. The car is locked until the job ends. |
| **Buy Cars** | Studio turntable dealer with 19 cars, stats (power, weight, grip, top speed, 1/4-mile time), and a colour choice before buying. |
| **Paint & Tune** | Paint and finish (gloss, metallic, pearl, matte, chrome, candy), two-tone roof, 13 rim designs, rim and caliper colours, liveries, spoilers, window tint, stance, underglow neon. Performance upgrades: engine, turbo, gearbox, tires, weight and nitrous. |
| **Edit Garage** | Buy, place, move, rotate and sell 28 items (lifts, wash bay, paint booth, arcade, jukebox, diner booth, trophy case and more). Also floor and wall themes, and lot expansions from 14×14 up to 22×22. |
| **Drag races** | Christmas-tree start, rev to the launch zone, shift in the green zone, nitro. Race 10 street racers, 6 NPC friends, friends imported by code, online friends, a second player on the same keyboard, or a synchronous friend race. Races are 1/4 mile and the AI has skill-based reaction, launch and shift mistakes. |
| **Town** | Drive your active car around town: car dealer, paint shop, drag strip, gas station (buy fuel), car wash, your garage and friends' houses. Includes traffic, pedestrians and a minimap. |
| **Friends & Social** | Add online friends by username (no approval needed, with a notification), share **friend codes**, post on the community wall, like posts, send challenges, visit friends' garages in read-only mode and browse the global ranking with an opt-out. |
| **Other** | Spanish, English and Portuguese (BR) like the original screenshots, plus a guided tutorial. All sound effects and music are synthesised. Progress saves automatically on the server. |

## Controls

| Where | Keys |
| --- | --- |
| Garage | Drag to pan, wheel or +/− / pinch to zoom, click cars and customers. In the editor, **R** rotates and **Esc** cancels. |
| Drag race (solo) | **Space** or click: hold to rev before the green light, then tap to shift. **N** fires the nitro. |
| Drag race (2 players) | P1: **Z** rev/shift, **X** nitro. P2: **M** rev/shift, **N** nitro. |
| Town | **WASD** or arrows to drive, **Space** to brake, **E** to enter a place, **C** to change camera, **H** for the horn, **Esc** to return to the garage. |

## How the cars are modelled

The cars are generated in code; there are no mesh files (`src/cars/`):

- `bodyV2.js` lofts a single smooth shell from character curves given in
  metres: roofline, beltline, shoulder, sill, plan widths, and the nose and tail
  shape. It adds wheel wells, raised fenders and hood ridges.
- `featured.js` holds the three cars from the photos. Each has hand-tuned
  curves and drawn details:
  - smart #2: perforated "smile" grille, LED eye headlights, champagne roof
    and tridion pillar.
  - IONIQ 3 N Line: pixel light bar, gloss-black A-shaped bumper, black arch
    cladding, star rims.
  - AMG GLC EV: illuminated shield grille with vertical light bars and star,
    curved blade headlights.
- `featured2.js` holds the second batch of photo cars:
  - Vapid sport truck: cross-bar mesh grille, silver VAPID bumper plate, roof
    light pods, sail panels and a quad bike in the open bed.
  - Opel Frontera: black Vizor front with the Blitz logo, black cladding,
    two-tone blade wheels.
  - KGM Musso Grand: silver-framed geometric grille, tall headlamps, LED bar,
    MUSSO hood lettering, open bed.
- `archetypes.js` and `generic.js` build the rest of the line-up from
  body-type templates (hatch, sedan, coupe, SUV, van, pickup, off-roader,
  supercar and Beetle).
- Windows, lights, grilles, plates and liveries are drawn on canvases and
  projected onto the shell, with separate reflective glass and recolourable
  roof materials.
- Each car has two levels of detail. The detailed one is used in the
  showroom and races, the lighter one in the garage, traffic and town.

`dev/cars.html` is a small car lab for inspecting the models, for example
`http://localhost:5173/dev/cars.html?model=amgsuv&view=fq&rot=0&dist=6`.
It also takes an exact camera (`pos`, `look`, `fov`) and `env=studio` lighting.
[`docs/cars-vs-photos.jpg`](docs/cars-vs-photos.jpg),
[`docs/cars-vs-photos-2.jpg`](docs/cars-vs-photos-2.jpg) and
[`docs/frontera-vs-photo.jpg`](docs/frontera-vs-photo.jpg) show each photo car
next to its reference photo, rendered from a camera fitted to that photo, and
[`docs/garage-vs-screenshot.jpg`](docs/garage-vs-screenshot.jpg) compares the
garage with the original game.

## Project layout

```
src/
  app.js            mode switching and wiring
  core/             renderer loop, audio synth, i18n, utilities
  cars/             car generator, models, wheels, painter
  game/             state & economy, catalog, customers, drag physics, friends, netcode
  scenes/           garage, showroom, drag strip, town
  world/            props, characters, textures, traffic, garage surroundings
  ui/               HUD, dealer, paint shop, editor, race UI, panels, styles
server/             auth, per-user saves, snapshots, static files and race rooms
  server.js         HTTP routes + WebSocket upgrade
  auth.js           scrypt passwords, sessions, CSRF, rate limits
  db.js             users/sessions/saves, admin audit, social data + snapshots
  social.js         friends, wall, likes, challenges, visits, ranking API
  admin.js          server administration CLI
  adminOps.js       shared web/CLI admin actions
  pages.js          login, registration and admin pages
```

## Disclaimer

This is a non-commercial fan project and is not affiliated with Cie Games, Glu
or the original Car Town. Car makes and model names (smart, Hyundai, IONIQ,
Mercedes-AMG, Opel, KGM and others) are trademarks of their respective owners and are used
only to identify the cars recreated here. All models, textures and sounds in
this repository are generated by code.
