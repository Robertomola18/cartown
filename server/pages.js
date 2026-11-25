import { withBase } from './config.js';
import { escapeHtml } from './auth.js';

const STYLE = `
  :root {
    color-scheme: dark;
    --red: #d9262b;
    --red-dark: #9e1219;
    --cream: #fff5df;
    --ink: #211b18;
    --muted: #c9bfb4;
    --panel: rgba(24, 21, 20, .92);
    --line: rgba(255, 255, 255, .12);
    --ok: #39b96a;
  }
  * { box-sizing: border-box; }
  html, body { min-height: 100%; }
  body {
    margin: 0;
    font-family: "Trebuchet MS", "Segoe UI", system-ui, sans-serif;
    color: var(--cream);
    background:
      radial-gradient(circle at 18% 10%, rgba(217, 38, 43, .26), transparent 34rem),
      radial-gradient(circle at 84% 78%, rgba(242, 183, 5, .12), transparent 28rem),
      linear-gradient(155deg, #17120f, #241a16 52%, #120f0d);
    display: grid;
    place-items: center;
    padding: 24px 16px;
  }
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: .17;
    background-image: repeating-linear-gradient(90deg, transparent 0 58px, rgba(255,255,255,.08) 58px 59px);
  }
  .shell { width: min(960px, 100%); position: relative; }
  .brand { display: flex; align-items: center; gap: 14px; margin: 0 0 20px 4px; }
  .brand-mark {
    width: 58px; height: 58px; border-radius: 18px;
    display: grid; place-items: center;
    background: linear-gradient(145deg, #ff4a3e, var(--red-dark));
    box-shadow: 0 12px 34px rgba(217,38,43,.35), inset 0 1px rgba(255,255,255,.35);
    font-size: 27px;
  }
  .brand h1 { margin: 0; font-size: clamp(30px, 6vw, 48px); letter-spacing: .02em; line-height: .92; }
  .brand h1 span { color: var(--red); }
  .brand p { margin: 6px 0 0; color: var(--muted); font-size: 14px; letter-spacing: .14em; text-transform: uppercase; }
  .card {
    display: grid; grid-template-columns: 1.05fr .95fr; overflow: hidden;
    border: 1px solid var(--line); border-radius: 26px;
    background: var(--panel);
    box-shadow: 0 32px 80px rgba(0,0,0,.5);
    backdrop-filter: blur(14px);
  }
  .side {
    padding: clamp(28px, 5vw, 54px);
    background:
      radial-gradient(circle at 20% 0%, rgba(255,255,255,.12), transparent 18rem),
      linear-gradient(150deg, rgba(217,38,43,.9), rgba(128,14,21,.92));
    display: flex; flex-direction: column; justify-content: space-between; gap: 28px;
  }
  .side h2 { margin: 0 0 12px; font-size: clamp(24px, 4vw, 34px); line-height: 1.03; }
  .side p { margin: 0; color: rgba(255,245,223,.82); line-height: 1.55; }
  .side ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
  .side li { display: flex; gap: 9px; align-items: center; color: rgba(255,245,223,.92); font-size: 14px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cream); flex: 0 0 auto; }
  .form-wrap { padding: clamp(28px, 5vw, 54px); }
  .kicker { margin: 0 0 8px; color: var(--red); font-size: 12px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; }
  h3 { margin: 0 0 22px; font-size: clamp(23px, 3.2vw, 31px); }
  form { display: grid; gap: 15px; }
  label { display: grid; gap: 7px; color: #ded3c5; font-size: 13px; font-weight: 700; }
  input {
    width: 100%; border: 1px solid var(--line); border-radius: 13px;
    background: rgba(255,255,255,.055); color: var(--cream);
    padding: 13px 14px; font: inherit; outline: none;
  }
  input:focus, button:focus-visible, a:focus-visible, select:focus-visible, summary:focus-visible, [tabindex]:focus-visible {
    outline: 3px solid #ffd21a; outline-offset: 2px;
  }
  input:focus { border-color: rgba(255, 76, 64, .85); box-shadow: 0 0 0 3px rgba(217,38,43,.18); }
  input::placeholder { color: #bdb3aa; }
  .skip-link {
    position: absolute; left: 12px; top: -60px; z-index: 10;
    background: #ffd21a; color: #211b18; border-radius: 10px; padding: 9px 13px;
    font-weight: 900; text-decoration: none; transition: top .15s ease;
  }
  .skip-link:focus { top: 12px; }
  .hint { color: var(--muted); font-size: 12px; font-weight: 400; line-height: 1.45; }
  .error {
    border: 1px solid rgba(255, 96, 86, .45);
    background: rgba(217, 38, 43, .14);
    color: #ffd6d2; border-radius: 12px; padding: 11px 13px; font-size: 13px; line-height: 1.4;
  }
  .notice {
    border: 1px solid rgba(57, 185, 106, .35);
    background: rgba(57, 185, 106, .12);
    color: #d7ffe5; border-radius: 12px; padding: 11px 13px; font-size: 13px;
  }
  .submit {
    margin-top: 3px; border: 0; border-radius: 14px; cursor: pointer;
    padding: 14px 18px; font: inherit; font-weight: 900; letter-spacing: .02em;
    color: #fff; background: linear-gradient(180deg, #ff4a3e, var(--red));
    box-shadow: 0 12px 26px rgba(217,38,43,.32), inset 0 1px rgba(255,255,255,.28);
  }
  .submit:hover { filter: brightness(1.06); }
  .submit:active { transform: translateY(1px); }
  .alt { margin: 18px 0 0; color: var(--muted); font-size: 13px; text-align: center; }
  .alt a { color: var(--cream); font-weight: 800; text-decoration: none; border-bottom: 1px solid rgba(255,245,223,.35); }
  .fine { margin: 18px 4px 0; color: #bdb3aa; font-size: 11px; text-align: center; }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }
  @media (max-width: 760px) {
    body { padding: 14px 10px; align-items: start; }
    .brand { margin-top: 12px; }
    .card { grid-template-columns: 1fr; border-radius: 20px; }
    .side { display: none; }
    .form-wrap { padding: 28px 22px 30px; }
  }
  .page-lang { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--muted); font-size: 12px; font-weight: 700; }
  .page-lang select { border: 1px solid var(--line); border-radius: 8px; background: rgba(255,255,255,.08); color: var(--cream); padding: 6px 9px; font: inherit; }
  .admin-shell { width: min(1280px, 100%); }
  .admin-card { display: block; }
  .admin-top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; }
  .admin-top h2 { margin: 0; }
  .admin-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .admin-actions form { display: inline-flex; gap: 6px; align-items: center; }
  .admin-nav { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; padding: 10px; border: 1px solid var(--line); border-radius: 14px; background: rgba(0,0,0,.18); }
  .admin-nav a { color: var(--cream); text-decoration: none; font-size: 13px; font-weight: 800; padding: 7px 10px; border-radius: 9px; }
  .admin-nav a:hover { background: rgba(255,255,255,.1); }
  .admin-section { margin-top: 28px; scroll-margin-top: 16px; }
  .admin-section > h3 { font-size: 21px; margin-bottom: 12px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .kpi { border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; background: rgba(255,255,255,.05); display: grid; gap: 3px; }
  .kpi strong { font-size: 24px; line-height: 1; }
  .kpi span { color: var(--muted); font-size: 12px; font-weight: 700; }
  .quick-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .admin-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; align-items: start; }
  .admin-user {
    border: 1px solid var(--line); border-radius: 16px; padding: 14px;
    background: rgba(255,255,255,.045); display: grid; gap: 10px; min-width: 0;
  }
  .admin-user header { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .admin-user header b { font-size: 18px; }
  .admin-user header small { color: var(--muted); }
  .tag { border-radius: 999px; padding: 3px 9px; font-size: 11px; font-weight: 900; background: rgba(255,255,255,.14); color: #fff; }
  .tag.admin { background: rgba(57,185,106,.3); color: #e5ffee; }
  .tag.banned { background: rgba(217,38,43,.38); color: #ffe2df; }
  .tag.tutorial { background: rgba(242,183,5,.3); color: #fff6cf; }
  .tag.rank { background: rgba(47,111,214,.38); color: #e8f1ff; }
  .admin-fields { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; }
  .admin-fields input, .admin-fields select { width: 120px; min-width: 0; padding: 8px 10px; font-size: 13px; }
  .admin-fields input.wide { width: 180px; }
  .admin-fields label { display: grid; gap: 4px; font-size: 12px; }
  .admin-btn {
    border: 0; border-radius: 10px; padding: 9px 12px; cursor: pointer;
    font: inherit; font-size: 13px; font-weight: 900; color: #fff; text-decoration: none;
    background: #2f6fd6;
  }
  .admin-btn.red { background: #c7222a; }
  .admin-btn.green { background: #24923a; }
  .admin-btn.gray { background: #d9dee6; color: #1c2430; }
  .admin-btn:hover { filter: brightness(1.1); }
  .admin-footer { margin-top: 18px; }
  .audit { margin-top: 24px; border-top: 1px solid var(--line); padding-top: 16px; }
  .table-region { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; }
  .audit table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .audit td, .audit th { text-align: left; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.08); }
  .audit th { color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-size: 11px; }
  .audit caption { text-align: left; padding: 8px 10px; color: var(--muted); font-size: 12px; }
  .admin-flash { margin-bottom: 14px; }
  .lang-setup { max-width: 520px; }
  .lang-setup fieldset { border: 1px solid var(--line); border-radius: 14px; padding: 14px; display: grid; gap: 10px; }
  .lang-setup legend { font-weight: 900; padding: 0 6px; }
  .lang-setup label { display: flex; align-items: center; gap: 9px; font-size: 15px; }
  .lang-setup input[type="radio"] { width: 18px; height: 18px; accent-color: #ffd21a; }
  .confirm-dialog { border: 1px solid var(--line); border-radius: 18px; padding: 20px; background: #211b18; color: var(--cream); max-width: min(460px, 92vw); }
  .confirm-dialog::backdrop { background: rgba(0,0,0,.7); }
  .confirm-dialog h3 { margin-bottom: 10px; }
  .confirm-dialog .typed-label { display: grid; gap: 6px; margin: 14px 0; }
  .confirm-dialog [hidden] { display: none !important; }
  @media (max-width: 700px) {
    .admin-top { flex-direction: column; }
    .admin-grid { grid-template-columns: 1fr; }
  }
`;

