'use strict';

/**
 * Pure validator for user-supplied LLM endpoints (SSRF guard).
 *
 * Lives in its own module so it can be unit-tested without Electron:
 * `src/main/main.js` requires it for the `llm:test-connection` IPC handler.
 *
 * Allowed: public hostnames, `localhost`, and `127.0.0.1` (local LLM
 * servers). Blocked: private / loopback / link-local / metadata IP
 * literals — 10/8, 172.16/12, 192.168/16, 127/8 (other than 127.0.0.1),
 * 0.0.0.0/8, 169.254/16 (cloud metadata, e.g. 169.254.169.254), IPv6
 * loopback/link-local/unique-local (`::1`, `fe80::/10`, `fc00::/7`), and
 * integer-encoded IP hostnames (e.g. `2130706433` == 127.0.0.1).
 *
 * Known limitation (same as before): a *hostname* is allowed as-is — this
 * does not resolve DNS, so a hostname that resolves to a private IP is
 * not caught here. The main-process fetch also uses `redirect: 'error'`,
 * so a public URL cannot redirect the request to an internal one.
 *
 * @param {string} endpoint
 * @returns {{ok: boolean, error?: string}}
 */
function isAllowedLlmEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') {
    return { ok: false, error: 'Invalid endpoint' };
  }

  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false, error: 'Invalid endpoint URL' };
  }

  const scheme = url.protocol.toLowerCase();
  if (scheme !== 'http:' && scheme !== 'https:') {
    return { ok: false, error: 'Only http and https endpoints are allowed' };
  }

  // Reject dangerous schemes if somehow present in nested forms
  const lower = endpoint.toLowerCase();
  if (lower.startsWith('file:') || lower.startsWith('javascript:') || lower.startsWith('data:')) {
    return { ok: false, error: 'Disallowed endpoint scheme' };
  }

  const hostname = (url.hostname || '').toLowerCase();
  if (!hostname) {
    return { ok: false, error: 'Missing hostname' };
  }

  // Integer/hex-encoded IPv4 (e.g. 2130706433 == 127.0.0.1, 0x7f000001):
  // WHATWG URL parsing normalises these to dotted quads before we see
  // them, so inspect the raw host token in the original string instead.
  const rawHostToken = String(endpoint)
    .match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i)?.[1]
    ?.split('@')
    .pop()
    ?.replace(/^\[/, '')
    .replace(/\].*$/, '')
    .split(':')[0] ?? '';
  if (/^\d+$/.test(rawHostToken) || /^0x[0-9a-f]+$/i.test(rawHostToken)) {
    return { ok: false, error: 'Encoded IP endpoints are not allowed' };
  }

  // Allow localhost / 127.0.0.1 for local LLM servers — and nothing else
  // that is loopback-shaped. (IPv6 loopback [::1] is blocked on purpose:
  // local servers should use localhost or 127.0.0.1.)
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return { ok: true };
  }

  // IPv6 literals (URL.hostname strips the brackets): block loopback,
  // unspecified, link-local and unique-local ranges. No IPv6 literal is
  // an accepted local-LLM address, so reject them all as non-public.
  if (hostname.includes(':')) {
    return { ok: false, error: 'IPv6 endpoints are not allowed' };
  }

  // Dotted-quad IPv4 literals
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((o) => o > 255)) {
      return { ok: false, error: 'Invalid IP endpoint' };
    }
    const [a, b] = octets;
    if (a === 10) {
      return { ok: false, error: 'Private IP endpoints are not allowed' };
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return { ok: false, error: 'Private IP endpoints are not allowed' };
    }
    if (a === 192 && b === 168) {
      return { ok: false, error: 'Private IP endpoints are not allowed' };
    }
    if (a === 169 && b === 254) {
      return { ok: false, error: 'Link-local / metadata IP endpoints are not allowed' };
    }
    if (a === 127) {
      return { ok: false, error: 'Use localhost or 127.0.0.1 for local models' };
    }
    if (a === 0) {
      return { ok: false, error: 'Unspecified IP endpoints are not allowed' };
    }
  }

  return { ok: true };
}

module.exports = { isAllowedLlmEndpoint };
