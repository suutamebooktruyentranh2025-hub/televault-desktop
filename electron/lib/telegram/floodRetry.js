/**
 * TDLib flood-wait (429) handling — wait the requested seconds then retry.
 */

/**
 * @param {unknown} error
 * @returns {number | null} seconds to wait, or null if not a flood error
 */
function parseFloodWaitSeconds(error) {
  const code = error && typeof error === 'object' ? /** @type {{ code?: number }} */ (error).code : undefined;
  const msg = String(
    (error && typeof error === 'object' && 'message' in error && error.message) || error || '',
  );
  const isFlood =
    code === 429 || /too many requests/i.test(msg) || /FLOOD_WAIT/i.test(msg);
  if (!isFlood) return null;

  const match =
    msg.match(/retry after\s+(\d+)/i) ||
    msg.match(/FLOOD_WAIT[_\s:-]*(\d+)/i);
  if (match) return Number.parseInt(match[1], 10);
  return 1;
}

class FloodWaitError extends Error {
  /**
   * @param {number} waitSec
   * @param {unknown} [cause]
   */
  constructor(waitSec, cause) {
    super(`FLOOD_WAIT_${waitSec}`);
    this.name = 'FloodWaitError';
    this.waitSec = waitSec;
    this.code = 429;
    this.cause = cause;
  }
}

/**
 * @param {(request: object) => Promise<unknown>} invokeFn
 * @param {object} request
 * @param {{
 *   maxRetries?: number,
 *   maxWaitSec?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   onWait?: (info: { waitSec: number, attempt: number, error: unknown }) => void,
 *   onResume?: () => void,
 * }} [opts]
 */
async function invokeWithFloodRetry(invokeFn, request, opts = {}) {
  const maxRetries = opts.maxRetries ?? 8;
  const maxWaitSec = opts.maxWaitSec ?? 60;
  const sleep =
    opts.sleep ||
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const onWait = opts.onWait || (() => {});
  const onResume = opts.onResume || (() => {});

  let attempt = 0;
  while (true) {
    try {
      const result = await invokeFn(request);
      if (attempt > 0) onResume();
      return result;
    } catch (e) {
      const waitSec = parseFloodWaitSeconds(e);
      if (waitSec == null || attempt >= maxRetries) throw e;
      attempt += 1;
      onWait({ waitSec, attempt, error: e });
      if (waitSec > maxWaitSec) {
        throw new FloodWaitError(waitSec, e);
      }
      await sleep(waitSec * 1000);
    }
  }
}

/**
 * Patch client.invoke to auto-retry on TDLib flood wait.
 * @param {{ invoke: (request: object) => Promise<unknown> }} client
 * @param {{
 *   maxRetries?: number,
 *   maxWaitSec?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   onWait?: (info: { waitSec: number, attempt: number, error: unknown }) => void,
 *   onResume?: () => void,
 * }} [opts]
 */
function wrapClientWithFloodRetry(client, opts = {}) {
  const rawInvoke = client.invoke.bind(client);
  client.invoke = (request) => invokeWithFloodRetry(rawInvoke, request, opts);
  return client;
}

module.exports = {
  FloodWaitError,
  parseFloodWaitSeconds,
  invokeWithFloodRetry,
  wrapClientWithFloodRetry,
};
