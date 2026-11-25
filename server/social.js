import {
  addFriend,
  claimFriendRaces,
  createChallenge,
  createWallPost,
  linkFriendByProfile,
  listChallenges,
  listFriends,
  listMessageThreads,
  listMessages,
  listNotifications,
  listRanking,
  listWall,
  markNotificationsRead,
  messageUnread,
  recordVisit,
  removeFriend,
  reportFriendRace,
  respondChallenge,
  sendMessage,
  setUserRankingOptOut,
  socialUnread,
  toggleLike,
  toggleGarageLike,
  visitBot,
} from './db.js';
import { checkCsrf, rateLimit, readBody } from './auth.js';
import { listBots } from './db.js';

async function readJson(req, res, sendJson) {
  try {
    const raw = await readBody(req, 32 * 1024);
    const value = JSON.parse(raw || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('bad');
    return value;
  } catch {
    sendJson(res, 400, { ok: false, error: 'invalid_json' });
    return null;
  }
}

function guard(req, res, session, sendJson) {
  if (!checkCsrf(req, req.headers['x-csrf-token'])) {
    sendJson(res, 403, { ok: false, error: 'csrf' });
    return false;
  }
  const limit = rateLimit(`social:${session.user.id}`, 90, 60 * 1000);
  if (!limit.ok) {
    sendJson(res, 429, { ok: false, error: 'rate_limited', retryAfter: limit.retryAfter });
    return false;
  }
  return true;
}

export async function handleSocialApi(req, res, rel, session, sendJson) {
  if (req.method === 'GET') {
    const limit = rateLimit(`social:read:${session.user.id}`, 120, 60 * 1000);
    if (!limit.ok) {
      sendJson(res, 429, { ok: false, error: 'rate_limited', retryAfter: limit.retryAfter });
      return true;
    }
  }

  if (req.method === 'GET' && rel === '/api/social') {
    const ranking = listRanking(session.user.id, 30);
    sendJson(res, 200, {
      ok: true,
      friends: listFriends(session.user.id),
      bots: listBots({ includeInactive: false }).filter((bot) => bot.visitable || bot.challengeable),
      wall: listWall(session.user.id, 40),
      challenges: listChallenges(session.user.id),
      notifications: listNotifications(session.user.id, 30),
      threads: listMessageThreads(session.user.id),
      unread: socialUnread(session.user.id),
      unreadMessages: messageUnread(session.user.id),
      ranking: ranking.ranking,
      optOut: ranking.optOut,
      serverNow: Date.now(),
    });
    return true;
  }

  if (req.method === 'GET' && rel === '/api/social/ranking') {
    sendJson(res, 200, { ok: true, ...listRanking(session.user.id, 100) });
    return true;
  }

  if (req.method === 'GET' && rel === '/api/social/notifications') {
    sendJson(res, 200, { ok: true, notifications: listNotifications(session.user.id, 60), unread: socialUnread(session.user.id) });
    return true;
  }

  if (req.method === 'GET' && rel === '/api/social/messages') {
    sendJson(res, 200, { ok: true, threads: listMessageThreads(session.user.id), unreadMessages: messageUnread(session.user.id) });
    return true;
  }

  const messagesMatch = rel.match(/^\/api\/social\/messages\/(\d+)$/);
  if (req.method === 'GET' && messagesMatch) {
    sendJson(res, 200, listMessages(session.user.id, Number(messagesMatch[1])));
    return true;
  }

  if (req.method === 'GET' && rel === '/api/social/races/pending') {
    sendJson(res, 200, claimFriendRaces(session.user.id));
    return true;
  }

  if (req.method !== 'POST') return false;
  if (!guard(req, res, session, sendJson)) return true;
  const body = await readJson(req, res, sendJson);
  if (!body) return true;

  if (rel === '/api/social/friend') {
    sendJson(res, 200, addFriend(session.user.id, body.userId ?? body.username));
    return true;
  }
  if (rel === '/api/social/friend/link') {
    sendJson(res, 200, linkFriendByProfile(session.user.id, {
      username: body.username,
      name: body.name,
      level: body.level,
      model: body.model,
    }));
    return true;
  }
  if (rel === '/api/social/friend/remove') {
    sendJson(res, 200, removeFriend(session.user.id, Number(body.userId)));
    return true;
  }
  if (rel === '/api/social/wall') {
    sendJson(res, 200, createWallPost(session.user.id, body.body));
    return true;
  }
  if (rel === '/api/social/like') {
    sendJson(res, 200, toggleLike(Number(body.postId), session.user.id));
    return true;
  }
  if (rel === '/api/social/challenge') {
    sendJson(res, 200, createChallenge(session.user.id, Number(body.userId)));
    return true;
  }
  if (rel === '/api/social/challenge/respond') {
    sendJson(res, 200, respondChallenge(session.user.id, Number(body.id), Boolean(body.accept)));
    return true;
  }
  if (rel === '/api/social/visit') {
    sendJson(res, 200, recordVisit(session.user.id, Number(body.userId), { preview: Boolean(body.preview) }));
    return true;
  }
  if (rel === '/api/social/bot/visit') {
    sendJson(res, 200, visitBot(session.user.id, Number(body.botId)));
    return true;
  }
  if (rel === '/api/social/garage/like') {
    sendJson(res, 200, toggleGarageLike(Number(body.hostId), session.user.id));
    return true;
  }
  if (rel === '/api/social/message') {
    sendJson(res, 200, sendMessage(session.user.id, Number(body.userId), body.body));
    return true;
  }
  if (rel === '/api/social/race/report') {
    sendJson(res, 200, reportFriendRace(session.user.id, Number(body.opponentId), Boolean(body.opponentWon)));
    return true;
  }
  if (rel === '/api/social/races/claim') {
    sendJson(res, 200, claimFriendRaces(session.user.id));
    return true;
  }
  if (rel === '/api/social/seen') {
    sendJson(res, 200, { ...markNotificationsRead(session.user.id), unread: 0 });
    return true;
  }
  if (rel === '/api/social/ranking-opt-out') {
    setUserRankingOptOut(session.user.id, Boolean(body.value));
    sendJson(res, 200, { ok: true, optOut: Boolean(body.value) });
    return true;
  }
  return false;
}
