import { el, fmt } from '../core/util.js';
import { t } from '../core/i18n.js';
import { icon } from './icons.js';
import { modal } from './dom.js';
import { audio } from '../core/audio.js';
import { socialApi } from '../game/social.js';
import { NPC_FRIENDS } from '../game/catalog.js';
import { MODELS } from '../cars/models.js';
import { defaultConfig } from '../cars/carFactory.js';
import { carThumb } from './thumbs.js';
import { portrait } from '../world/characters.js';
import { makeFriendCode, parseFriendCode, sanitizeCfg } from '../game/friends.js';

function ago(ts) {
  const diff = Math.max(0, Date.now() - Number(ts || 0));
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return new Date(Number(ts)).toLocaleDateString();
}

function isOnline(user) {
  return Boolean(user?.lastLoginAt && Date.now() - Number(user.lastLoginAt) < 10 * 60 * 1000);
}

function safeConfig(cfg) {
  const safe = sanitizeCfg(cfg);
  return { ...defaultConfig(safe.model), ...safe };
}

function errorText(app, error) {
  audio.error();
  app.toast(t('socialError'), 'warn');
  console.warn('social', error);
}

export function openSocial(app, initialTab = 'friends') {
  const st = app.state;
  let tab = initialTab;
  let data = null;
  const tabs = el('div', { class: 'tabs social-tabs' });
  const body = el('div', { class: 'social-body' });
  const m = modal({
    title: t('community'),
    className: 'social-modal',
    wide: true,
    content: [tabs, body],
  });

  const renderTabs = () => {
    tabs.innerHTML = '';
    for (const [key, label] of [
      ['friends', t('friends')],
      ['wall', t('wall')],
      ['challenges', t('challenges')],
      ['messages', data?.unreadMessages ? `${t('messages')} (${data.unreadMessages})` : t('messages')],
      ['ranking', t('ranking')],
      ['notifications', data?.unread ? `${t('notifications')} (${data.unread})` : t('notifications')],
    ]) {
      tabs.appendChild(el('button', {
        class: `tab ${tab === key ? 'on' : ''}`,
        onclick: () => { tab = key; audio.click(); renderTabs(); render(); },
      }, label));
    }
  };

  const reload = async (keep = true) => {
    try {
      data = await socialApi.overview();
      renderTabs();
      render(keep);
    } catch (error) {
      errorText(app, error);
    }
  };

  const openVisit = (host, isBot = false) => {
    m.close();
    setTimeout(() => app.visitGarage(host, { isBot }), 170);
  };

  const openVisitFallback = (friend, error) => {
    console.warn('social visit', error);
    const local = app.localFriendHost?.(friend);
    if (local?.garage?.cars?.length) openVisit(local);
    else errorText(app, error);
  };

  const launchFriend = (f) => {
    m.close();
    setTimeout(() => app.openRaceMenu({ friend: f, tab: 'friends' }), 170);
  };

  const sendChallenge = async (f) => {
    try {
      await socialApi.challenge(f.id);
      audio.cash();
      app.toast(t('challengeSent', { name: f.name }));
    } catch (error) {
      if (error.code === 'already_pending') app.toast(t('alreadyPending'), 'warn');
      else errorText(app, error);
    }
  };

  const removeServerFriend = async (f) => {
    try {
      await socialApi.removeFriend(f.id);
      st.data.friends = (st.data.friends || []).filter((x) => Number(x.serverUserId) !== Number(f.id));
      st.save();
      app.garage.buildFriends();
      app.toast(t('friendRemoved', { name: f.name }));
      await reload();
    } catch (error) { errorText(app, error); }
  };

  const friendsView = () => {
    const wrap = el('div', { class: 'social-friends' });
    const username = el('input', { class: 'name-input', placeholder: t('usernamePlaceholder'), maxlength: 24 });
    const code = makeFriendCode(st, app.user);
    const localList = el('div', { class: 'friend-list' });
    const imported = (st.data.friends || []).filter((f) => f.imported);
    const allLocal = [...NPC_FRIENDS, ...imported];
    for (const f of allLocal) {
      const cfg = safeConfig(f.car);
      const img = el('img', { alt: '' });
      carThumb(cfg, img);
      localList.appendChild(el('div', { class: 'friend-row' },
        el('img', { class: 'portrait', src: portrait(f.avatar, 56), alt: '' }),
        el('div', { class: 'opp-info' }, el('b', {}, f.name),
          el('small', {}, `${t('level')} ${f.level} · ${MODELS[cfg.model].name}`),
          f.imported ? el('i', { class: 'tag' }, t('friendCode')) : null),
        img,
        el('button', { class: 'btn btn-green', onclick: () => launchFriend(f) }, t('challenge')),
        f.serverUserId || f.car ? el('button', { class: 'btn btn-gray', onclick: async () => {
          if (f.serverUserId) {
            try { openVisit((await socialApi.visit(Number(f.serverUserId))).host); await reload(); } catch (error) { openVisitFallback(f, error); }
          } else openVisit(app.localFriendHost ? app.localFriendHost(f) : f);
        } }, t('visit')) : null,
        f.serverUserId ? el('button', { class: 'btn btn-blue', onclick: () => openChat(app, f) }, t('sendMessage')) : null,
        f.imported ? el('button', {
          class: 'btn btn-gray icon-only', title: t('remove'), html: icon('trash'),
          onclick: () => {
            st.data.friends = (st.data.friends || []).filter((x) => x.id !== f.id);
            st.save();
            app.garage.buildFriends();
            render();
          },
        }) : null));
    }
    const onlineList = el('div', { class: 'friend-list' });
    if (!data.friends.length) onlineList.appendChild(el('p', { class: 'hint' }, t('noFriends')));
    for (const f of data.friends) {
      const img = el('img', { alt: '' });
      carThumb(safeConfig(f.car), img);
      onlineList.appendChild(el('div', { class: 'friend-row online' },
        el('img', { class: 'portrait', src: portrait(f.avatar, 56), alt: '' }),
        el('div', { class: 'opp-info' }, el('b', {}, f.name, ' ', el('i', { class: `dot ${isOnline(f) ? 'on' : ''}`, title: isOnline(f) ? t('onlineNow') : t('offline') })),
          el('small', {}, `${t('level')} ${f.level} · ${fmt(f.wins)} ${t('wins')} · ${fmt(f.garageCars)} ${t('cars')}`),
          el('small', {}, `@${f.username}`)),
        img,
        el('button', { class: 'btn btn-green', onclick: () => launchFriend(f) }, t('challenge')),
        el('button', { class: 'btn btn-blue', onclick: () => sendChallenge(f) }, t('sendChallenge')),
        el('button', { class: 'btn btn-gray', onclick: async () => {
          try { openVisit((await socialApi.visit(f.id)).host); await reload(); } catch (error) { openVisitFallback(f, error); }
        } }, t('visit')),
        el('button', { class: 'btn btn-blue', onclick: () => openChat(app, f) }, t('sendMessage')),
        el('button', { class: 'btn btn-gray icon-only', title: t('remove'), html: icon('trash'), onclick: () => removeServerFriend(f) })));
    }
    const botList = el('div', { class: 'friend-list' });
    for (const b of (data.bots || [])) {
      const img = el('img', { alt: '' });
      carThumb(safeConfig(b.car), img);
      botList.appendChild(el('div', { class: 'friend-row online' },
        el('img', { class: 'portrait', src: portrait(b.avatar, 56), alt: '' }),
        el('div', { class: 'opp-info' }, el('b', {}, b.name, ' ', el('i', { class: 'tag' }, 'BOT')),
          el('small', {}, `${t('level')} ${b.level} · ${MODELS[safeConfig(b.car).model]?.name || ''}`),
          el('small', {}, `@${b.handle}`)),
        img,
        b.challengeable ? el('button', { class: 'btn btn-green', onclick: () => launchFriend({ ...b, car: b.car }) }, t('challenge')) : null,
        b.visitable ? el('button', { class: 'btn btn-gray', onclick: async () => {
          try { openVisit((await socialApi.visitBot(b.id)).host, true); } catch (error) { errorText(app, error); }
        } }, t('visit')) : null));
    }
    const codeInput = el('textarea', { class: 'code-area', placeholder: t('paste'), rows: 2 });
    const myCode = el('textarea', { class: 'code-area', readonly: true, rows: 2 }, code);
    wrap.append(
      el('div', { class: 'social-section' },
        el('h3', {}, 'Bots'),
        botList),
      el('div', { class: 'social-section' },
        el('h3', {}, t('onlineFriends')),
        el('div', { class: 'inline-form' }, username, el('button', { class: 'btn btn-green', onclick: async () => {
          try {
            const r = await socialApi.addFriend(username.value.trim());
            app.mergeSocialFriends([r.friend]);
            audio.cash();
            app.toast(t('friendAdded', { name: r.friend.name }));
            username.value = '';
            await reload();
          } catch (error) {
            if (error.code === 'user_not_found') app.toast(t('friendNotFound'), 'warn');
            else errorText(app, error);
          }
        } }, t('addFriend'))),
        onlineList),
      el('div', { class: 'social-section' }, el('h3', {}, t('yourFriends')), localList),
      el('div', { class: 'code-box' },
        el('div', { class: 'opt-label' }, t('myCode')), myCode,
        el('button', { class: 'btn btn-blue', onclick: async () => {
          try { await navigator.clipboard.writeText(code); } catch { myCode.select(); document.execCommand?.('copy'); }
          app.toast(t('copied'));
        } }, el('span', { html: icon('copy') }), t('copy'))),
      el('div', { class: 'code-box' },
        el('div', { class: 'opt-label' }, t('addFriend')), codeInput,
        el('button', { class: 'btn btn-green', onclick: async () => {
          const f = parseFriendCode(codeInput.value);
          if (!f) { audio.error(); app.toast(t('invalidCode'), 'warn'); return; }
          st.data.friends = (st.data.friends || []).filter((x) => x.id !== f.id && x.name !== f.name);
          st.data.friends.push(f);
          st.save();
          app.garage.buildFriends();
          audio.cash();
          app.toast(t('friendAdded', { name: f.name }));
          codeInput.value = '';
          if (st.remote) await app.refreshSocial({ quiet: true });
          render();
        } }, t('addFriend'))));
    return wrap;
  };

  const wallView = () => {
    const wrap = el('div', { class: 'social-wall' });
    const text = el('textarea', { class: 'wall-input', rows: 3, maxlength: 500, placeholder: t('writePost') });
    const feed = el('div', { class: 'wall-feed' });
    if (!data.wall.length) feed.appendChild(el('p', { class: 'hint' }, t('noPosts')));
    for (const p of data.wall) {
      const like = el('button', { class: `btn ${p.liked ? 'btn-blue' : 'btn-gray'}`, onclick: async () => {
        try { await socialApi.like(p.id); await reload(); } catch (error) { errorText(app, error); }
      } }, el('span', { html: icon('star') }), `${t('like')} ${p.likes}`);
      const head = el('div', { class: 'wall-head' }, el('b', {}, p.author.name), el('small', {}, `· ${t('level')} ${p.author.level} · ${ago(p.createdAt)}`));
      const actions = el('div', { class: 'wall-actions' }, like);
      const main = el('div', { class: 'wall-main' }, head, el('p', {}, p.body), actions);
      feed.appendChild(el('div', { class: 'wall-post' }, el('img', { class: 'portrait', src: portrait(p.author.avatar, 48), alt: '' }), main));
    }
    wrap.append(
      el('div', { class: 'wall-compose' }, text,
        el('button', { class: 'btn btn-green', onclick: async () => {
          if (!text.value.trim()) { audio.error(); app.toast(t('emptyPost'), 'warn'); return; }
          try { await socialApi.postWall(text.value); text.value = ''; audio.cash(); await reload(); } catch (error) { errorText(app, error); }
        } }, t('post'))),
      feed);
    return wrap;
  };

  const challengesView = () => {
    const wrap = el('div', { class: 'social-challenges' });
    const incoming = data.challenges.filter((c) => c.incoming && c.status === 'pending');
    const outgoing = data.challenges.filter((c) => !c.incoming);
    const incomingBox = el('div', { class: 'social-section' }, el('h3', {}, t('incomingChallenges')));
    if (!incoming.length) incomingBox.appendChild(el('p', { class: 'hint' }, t('noChallenges')));
    for (const c of incoming) {
      incomingBox.appendChild(el('div', { class: 'challenge-row' },
        el('img', { class: 'portrait', src: portrait(c.challenger.avatar, 48), alt: '' }),
        el('div', { class: 'opp-info' }, el('b', {}, c.challenger.name),
          el('small', {}, `${t('level')} ${c.challenger.level} · ${MODELS[c.car.model]?.name || c.car.model} · ${ago(c.createdAt)}`)),
        el('button', { class: 'btn btn-green', onclick: async () => {
          try {
            const r = await socialApi.respondChallenge(c.id, true);
            m.close();
            const f = { id: r.challenge.challenger.id, serverUserId: r.challenge.challenger.id, name: r.challenge.challenger.name, avatar: r.challenge.challenger.avatar, level: r.challenge.challenger.level, car: r.challenge.car };
            setTimeout(() => app.openRaceMenu({ friend: f, tab: 'friends' }), 170);
          } catch (error) { errorText(app, error); }
        } }, t('accept')),
        el('button', { class: 'btn btn-gray', onclick: async () => {
          try { await socialApi.respondChallenge(c.id, false); await reload(); } catch (error) { errorText(app, error); }
        } }, t('decline'))));
    }
    const outgoingBox = el('div', { class: 'social-section' }, el('h3', {}, t('outgoingChallenges')));
    if (!outgoing.length) outgoingBox.appendChild(el('p', { class: 'hint' }, t('noChallenges')));
    for (const c of outgoing.slice(0, 12)) {
      outgoingBox.appendChild(el('div', { class: 'challenge-row' },
        el('div', { class: 'opp-info' }, el('b', {}, c.opponent.name), el('small', {}, `${t(c.status)} · ${ago(c.createdAt)}`)),
        el('span', { class: `tag status-${c.status}` }, t(c.status))));
    }
    wrap.append(el('p', { class: 'hint' }, t('challengesInfo')), incomingBox, outgoingBox);
    return wrap;
  };

  const messagesView = () => {
    const wrap = el('div', { class: 'social-messages' });
    const list = el('div', { class: 'message-threads' });
    const threads = data.threads || [];
    if (!threads.length) list.appendChild(el('p', { class: 'hint' }, t('noThreads')));
    for (const th of threads) {
      list.appendChild(el('div', { class: 'friend-row online' },
        el('img', { class: 'portrait', src: portrait(th.user.avatar, 56), alt: '' }),
        el('div', { class: 'opp-info' }, el('b', {}, th.user.name, th.unread ? el('span', { class: 'badge' }, String(th.unread)) : null),
          el('small', {}, `${th.mine ? 'Tú: ' : ''}${th.last}`),
          el('small', {}, ago(th.createdAt))),
        el('button', { class: 'btn btn-blue', onclick: () => openChat(app, th.user, reload) }, t('sendMessage'))));
    }
    wrap.append(el('div', { class: 'social-section' }, el('h3', {}, t('messages')), list));
    return wrap;
  };

  const rankingView = () => {
    const wrap = el('div', { class: 'social-ranking' });
    const rows = el('div', { class: 'rank-rows' });
    if (!data.ranking.length) rows.appendChild(el('p', { class: 'hint' }, t('noRanking')));
    for (const u of data.ranking) {
      rows.appendChild(el('div', { class: `rank-row ${u.id === app.user?.id ? 'me' : ''}` },
        el('b', { class: 'rank-num' }, `#${u.rank}`),
        el('img', { class: 'portrait', src: portrait(u.avatar, 40), alt: '' }),
        el('div', { class: 'opp-info' }, el('b', {}, u.name), el('small', {}, `${t('level')} ${u.level} · ${fmt(u.wins)} ${t('wins')}`)),
        el('span', { class: 'rank-xp' }, `${fmt(u.xp)} XP`)));
    }
    wrap.append(
      el('p', { class: 'hint' }, t('rankingInfo')),
      el('div', { class: 'row-buttons' },
        el('button', { class: 'btn btn-blue', onclick: async () => {
          try { await socialApi.setRankingOptOut(!data.optOut); await reload(); } catch (error) { errorText(app, error); }
        } }, data.optOut ? t('optIn') : t('optOut'))),
      data.optOut ? el('p', { class: 'warn' }, t('rankingOptOutInfo')) : null,
      rows);
    return wrap;
  };

  const notificationsView = () => {
    const wrap = el('div', { class: 'social-notifications' });
    const list = el('div', { class: 'notif-list' });
    if (!data.notifications.length) list.appendChild(el('p', { class: 'hint' }, t('noNotifications')));
    for (const n of data.notifications) {
      list.appendChild(el('div', { class: `notif ${n.read ? 'read' : 'unread'}` },
        el('span', { html: icon(n.type === 'challenge' ? 'flag' : n.type === 'like' ? 'star' : (n.type === 'wall' || n.type === 'message') ? 'bubbles' : n.type === 'race' ? 'flag' : 'users') }),
        el('div', {}, el('p', {}, n.text), el('small', {}, ago(n.createdAt)))));
    }
    wrap.append(
      el('div', { class: 'row-buttons' },
        el('button', { class: 'btn btn-blue', onclick: async () => {
          try { await socialApi.seen(); await reload(); } catch (error) { errorText(app, error); }
        } }, t('markAllRead'))),
      list);
    return wrap;
  };

  function render(keep = true) {
    if (!data) return;
    body.innerHTML = '';
    let view;
    if (tab === 'friends') view = friendsView();
    else if (tab === 'wall') view = wallView();
    else if (tab === 'challenges') view = challengesView();
    else if (tab === 'messages') view = messagesView();
    else if (tab === 'ranking') view = rankingView();
    else view = notificationsView();
    body.appendChild(view);
    if (keep) body.scrollTop = 0;
  }

  renderTabs();
  body.appendChild(el('p', { class: 'loading-line' }, '...'));
  reload(false);
}


