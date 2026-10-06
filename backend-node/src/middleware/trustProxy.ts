/**
 * Express's "trust proxy" setting from TRUST_PROXY: the number of reverse proxies in front of
 * the server (1 behind Caddy). Unset, no proxy is trusted, so req.ip is the connecting address
 * and a client can't dodge the per-IP rate limits by sending its own X-Forwarded-For.
 */
export function trustProxyHops(value: string | undefined): number {
  const hops = value?.trim() ?? '';
  if (hops === '') return 0;
  if (!/^\d+$/.test(hops)) {
    throw new Error(`TRUST_PROXY must be a number of proxy hops (such as 1), not "${value}"`);
  }
  return Number(hops);
}