const PAGE_LANGS = ['es', 'en', 'pt'];
const PAGE_STRINGS = {
  es: {
    tagline: 'Garaje privado RSILVA', fine: 'Acceso privado. No compartas tus credenciales.',
    sideTitle: 'Tu garaje.<br>Tu partida.', sideP: 'Entra, atiende clientes, mejora tus coches y corre contra tus amigos.',
    side1: 'Partida guardada en el servidor', side2: 'Trabajos que avanzan aunque cierres', side3: 'Acceso desde PC y móvil',
    loginKicker: 'Bienvenido de vuelta', loginTitle: 'Iniciar sesión', username: 'Usuario', password: 'Contraseña',
    enterGarage: 'Entrar al garaje', noAccount: '¿No tienes cuenta?', createAccount: 'Crear una cuenta',
    registerKicker: 'Nueva cuenta', registerTitle: 'Crear cuenta', displayName: 'Nombre visible',
    displayHint: 'Cómo te verán los demás', passwordHint: 'Sin mínimo de caracteres', repeatPassword: 'Repite la contraseña',
    inviteCode: 'Código de invitación', inviteCodeWord: 'Código', createGarage: 'Crear mi garaje',
    alreadyAccount: '¿Ya tienes cuenta?', signIn: 'Iniciar sesión', backToLogin: 'Volver al inicio de sesión',
    userHint: '3–20 caracteres: letras, números, punto, guion o guion bajo.', loginTitlePage: 'Iniciar sesión',
    registerTitlePage: 'Crear cuenta', language: 'Idioma', skip: 'Saltar al contenido',
  },
  en: {
    tagline: 'RSILVA private garage', fine: 'Private access. Do not share your credentials.',
    sideTitle: 'Your garage.<br>Your game.', sideP: 'Jump in, serve customers, upgrade your cars and race your friends.',
    side1: 'Game saved on the server', side2: 'Jobs keep running after you close', side3: 'Play from PC and mobile',
    loginKicker: 'Welcome back', loginTitle: 'Sign in', username: 'Username', password: 'Password',
    enterGarage: 'Enter garage', noAccount: "Don't have an account?", createAccount: 'Create an account',
    registerKicker: 'New account', registerTitle: 'Create account', displayName: 'Display name',
    displayHint: 'How others will see you', passwordHint: 'No minimum length', repeatPassword: 'Repeat password',
    inviteCode: 'Invite code', inviteCodeWord: 'Code', createGarage: 'Create my garage',
    alreadyAccount: 'Already have an account?', signIn: 'Sign in', backToLogin: 'Back to sign in',
    userHint: '3–20 characters: letters, numbers, dot, hyphen or underscore.', loginTitlePage: 'Sign in',
    registerTitlePage: 'Create account', language: 'Language', skip: 'Skip to content',
  },
  pt: {
    tagline: 'Garagem privada RSILVA', fine: 'Acesso privado. Não compartilhe suas credenciais.',
    sideTitle: 'Sua garagem.<br>Sua partida.', sideP: 'Entre, atenda clientes, melhore seus carros e corra com seus amigos.',
    side1: 'Partida salva no servidor', side2: 'Trabalhos continuam mesmo se fechar', side3: 'Acesso por PC e celular',
    loginKicker: 'Bem-vindo de volta', loginTitle: 'Entrar', username: 'Usuário', password: 'Senha',
    enterGarage: 'Entrar na garagem', noAccount: 'Não tem conta?', createAccount: 'Criar uma conta',
    registerKicker: 'Nova conta', registerTitle: 'Criar conta', displayName: 'Nome visível',
    displayHint: 'Como os outros vão te ver', passwordHint: 'Sem comprimento mínimo', repeatPassword: 'Repita a senha',
    inviteCode: 'Código de convite', inviteCodeWord: 'Código', createGarage: 'Criar minha garagem',
    alreadyAccount: 'Já tem conta?', signIn: 'Entrar', backToLogin: 'Voltar ao login',
    userHint: '3–20 caracteres: letras, números, ponto, hífen ou sublinhado.', loginTitlePage: 'Entrar',
    registerTitlePage: 'Criar conta', language: 'Idioma', skip: 'Pular para o conteúdo',
  },
};