export function openChat(app, friend, onRead = null) {
  const otherId = Number(friend?.serverUserId || friend?.id);
  if (!Number.isFinite(otherId) || otherId <= 0) return null;
  const list = el('div', { class: 'chat-list' });
  const input = el('input', { class: 'name-input chat-input', maxlength: 500, placeholder: t('messagePlaceholder') });
  const send = el('button', { class: 'btn btn-green' }, t('send'));
  let timer = null;
  let lastCount = 0;
  const m = modal({
    title: t('chatWith', { name: friend.name || friend.username || 'Player' }),
    className: 'chat-modal',
    wide: true,
    content: [list, el('div', { class: 'inline-form chat-form' }, input, send)],
    onClose: () => timer && clearInterval(timer),
  });
  const render = async (scroll = false) => {
    try {
      const data = await socialApi.messages(otherId);
      list.innerHTML = '';
      if (!data.messages.length) list.appendChild(el('p', { class: 'hint' }, t('noMessages')));
      for (const msg of data.messages) {
        list.appendChild(el('div', { class: `chat-message ${msg.mine ? 'mine' : 'theirs'}` },
          el('p', {}, msg.body), el('small', {}, ago(msg.createdAt))));
      }
      if (scroll || data.messages.length !== lastCount) list.scrollTop = list.scrollHeight;
      lastCount = data.messages.length;
      if (onRead) onRead();
    } catch (error) {
      errorText(app, error);
    }
  };
  const submit = async () => {
    const text = input.value.trim();
    if (!text) return;
    try {
      await socialApi.sendMessage(otherId, text);
      input.value = '';
      audio.cash();
      app.toast(t('messageSent'), 'good');
      await render(true);
    } catch (error) { errorText(app, error); }
  };
  send.onclick = submit;
  input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
  render(true);
  timer = setInterval(() => render(false), 5000);
  return m;
}
