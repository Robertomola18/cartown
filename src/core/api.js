// Base path and small fetch helpers. The game can live below /cartown/ and
// all API/WebSocket URLs must stay under that prefix.

export function basePath() {
  try {
    return new URL('.', document.baseURI).pathname.replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function apiUrl(path) {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${basePath()}${suffix}`;
}

export function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${basePath()}/ws`;
}

export function redirectLogin() {
  let next = location.pathname + location.search;
  try {
    const scene = sessionStorage.getItem('cartown:pendingScene');
    if (scene === 'race' || scene === 'town') {
      const url = new URL(next, location.origin);
      url.searchParams.set('goto', scene);
      next = url.pathname + url.search;
    }
  } catch {}
  location.href = `${apiUrl('/login')}?next=${encodeURIComponent(next)}`;
}

export function csrfToken() {
  const match = document.cookie.match(
    /(?:^|;\s*)cartown_csrf=([^;]*)/,
  );
  return match ? decodeURIComponent(match[1]) : '';
}

export async function logout() {
  const token = csrfToken();
  const body = new URLSearchParams({ _csrf: token });
  try {
    await fetch(apiUrl('/logout'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-Token': token,
      },
      body,
    });
  } finally {
    location.href = apiUrl('/login');
  }
}

export async function ackTutorial() {
  const token = csrfToken();
  try {
    const res = await fetch(apiUrl('/api/tutorial/ack'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': token },
    });
    return Boolean(res.ok);
  } catch {
    return false;
  }
}
