import { apiUrl, csrfToken } from '../core/api.js';

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = csrfToken();
  if (token && options.method && options.method !== 'GET') headers['X-CSRF-Token'] = token;
  const res = await fetch(apiUrl(path), {
    method: options.method || 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok || data.ok === false) {
    const error = new Error(data.error || `social_${res.status}`);
    error.code = data.error;
    error.status = res.status;
    throw error;
  }
  return data;
}

export const socialApi = {
  overview: () => request('/api/social'),
  ranking: () => request('/api/social/ranking'),
  notifications: () => request('/api/social/notifications'),
  addFriend: (target) => request('/api/social/friend', {
    method: 'POST',
    body: typeof target === 'number' || /^\d+$/.test(String(target)) ? { userId: Number(target) } : { username: String(target) },
  }),
  linkFriend: (profile) => request('/api/social/friend/link', { method: 'POST', body: profile }),
  removeFriend: (userId) => request('/api/social/friend/remove', { method: 'POST', body: { userId } }),
  postWall: (body) => request('/api/social/wall', { method: 'POST', body: { body } }),
  like: (postId) => request('/api/social/like', { method: 'POST', body: { postId } }),
  challenge: (userId) => request('/api/social/challenge', { method: 'POST', body: { userId } }),
  respondChallenge: (id, accept) => request('/api/social/challenge/respond', { method: 'POST', body: { id, accept } }),
  visit: (userId) => request('/api/social/visit', { method: 'POST', body: { userId } }),
  preview: (userId) => request('/api/social/visit', { method: 'POST', body: { userId, preview: true } }),
  visitBot: (botId) => request('/api/social/bot/visit', { method: 'POST', body: { botId } }),
  previewBot: (botId) => request('/api/social/bot/visit', { method: 'POST', body: { botId, preview: true } }),
  messages: (userId) => request(`/api/social/messages/${Number(userId)}`),
  threads: () => request('/api/social/messages'),
  sendMessage: (userId, body) => request('/api/social/message', { method: 'POST', body: { userId, body } }),
  reportRace: (opponentId, opponentWon) => request('/api/social/race/report', { method: 'POST', body: { opponentId, opponentWon } }),
  claimRaces: () => request('/api/social/races/claim', { method: 'POST', body: {} }),
  likeGarage: (hostId) => request('/api/social/garage/like', { method: 'POST', body: { hostId } }),
  seen: () => request('/api/social/seen', { method: 'POST', body: {} }),
  setRankingOptOut: (value) => request('/api/social/ranking-opt-out', { method: 'POST', body: { value } }),
};