const ADMIN_STRINGS = {
  es: {
    admin: 'Administración', chooseLanguage: 'Elige tu idioma', chooseLanguageHelp: 'Selecciona el idioma del panel. Podrás cambiarlo después en Ajustes.',
    panelLanguage: 'Idioma del panel', saveContinue: 'Guardar y continuar', backGame: 'Volver al juego', navigation: 'Secciones del panel',
    overview: 'Resumen', users: 'Usuarios', bots: 'Bots', cars: 'Coches', garages: 'Garajes', audit: 'Auditoría', settings: 'Ajustes',
    accounts: 'Cuentas', admins: 'Admins', banned: 'Baneos', tutorialPending: 'Tutorial pendiente', activeBots: 'Bots activos',
    customCars: 'Coches personalizados', recentActions: 'Acciones recientes', quickActions: 'Acciones rápidas',
    createUser: 'Crear cuenta', createBot: 'Crear bot', createCar: 'Crear coche', regenerate: 'Regenerar garajes',
    noAccounts: 'No hay cuentas.', noBots: 'No hay bots.', noCars: 'No hay coches personalizados.',
    languageSaved: 'Idioma guardado.', languageInvalid: 'Idioma no válido.', confirmTitle: 'Confirmar acción',
    confirm: 'Confirmar', cancel: 'Cancelar', typeToConfirm: 'Escribe', auditTable: 'Auditoría reciente',
    level: 'Nivel', money: 'Dinero', password: 'Contraseña', deleteUser: 'Borrar cuenta', resetGame: 'Borrar partida',
    username: 'Usuario', displayName: 'Nombre visible', name: 'Nombre', handle: 'Handle', model: 'Modelo', paint: 'Pintura',
    reason: 'Motivo', search: 'Buscar', noResults: 'Sin resultados',
  },
  en: {
    admin: 'Administration', chooseLanguage: 'Choose your language', chooseLanguageHelp: 'Select the panel language. You can change it later in Settings.',
    panelLanguage: 'Panel language', saveContinue: 'Save and continue', backGame: 'Back to game', navigation: 'Panel sections',
    overview: 'Overview', users: 'Users', bots: 'Bots', cars: 'Cars', garages: 'Garages', audit: 'Audit', settings: 'Settings',
    accounts: 'Accounts', admins: 'Admins', banned: 'Bans', tutorialPending: 'Tutorial pending', activeBots: 'Active bots',
    customCars: 'Custom cars', recentActions: 'Recent actions', quickActions: 'Quick actions',
    createUser: 'Create account', createBot: 'Create bot', createCar: 'Create car', regenerate: 'Regenerate garages',
    noAccounts: 'No accounts.', noBots: 'No bots.', noCars: 'No custom cars.',
    languageSaved: 'Language saved.', languageInvalid: 'Invalid language.', confirmTitle: 'Confirm action',
    confirm: 'Confirm', cancel: 'Cancel', typeToConfirm: 'Type', auditTable: 'Recent audit',
    level: 'Level', money: 'Money', password: 'Password', deleteUser: 'Delete account', resetGame: 'Reset game',
    username: 'Username', displayName: 'Display name', name: 'Name', handle: 'Handle', model: 'Model', paint: 'Paint',
    reason: 'Reason', search: 'Search', noResults: 'No results',
  },
  pt: {
    admin: 'Administração', chooseLanguage: 'Escolha seu idioma', chooseLanguageHelp: 'Selecione o idioma do painel. Você pode mudar depois em Ajustes.',
    panelLanguage: 'Idioma do painel', saveContinue: 'Salvar e continuar', backGame: 'Voltar ao jogo', navigation: 'Seções do painel',
    overview: 'Resumo', users: 'Usuários', bots: 'Bots', cars: 'Carros', garages: 'Garagens', audit: 'Auditoria', settings: 'Ajustes',
    accounts: 'Contas', admins: 'Admins', banned: 'Banimentos', tutorialPending: 'Tutorial pendente', activeBots: 'Bots ativos',
    customCars: 'Carros personalizados', recentActions: 'Ações recentes', quickActions: 'Ações rápidas',
    createUser: 'Criar conta', createBot: 'Criar bot', createCar: 'Criar carro', regenerate: 'Regenerar garagens',
    noAccounts: 'Não há contas.', noBots: 'Não há bots.', noCars: 'Não há carros personalizados.',
    languageSaved: 'Idioma salvo.', languageInvalid: 'Idioma inválido.', confirmTitle: 'Confirmar ação',
    confirm: 'Confirmar', cancel: 'Cancelar', typeToConfirm: 'Digite', auditTable: 'Auditoria recente',
    level: 'Nível', money: 'Dinheiro', password: 'Senha', deleteUser: 'Excluir conta', resetGame: 'Apagar partida',
    username: 'Usuário', displayName: 'Nome visível', name: 'Nome', handle: 'Handle', model: 'Modelo', paint: 'Pintura',
    reason: 'Motivo', search: 'Buscar', noResults: 'Sem resultados',
  },
};

