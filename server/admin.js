#!/usr/bin/env node
// Server-side administration CLI. Run it with the same CARTON_* environment as
// the game (inside the container) so it opens the running SQLite database.
//
//   node server/admin.js ensure-owner
//   node server/admin.js list
//   node server/admin.js force-tutorial TU_USUARIO
//   node server/admin.js set-money TU_USUARIO 50000 25
//   node server/admin.js reset-password TU_USUARIO NUEVA_CONTRASEÑA
//
// ensure-owner marks the account as admin,
// clears bans, revokes sessions and writes a fresh snapshot.

import {
  closeDb,
  createUser,
  deleteUserSessions,
  initDb,
  listAudit,
  listUsers,
  setUserAdmin,
  setUserBanned,
  snapshotNow,
  updateUserPasswordHash,
} from './db.js';
import { hashPassword } from './auth.js';
import { applyAdminAction, resolveUser } from './adminOps.js';

function usage() {
  console.log(`Uso: node server/admin.js <comando> [args]

Comandos:
  ensure-owner <usuario> <contraseña>      Crea/actualiza el admin
  list                                     Lista cuentas
  audit [n]                                Últimas acciones administrativas
  force-tutorial <usuario>                 Fuerza el tutorial en el próximo login
  clear-tutorial <usuario>                 Cancela el tutorial forzado
  ban <usuario> [motivo]                   Banea y cierra sesiones
  unban <usuario>                          Desbanea
  admin <usuario> | unadmin <usuario>      Concede o retira el rol admin
  reset-sessions <usuario>                 Cierra todas las sesiones
  reset-game <usuario>                     Borra la partida (no la cuenta)
  reset-password <usuario> <contraseña>    Cambia la contraseña y cierra sesiones
  set-level <usuario> <nivel>              Ajusta el nivel
  set-money <usuario> <monedas> <cash>     Ajusta monedas y cash
  ranking-opt-out <usuario>                Excluye del ranking global
  ranking-opt-in <usuario>                 Incluye en el ranking global
  regenerate-bot-garages [force]           Regenera talleres de bots (force sobrescribe todos)
  delete <usuario>                         Borra la cuenta y todos sus datos`);
}

function formatDate(ms) {
  if (!ms) return '—';
  return new Date(Number(ms)).toISOString().replace('T', ' ').slice(0, 16);
}

async function ensureOwner(username, password) {
  const clean = String(username || '').trim();
  if (!clean) throw new Error('usuario vacío: usa ensure-owner <usuario> <contraseña>');
  if (!password) throw new Error('contraseña vacía: usa ensure-owner <usuario> <contraseña>');
  let user = resolveUser(clean);
  const hash = await hashPassword(password);
  if (!user) {
    user = createUser(clean, clean, hash);
    console.log(`Creado usuario ${clean} (#${user.id}).`);
  } else {
    updateUserPasswordHash(user.id, hash);
    console.log(`Contraseña de ${clean} actualizada.`);
  }
  setUserAdmin(user.id, true);
  setUserBanned(user.id, false);
  deleteUserSessions(user.id);
  console.log(`${clean} es administrador; sesiones revocadas.`);
}

async function main() {
  const [command = 'help', ...args] = process.argv.slice(2);
  initDb();

  if (command === 'help' || command === '--help' || command === '-h') {
    usage();
    return;
  }

  if (command === 'ensure-owner') {
    await ensureOwner(args[0], args[1]);
    return;
  }

  if (command === 'list') {
    for (const user of listUsers()) {
      const flags = [
        user.is_admin ? 'ADMIN' : '',
        user.banned_at ? 'BANEADO' : '',
        user.force_tutorial ? 'TUTORIAL' : '',
        user.ranking_opt_out ? 'NO-RANKING' : '',
      ].filter(Boolean).join(',');
      console.log(
        `#${user.id} ${user.username} (${user.display_name}) nivel-save=${user.revision || 0} ` +
          `login=${formatDate(user.last_login_at)} ${flags}`.trim(),
      );
    }
    return;
  }

  if (command === 'audit') {
    for (const row of listAudit(Number(args[0]) || 60)) {
      console.log(
        `${formatDate(row.created_at)} ${row.admin_name || 'cli'} -> ${row.target_name || '—'} ` +
          `${row.action}${row.detail ? ` (${row.detail})` : ''}`,
      );
    }
    return;
  }

  if (command === 'regenerate-bot-garages') {
    const result = await applyAdminAction({ action: command, force: String(args[0] || '') === 'force' });
    console.log(result.message || result.error);
    if (!result.ok) throw new Error(result.message || result.error);
    return;
  }

  const target = args[0];
  if (!target) {
    usage();
    throw new Error('falta el usuario objetivo');
  }

  let action = command;
  const extra = {};
  if (command === 'set-level') extra.level = args[1];
  else if (command === 'set-money') {
    extra.coins = args[1];
    extra.cash = args[2];
  } else if (command === 'reset-password') extra.password = args[1];
  else if (command === 'ban') extra.reason = args.slice(1).join(' ');
  else if (!['clear-tutorial', 'unban', 'admin', 'unadmin', 'reset-sessions', 'reset-game', 'ranking-opt-out', 'ranking-opt-in', 'delete', 'force-tutorial'].includes(command)) {
    usage();
    throw new Error(`comando desconocido: ${command}`);
  }
  if (action === 'unban') action = 'unban';
  if (action === 'admin') action = 'admin';
  if (action === 'unadmin') action = 'unadmin';

  const result = await applyAdminAction({
    action,
    target,
    ...extra,
    allowWeak: true,
  });
  if (!result.ok) throw new Error(result.message || result.error);
  console.log(result.message);
}

main()
  .then(() => {
    snapshotNow();
    closeDb();
  })
  .catch((error) => {
    console.error(`[admin] ${error.message}`);
    try {
      closeDb();
    } catch {
      /* ignore */
    }
    process.exitCode = 1;
  });