function pageString(lang, key) {
  return (PAGE_STRINGS[lang] || PAGE_STRINGS.es)[key] || PAGE_STRINGS.es[key] || key;
}

function adminString(lang, key) {
  return (ADMIN_STRINGS[lang] || ADMIN_STRINGS.es)[key] || ADMIN_STRINGS.es[key] || key;
}

function flashText(lang, text) {
  const keyMap = { language_saved: 'languageSaved', language_invalid: 'languageInvalid' };
  const key = keyMap[text] || text;
  return ADMIN_STRINGS[lang]?.[key] || text;
}

function langPicker(lang, id = 'page-lang-select') {
  const names = { es: 'Español', en: 'English', pt: 'Português (BR)' };
  return `<div class="page-lang"><label for="${escapeHtml(id)}">${escapeHtml(pageString(lang, 'language'))}</label><select id="${escapeHtml(id)}" onchange="const u=new URL(location.href);u.searchParams.set('lang',this.value);location.href=u">${PAGE_LANGS.map((code) => `<option value="${code}"${code === lang ? ' selected' : ''}>${names[code]}</option>`).join('')}</select></div>`;
}

function layout(title, body, admin = false, lang = 'es') {
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)} · Car Town</title>
  <style>${STYLE}</style>
</head>
<body>
  <a class="skip-link" href="#contenido">${escapeHtml(pageString(lang, 'skip'))}</a>
  <main id="contenido" class="shell${admin ? ' admin-shell' : ''}">
    <header class="brand">
      <div class="brand-mark" aria-hidden="true">🏁</div>
      <div>
        <h1>CAR <span>TOWN</span></h1>
        <p>${escapeHtml(pageString(lang, 'tagline'))}</p>
      </div>
    </header>
    ${admin ? '' : langPicker(lang)}
    ${body}
    <p class="fine">${escapeHtml(pageString(lang, 'fine'))}</p>
  </main>
</body>
</html>`;
}

function side(lang = 'es') {
  return `<aside class="side">
    <div>
      <h2>${pageString(lang, 'sideTitle')}</h2>
      <p>${escapeHtml(pageString(lang, 'sideP'))}</p>
    </div>
    <ul>
      <li><span class="dot"></span> ${escapeHtml(pageString(lang, 'side1'))}</li>
      <li><span class="dot"></span> ${escapeHtml(pageString(lang, 'side2'))}</li>
      <li><span class="dot"></span> ${escapeHtml(pageString(lang, 'side3'))}</li>
    </ul>
  </aside>`;
}

export function loginPage({ csrf, next = '', error = '', notice = '', registrationOpen = true, lang = 'es' } = {}) {
  const body = `<section class="card">
    ${side(lang)}
    <div class="form-wrap">
      <p class="kicker">${escapeHtml(pageString(lang, 'loginKicker'))}</p>
      <h3>${escapeHtml(pageString(lang, 'loginTitle'))}</h3>
      ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
      ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
      <form method="post" action="${withBase('/login')}" autocomplete="on">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
        <input type="hidden" name="next" value="${escapeHtml(next)}">
        <label>${escapeHtml(pageString(lang, 'username'))}
          <input name="username" minlength="3" maxlength="20" required autofocus autocomplete="username" placeholder="tu_usuario">
        </label>
        <label>${escapeHtml(pageString(lang, 'password'))}
          <input type="password" name="password" required autocomplete="current-password" placeholder="••••••••">
        </label>
        <button class="submit" type="submit">${escapeHtml(pageString(lang, 'enterGarage'))}</button>
      </form>
      ${registrationOpen ? `<p class="alt">${escapeHtml(pageString(lang, 'noAccount'))} <a href="${withBase('/register')}">${escapeHtml(pageString(lang, 'createAccount'))}</a></p>` : ''}
    </div>
  </section>`;
  return layout(pageString(lang, 'loginTitlePage'), body, false, lang);
}

export function registerPage({
  csrf,
  next = '',
  error = '',
  inviteRequired = false,
  lang = 'es',
} = {}) {
  const body = `<section class="card">
    ${side(lang)}
    <div class="form-wrap">
      <p class="kicker">${escapeHtml(pageString(lang, 'registerKicker'))}</p>
      <h3>${escapeHtml(pageString(lang, 'registerTitle'))}</h3>
      ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
      <form method="post" action="${withBase('/register')}" autocomplete="on">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
        <input type="hidden" name="next" value="${escapeHtml(next)}">
        <label>${escapeHtml(pageString(lang, 'username'))}
          <input name="username" minlength="3" maxlength="20" required autofocus autocomplete="username" placeholder="tu_usuario">
          <span class="hint">${escapeHtml(pageString(lang, 'userHint'))}</span>
        </label>
        <label>${escapeHtml(pageString(lang, 'displayName'))}
          <input name="display_name" maxlength="20" autocomplete="nickname" placeholder="${escapeHtml(pageString(lang, 'displayHint'))}">
        </label>
        <label>${escapeHtml(pageString(lang, 'password'))}
          <input type="password" name="password" maxlength="128" required autocomplete="new-password" placeholder="${escapeHtml(pageString(lang, 'passwordHint'))}">
        </label>
        <label>${escapeHtml(pageString(lang, 'repeatPassword'))}
          <input type="password" name="password_confirm" maxlength="128" required autocomplete="new-password" placeholder="••••••••">
        </label>
        ${inviteRequired ? `<label>${escapeHtml(pageString(lang, 'inviteCode'))}
          <input name="invite_code" required autocomplete="off" placeholder="${escapeHtml(pageString(lang, 'inviteCodeWord'))}">
        </label>` : ''}
        <button class="submit" type="submit">${escapeHtml(pageString(lang, 'createGarage'))}</button>
      </form>
      <p class="alt">${escapeHtml(pageString(lang, 'alreadyAccount'))} <a href="${withBase('/login')}">${escapeHtml(pageString(lang, 'signIn'))}</a></p>
    </div>
  </section>`;
  return layout(pageString(lang, 'registerTitlePage'), body, false, lang);
}

export function simplePage(title, message, lang = 'es') {
  return layout(
    title,
    `<section class="card"><div class="form-wrap" style="grid-column:1/-1">
      <p class="kicker">Car Town</p>
      <h3>${escapeHtml(title)}</h3>
      <p class="hint">${escapeHtml(message)}</p>
      <p class="alt"><a href="${withBase('/login')}">${escapeHtml(pageString(lang, 'backToLogin'))}</a></p>
    </div></section>`,
    false,
    lang,
  );
}

function adminDate(ms) {
  if (!ms) return '—';
  return new Date(Number(ms)).toISOString().replace('T', ' ').slice(0, 16);
}

function actionForm(csrf, user, action, label, { kind = '', fields = '', confirm = '', typed = false } = {}) {
  const confirmAttr = confirm ? ` data-confirm="${escapeHtml(confirm)}"` : '';
  const typedAttr = typed ? ` data-typed-confirm="${escapeHtml(user.username || user.name || '')}"` : '';
  const accessibleName = `${label}: ${user.username || user.name || ''}`.trim();
  return `<form method="post" action="${withBase('/admin/action')}"${confirmAttr}${typedAttr}>
    <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
    <input type="hidden" name="target" value="${escapeHtml(user.id)}">
    <input type="hidden" name="action" value="${escapeHtml(action)}">
    ${fields}
    <button class="admin-btn ${kind}" type="submit" aria-label="${escapeHtml(accessibleName)}">${escapeHtml(label)}</button>
  </form>`;
}

export function adminPage({ admin, users = [], bots = [], cars = [], audit = [], csrf, notice = '', error = '', lang = 'es', needsLang = false }) {
  const a = (key) => adminString(lang, key);
  const noticeText = flashText(lang, notice);
  const errorText = flashText(lang, error);

  if (needsLang) {
    const selected = PAGE_LANGS.includes(lang) ? lang : 'es';
    const radios = PAGE_LANGS.map((code) => {
      const names = { es: 'Español', en: 'English', pt: 'Português (BR)' };
      return `<label for="admin-lang-${code}"><input id="admin-lang-${code}" type="radio" name="lang" value="${code}"${code === selected ? ' checked autofocus' : ''}> ${names[code]}</label>`;
    }).join('');
    const body = `<section class="card admin-card"><div class="form-wrap" style="grid-column:1/-1">
      <p class="kicker">${escapeHtml(a('admin'))}</p>
      <h2 id="admin-lang-title">${escapeHtml(a('chooseLanguage'))}</h2>
      <p class="hint">${escapeHtml(a('chooseLanguageHelp'))}</p>
      ${errorText ? `<div class="error admin-flash" role="alert">${escapeHtml(errorText)}</div>` : ''}
      ${noticeText ? `<div class="notice admin-flash" role="status">${escapeHtml(noticeText)}</div>` : ''}
      <form method="post" action="${withBase('/admin/action')}" class="lang-setup">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
        <input type="hidden" name="action" value="set-admin-lang">
        <fieldset aria-labelledby="admin-lang-title">
          <legend>${escapeHtml(a('panelLanguage'))}</legend>
          ${radios}
        </fieldset>
        <button class="admin-btn green" type="submit">${escapeHtml(a('saveContinue'))}</button>
      </form>
    </div></section>`;
    return layout(a('chooseLanguage'), body, true, lang);
  }

  const rows = users.map((user) => {
    const tags = [
      user.is_admin ? `<span class="tag admin">${escapeHtml(a('admins'))}</span>` : '',
      user.banned_at ? `<span class="tag banned">${escapeHtml(a('banned'))}</span>` : '',
      user.force_tutorial ? `<span class="tag tutorial">${escapeHtml(a('tutorialPending'))}</span>` : '',
      user.ranking_opt_out ? '<span class="tag rank"> ranking</span>' : '',
    ].filter(Boolean).join(' ');
    return `<article class="admin-user" id="usuario-${user.id}">
      <header>
        <b>${escapeHtml(user.username)}</b>
        <small>${escapeHtml(user.display_name || '')} · #${user.id}</small>
        ${tags}
      </header>
      <div class="admin-fields">
        ${actionForm(csrf, user, 'force-tutorial', 'Forzar tutorial', { kind: 'gray' })}
        ${user.force_tutorial ? actionForm(csrf, user, 'clear-tutorial', 'Cancelar tutorial', { kind: 'gray' }) : ''}
        ${user.banned_at
          ? actionForm(csrf, user, 'unban', 'Desbanear', { kind: 'green' })
          : actionForm(csrf, user, 'ban', 'Banear', { kind: 'red', confirm: a('confirm'), fields: `<input name="reason" maxlength="120" placeholder="${escapeHtml(a('reason'))}" aria-label="${escapeHtml(a('reason'))}">` })}
        ${user.is_admin
          ? (Number(user.id) === Number(admin.id) ? '<span class="tag">ti</span>' : actionForm(csrf, user, 'unadmin', 'Quitar admin', { kind: 'gray' }))
          : actionForm(csrf, user, 'admin', 'Hacer admin', { kind: 'green' })}
        ${actionForm(csrf, user, 'reset-sessions', 'Cerrar sesiones', { kind: 'gray', confirm: a('confirm') })}
        ${actionForm(csrf, user, 'reset-game', a('resetGame'), { kind: 'red', confirm: a('confirm'), typed: true, fields: '<input type="hidden" name="confirm" value="1">' })}
        ${user.ranking_opt_out
          ? actionForm(csrf, user, 'ranking-opt-in', 'Incluir ranking', { kind: 'gray' })
          : actionForm(csrf, user, 'ranking-opt-out', 'Excluir ranking', { kind: 'gray' })}
      </div>
      <div class="admin-fields">
        <form method="post" action="${withBase('/admin/action')}">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
          <input type="hidden" name="target" value="${escapeHtml(user.id)}">
          <input type="hidden" name="action" value="set-level">
          <input name="level" type="number" min="1" max="500" placeholder="${escapeHtml(a('level'))}" aria-label="${escapeHtml(a('level'))}">
          <button class="admin-btn gray" type="submit">${escapeHtml(a('level'))}</button>
        </form>
        <form method="post" action="${withBase('/admin/action')}">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
          <input type="hidden" name="target" value="${escapeHtml(user.id)}">
          <input type="hidden" name="action" value="set-money">
          <input name="coins" type="number" min="0" placeholder="coins" aria-label="coins">
          <input name="cash" type="number" min="0" placeholder="cash" aria-label="cash">
          <button class="admin-btn gray" type="submit">${escapeHtml(a('money'))}</button>
        </form>
        <form method="post" action="${withBase('/admin/action')}" data-confirm="${escapeHtml(a('confirm'))}">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
          <input type="hidden" name="target" value="${escapeHtml(user.id)}">
          <input type="hidden" name="action" value="reset-password">
          <input class="wide" name="password" type="password" maxlength="128" placeholder="${escapeHtml(a('password'))}" aria-label="${escapeHtml(a('password'))}" autocomplete="new-password">
          <button class="admin-btn gray" type="submit">${escapeHtml(a('password'))}</button>
        </form>
        ${actionForm(csrf, user, 'delete', a('deleteUser'), { kind: 'red', confirm: a('confirm'), typed: true })}
      </div>
    </article>`;
  }).join('');

  const modelOptions = ['hatch','sedan','muscle','pickup','van','taxi','police','coupe','super','offroad','beetle','rally','suv','smart2','ioniq3','amgsuv','vapid','frontera','musso']
    .map((id) => `<option value="${id}">${id}</option>`).join('');

  const createUser = `<article class="admin-user">
    <header><b>Crear cuenta</b><small>usuario, contraseña y nombre visible</small></header>
    <form method="post" action="${withBase('/admin/action')}" class="admin-fields">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
      <input type="hidden" name="action" value="create-user">
      <input name="username" placeholder="${escapeHtml(a('username'))}" aria-label="${escapeHtml(a('username'))}" maxlength="24" required>
      <input name="displayName" placeholder="${escapeHtml(a('displayName'))}" aria-label="${escapeHtml(a('displayName'))}" maxlength="40">
      <input name="password" type="password" placeholder="${escapeHtml(a('password'))}" aria-label="${escapeHtml(a('password'))}" maxlength="128" required autocomplete="new-password">
      <label class="hint"><input type="checkbox" name="isAdmin" value="1"> admin</label>
      <button class="admin-btn green" type="submit">${escapeHtml(a('createUser'))}</button>
    </form>
  </article>`;

  const botRows = bots.map((bot) => `<article class="admin-user">
    <header><b>${escapeHtml(bot.name)}</b><small>@${escapeHtml(bot.handle)} · #${bot.id} · nivel ${bot.level}</small>
      ${bot.active ? '<span class="tag admin">activo</span>' : '<span class="tag banned">inactivo</span>'}
      ${bot.visitable ? '<span class="tag">visitable</span>' : ''}
      ${bot.challengeable ? '<span class="tag">retable</span>' : ''}
      <a class="admin-btn" href="${withBase('/?adminBot=' + bot.id)}" target="_blank" rel="noopener">Editar garaje</a>
    </header>
    <form method="post" action="${withBase('/admin/action')}" class="admin-fields">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
      <input type="hidden" name="target" value="${bot.id}">
      <input type="hidden" name="action" value="update-bot">
      <input name="name" value="${escapeHtml(bot.name)}" maxlength="40" aria-label="${escapeHtml(a('name'))}" required>
      <input name="handle" value="${escapeHtml(bot.handle)}" maxlength="40" aria-label="${escapeHtml(a('handle'))}">
      <input name="level" type="number" min="1" max="500" value="${bot.level}" aria-label="${escapeHtml(a('level'))}">
      <select name="carModel" aria-label="${escapeHtml(a('model'))}">${modelOptions.replace(`value="${escapeHtml(bot.car?.model || 'super')}"`, `value="${escapeHtml(bot.car?.model || 'super')}" selected`)}</select>
      <input name="paint" value="${escapeHtml(bot.car?.paint || '#d9262b')}" maxlength="20" aria-label="${escapeHtml(a('paint'))}">
      <label class="hint"><input type="checkbox" name="visitable" value="1" ${bot.visitable ? 'checked' : ''}> visitable</label>
      <label class="hint"><input type="checkbox" name="challengeable" value="1" ${bot.challengeable ? 'checked' : ''}> retable</label>
      <label class="hint"><input type="checkbox" name="enabled" value="1" ${bot.active ? 'checked' : ''}> activo</label>
      <button class="admin-btn gray" type="submit">Guardar</button>
    </form>
    <div class="admin-fields">
      <form method="post" action="${withBase('/admin/action')}" data-confirm="${escapeHtml(a('confirm'))}">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
        <input type="hidden" name="target" value="${bot.id}">
        <input type="hidden" name="action" value="delete-bot">
        <button class="admin-btn red" type="submit" aria-label="${escapeHtml(bot.name)}: ${escapeHtml(a('confirm'))}">Eliminar bot</button>
      </form>
    </div>
  </article>`).join('');

  const createBot = `<article class="admin-user">
    <header><b>Crear bot</b><small>perfil visitable y retable, sin login</small></header>
    <form method="post" action="${withBase('/admin/action')}" class="admin-fields">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
      <input type="hidden" name="action" value="create-bot">
      <input name="name" placeholder="${escapeHtml(a('name'))}" aria-label="${escapeHtml(a('name'))}" maxlength="40" required>
      <input name="handle" placeholder="${escapeHtml(a('handle'))}" aria-label="${escapeHtml(a('handle'))}" maxlength="40">
      <input name="level" type="number" min="1" max="500" value="10" aria-label="${escapeHtml(a('level'))}">
      <select name="carModel" aria-label="${escapeHtml(a('model'))}">${modelOptions}</select>
      <input name="paint" value="#d9262b" maxlength="20" aria-label="${escapeHtml(a('paint'))}">
      <label class="hint"><input type="checkbox" name="visitable" value="1" checked> visitable</label>
      <label class="hint"><input type="checkbox" name="challengeable" value="1" checked> retable</label>
      <button class="admin-btn green" type="submit">Crear bot</button>
    </form>
  </article>`;

  const botOptions = bots.map((bot) => `<option value="${bot.id}">${escapeHtml(bot.name)} (#${bot.id})</option>`).join('');
  const userOptions = users.map((user) => `<option value="${escapeHtml(user.username)}" ${Number(user.id) === Number(admin.id) ? 'selected' : ''}>${escapeHtml(user.username)} (#${user.id})</option>`).join('');
  const copyUserGarage = `<article class="admin-user">
    <header><b>Copiar mi taller a un bot</b><small>copia suelo, pared, tamaño, objetos y opcionalmente los coches de la cuenta</small></header>
    <form method="post" action="${withBase('/admin/action')}" class="admin-fields">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
      <input type="hidden" name="action" value="copy-user-garage">
      <label class="hint">Cuenta origen <select name="sourceUser" required>${userOptions}</select></label>
      <label class="hint">Bot destino <select name="target" required>${botOptions}</select></label>
      <label class="hint"><input type="checkbox" name="includeCars" value="1" checked> incluir mis coches</label>
      <button class="admin-btn gray" type="submit">Copiar taller</button>
    </form>
  </article>`;
  const copyBotGarage = `<article class="admin-user">
    <header><b>Copiar decoración</b><small>copia suelo, pared, tamaño y objetos; conserva el coche del destino</small></header>
    <form method="post" action="${withBase('/admin/action')}" class="admin-fields">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
      <input type="hidden" name="action" value="copy-bot-garage">
      <label class="hint">Origen <select name="sourceBot" required>${botOptions}</select></label>
      <label class="hint">Destino <select name="target" required>${botOptions}</select></label>
      <button class="admin-btn gray" type="submit">Copiar decoración</button>
    </form>
  </article>`;

  const carRows = cars.map((car) => `<article class="admin-user">
    <header><b>${escapeHtml(car.name)}</b><small>${escapeHtml(car.id)} · base ${escapeHtml(car.baseModel)} · nivel ${car.level}</small>
      ${car.enabled ? '<span class="tag admin">activo</span>' : '<span class="tag banned">desactivado</span>'}
      ${car.customPrice || car.price >= 1000000 ? '<span class="tag">hipercoche</span>' : ''}
    </header>
    <form method="post" action="${withBase('/admin/action')}" class="admin-fields">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
      <input type="hidden" name="target" value="${escapeHtml(car.id)}">
      <input type="hidden" name="action" value="update-car">
      <input name="name" value="${escapeHtml(car.name)}" maxlength="40" aria-label="${escapeHtml(a('name'))}" required>
      <input name="brand" value="${escapeHtml(car.brand)}" maxlength="40" aria-label="brand">
      <input name="carClass" value="${escapeHtml(car.class)}" maxlength="40" aria-label="class">
      <select name="baseModel" aria-label="${escapeHtml(a('model'))}">${modelOptions.replace(`value="${escapeHtml(car.baseModel)}"`, `value="${escapeHtml(car.baseModel)}" selected`)}</select>
      <input name="price" type="number" min="0" value="${car.price}" placeholder="price" aria-label="price">
      <input name="level" type="number" min="1" max="500" value="${car.level}" placeholder="${escapeHtml(a('level'))}" aria-label="${escapeHtml(a('level'))}">
      <input name="cash" type="number" min="0" value="${car.cash}" placeholder="cash" aria-label="cash">
      <input name="paint" value="${escapeHtml(car.paint || '')}" maxlength="20" placeholder="${escapeHtml(a('paint'))}" aria-label="${escapeHtml(a('paint'))}">
      <input name="hp" type="number" min="0" value="${car.hp ?? ''}" placeholder="hp" aria-label="hp">
      <input name="kg" type="number" min="0" value="${car.kg ?? ''}" placeholder="kg" aria-label="kg">
      <input name="grip" type="number" step="0.01" min="0" value="${car.grip ?? ''}" placeholder="grip" aria-label="grip">
      <input name="gears" type="number" min="0" value="${car.gears ?? ''}" placeholder="gears" aria-label="gears">
      <input name="redline" type="number" min="0" value="${car.redline ?? ''}" placeholder="redline" aria-label="redline">
      <input name="sort" type="number" value="${car.sort}" placeholder="sort" aria-label="sort">
      <label class="hint"><input type="checkbox" name="enabled" value="1" ${car.enabled ? 'checked' : ''}> activo</label>
      <button class="admin-btn gray" type="submit">Guardar</button>
    </form>
    <div class="admin-fields">
      <form method="post" action="${withBase('/admin/action')}" data-confirm="${escapeHtml(a('confirm'))}">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
        <input type="hidden" name="target" value="${escapeHtml(car.id)}">
        <input type="hidden" name="action" value="delete-car">
        <button class="admin-btn red" type="submit" aria-label="${escapeHtml(car.name)}: ${escapeHtml(a('confirm'))}">Eliminar coche</button>
      </form>
    </div>
  </article>`).join('');

  const createCar = `<article class="admin-user">
    <header><b>Crear coche</b><small>usa una carrocería existente y define nombre, precio y stats</small></header>
    <form method="post" action="${withBase('/admin/action')}" class="admin-fields">
      <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
      <input type="hidden" name="action" value="create-car">
      <input name="name" placeholder="${escapeHtml(a('name'))}" aria-label="${escapeHtml(a('name'))}" maxlength="40" required>
      <input name="brand" placeholder="brand" aria-label="brand" value="RSILVA" maxlength="40">
      <input name="carClass" placeholder="class" aria-label="class" value="Custom" maxlength="40">
      <select name="baseModel" aria-label="${escapeHtml(a('model'))}">${modelOptions}</select>
      <input name="price" type="number" min="0" value="1000000" placeholder="price" aria-label="price">
      <input name="level" type="number" min="1" max="500" value="50" placeholder="${escapeHtml(a('level'))}" aria-label="${escapeHtml(a('level'))}">
      <input name="cash" type="number" min="0" value="0" placeholder="cash" aria-label="cash">
      <input name="paint" value="#d9262b" maxlength="20" placeholder="${escapeHtml(a('paint'))}" aria-label="${escapeHtml(a('paint'))}">
      <input name="hp" type="number" min="0" value="1200" placeholder="hp" aria-label="hp">
      <input name="kg" type="number" min="0" value="1200" placeholder="kg" aria-label="kg">
      <input name="grip" type="number" step="0.01" min="0" value="1.3" placeholder="grip" aria-label="grip">
      <input name="gears" type="number" min="0" value="8" placeholder="gears" aria-label="gears">
      <input name="redline" type="number" min="0" value="9500" placeholder="redline" aria-label="redline">
      <input name="sort" type="number" value="0" placeholder="sort" aria-label="sort">
      <button class="admin-btn green" type="submit">Crear coche</button>
    </form>
  </article>`;

  const auditRows = audit.map((row) => `<tr>
    <td>${escapeHtml(adminDate(row.created_at))}</td>
    <td>${escapeHtml(row.admin_name || 'cli')}</td>
    <td>${escapeHtml(row.target_name || '—')}</td>
    <td>${escapeHtml(row.action)}</td>
    <td>${escapeHtml(row.detail || '')}</td>
  </tr>`).join('');

  const stats = [
    [users.length, a('accounts')],
    [users.filter((user) => user.is_admin).length, a('admins')],
    [users.filter((user) => user.banned_at).length, a('banned')],
    [users.filter((user) => user.force_tutorial).length, a('tutorialPending')],
    [bots.filter((bot) => bot.active).length, a('activeBots')],
    [cars.length, a('customCars')],
    [audit.length, a('recentActions')],
  ];
  const kpis = stats.map(([value, label]) => `<article class="kpi"><strong>${value}</strong><span>${escapeHtml(label)}</span></article>`).join('');
  const nav = [
    ['overview', a('overview')], ['users', a('users')], ['bots', a('bots')],
    ['garages', a('garages')], ['cars', a('cars')], ['audit', a('audit')], ['settings', a('settings')],
  ].map(([id, label]) => `<a href="#${id}">${escapeHtml(label)}</a>`).join('');
  const regenerate = `<form method="post" action="${withBase('/admin/action')}">
    <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">
    <input type="hidden" name="action" value="regenerate-bot-garages">
    <button class="admin-btn gray" type="submit">${escapeHtml(a('regenerate'))}</button>
  </form>`;
  const body = `<section class="card admin-card"><div class="form-wrap" style="grid-column:1/-1">
    <div class="admin-top">
      <div>
        <p class="kicker">${escapeHtml(a('admin'))}</p>
        <h2>${escapeHtml(admin.username)}</h2>
      </div>
      <div class="admin-actions">
        ${langPicker(lang, 'admin-lang-top')}
        <a class="admin-btn green" href="${withBase('/')}">${escapeHtml(a('backGame'))}</a>
      </div>
    </div>
    ${errorText ? `<div class="error admin-flash" role="alert" tabindex="-1">${escapeHtml(errorText)}</div>` : ''}
    ${noticeText ? `<div class="notice admin-flash" role="status" tabindex="-1">${escapeHtml(noticeText)}</div>` : ''}
    <nav class="admin-nav" aria-label="${escapeHtml(a('navigation'))}">${nav}</nav>
    <section id="overview" class="admin-section" aria-labelledby="overview-title">
      <h3 id="overview-title">${escapeHtml(a('overview'))}</h3>
      <div class="kpi-grid">${kpis}</div>
      <div class="quick-actions">
        <a class="admin-btn green" href="#users">${escapeHtml(a('createUser'))}</a>
        <a class="admin-btn green" href="#bots">${escapeHtml(a('createBot'))}</a>
        <a class="admin-btn green" href="#cars">${escapeHtml(a('createCar'))}</a>
        ${regenerate}
      </div>
    </section>
    <section id="users" class="admin-section" aria-labelledby="users-title">
      <h3 id="users-title">${escapeHtml(a('users'))}</h3>
      <div class="admin-grid">${rows || `<div class="notice">${escapeHtml(a('noAccounts'))}</div>`}${createUser}</div>
    </section>
    <section id="bots" class="admin-section" aria-labelledby="bots-title">
      <h3 id="bots-title">${escapeHtml(a('bots'))}</h3>
      <div class="admin-grid">${botRows || `<div class="notice">${escapeHtml(a('noBots'))}</div>`}${createBot}</div>
    </section>
    <section id="garages" class="admin-section" aria-labelledby="garages-title">
      <h3 id="garages-title">${escapeHtml(a('garages'))}</h3>
      <div class="admin-grid">${bots.length && users.length ? copyUserGarage : ''}${bots.length ? copyBotGarage : ''}</div>
    </section>
    <section id="cars" class="admin-section" aria-labelledby="cars-title">
      <h3 id="cars-title">${escapeHtml(a('cars'))}</h3>
      <div class="admin-grid">${carRows || `<div class="notice">${escapeHtml(a('noCars'))}</div>`}${createCar}</div>
    </section>
    <section id="audit" class="admin-section audit" aria-labelledby="audit-title">
      <h3 id="audit-title">${escapeHtml(a('audit'))}</h3>
      <div class="table-region" role="region" tabindex="0" aria-label="${escapeHtml(a('auditTable'))}">
        <table>
          <caption>${escapeHtml(a('auditTable'))}</caption>
          <thead><tr><th scope="col">Fecha</th><th scope="col">Admin</th><th scope="col">Cuenta</th><th scope="col">Acción</th><th scope="col">Detalle</th></tr></thead>
          <tbody>${auditRows || `<tr><td colspan="5">${escapeHtml(a('noResults'))}</td></tr>`}</tbody>
        </table>
      </div>
    </section>
    <section id="settings" class="admin-section" aria-labelledby="settings-title">
      <h3 id="settings-title">${escapeHtml(a('settings'))}</h3>
      ${langPicker(lang, 'admin-lang-settings')}
    </section>
  </div></section>
  <dialog id="admin-confirm" class="confirm-dialog" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-text">
    <h3 id="admin-confirm-title">${escapeHtml(a('confirmTitle'))}</h3>
    <p id="admin-confirm-text"></p>
    <label class="typed-label" hidden>${escapeHtml(a('typeToConfirm'))} <b id="admin-confirm-name"></b>
      <input id="admin-confirm-typed" type="text" autocomplete="off">
    </label>
    <div class="admin-actions">
      <button id="admin-confirm-cancel" class="admin-btn gray" type="button">${escapeHtml(a('cancel'))}</button>
      <button id="admin-confirm-accept" class="admin-btn red" type="button">${escapeHtml(a('confirm'))}</button>
    </div>
  </dialog>
  <script>
    (function () {
      const dialog = document.getElementById('admin-confirm');
      if (!dialog) return;
      const text = document.getElementById('admin-confirm-text');
      const typedLabel = dialog.querySelector('.typed-label');
      const typedName = document.getElementById('admin-confirm-name');
      const typedInput = document.getElementById('admin-confirm-typed');
      const cancel = document.getElementById('admin-confirm-cancel');
      const accept = document.getElementById('admin-confirm-accept');
      let pending = null;
      let opener = null;
      document.querySelectorAll('form[data-confirm]').forEach((form) => {
        form.addEventListener('submit', (event) => {
          if (form.dataset.done === '1') return;
          event.preventDefault();
          pending = form;
          opener = event.submitter || document.activeElement;
          text.textContent = form.dataset.confirm || '';
          const expected = form.dataset.typedConfirm || '';
          typedLabel.hidden = !expected;
          typedName.textContent = expected;
          typedInput.value = '';
          accept.disabled = Boolean(expected);
          dialog.showModal();
          cancel.focus();
        });
      });
      typedInput.addEventListener('input', () => {
        accept.disabled = typedInput.value !== (pending?.dataset.typedConfirm || '');
      });
      cancel.addEventListener('click', () => { pending = null; dialog.close(); });
      accept.addEventListener('click', () => {
        if (!pending) return;
        const form = pending;
        pending = null;
        form.dataset.done = '1';
        dialog.close();
        form.requestSubmit();
      });
      dialog.addEventListener('close', () => opener?.focus());
    })();
  </script>`;
  return layout(a('admin'), body, true, lang);
}
