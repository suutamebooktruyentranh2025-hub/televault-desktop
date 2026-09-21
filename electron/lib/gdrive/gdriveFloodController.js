const { parseFloodWaitSeconds } = require('../telegram/floodRetry');

function createAbortError() {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

/**
 * Helper to sleep with AbortSignal support.
 * @param {number} delay_ms
 * @param {AbortSignal} [abort_signal]
 */
function sleepWithAbort(delay_ms, abort_signal) {
  if (abort_signal?.aborted) return Promise.reject(createAbortError());

  return new Promise((resolve, reject) => {
    let sleep_timer = null;
    const abort_handler = () => {
      if (sleep_timer) clearTimeout(sleep_timer);
      reject(createAbortError());
    };
    sleep_timer = setTimeout(() => {
      if (abort_signal) abort_signal.removeEventListener('abort', abort_handler);
      resolve();
    }, delay_ms);
    if (abort_signal) {
      abort_signal.addEventListener('abort', abort_handler, { once: true });
    }
  });
}

const FRIENDLY_AUTH_ERROR_MSG = 'Phiên đăng nhập Google Drive đã hết hạn hoặc bị hủy (Token refresh failed: Bad Request / Invalid Credentials). Vui lòng kết nối lại tài khoản.';

/**
 * Check if error is related to expired, revoked or invalid Google Drive authentication.
 * @param {Error|unknown} err
 * @returns {boolean}
 */
function isAuthError(err) {
  const msg = String(err?.message || err).toLowerCase();
  return (
    msg.includes('token refresh failed') ||
    msg.includes('invalid_grant') ||
    (msg.includes('bad request') && msg.includes('token')) ||
    msg.includes('invalid credentials') ||
    msg.includes('unauthenticated') ||
    msg.includes('autherror') ||
    msg.includes('token has been expired or revoked') ||
    msg.includes('the incoming token has expired') ||
    msg.includes('invalid_token') ||
    msg.includes('oauth failed') ||
    msg.includes('oauth timeout') ||
    (msg.includes('401') && (msg.includes('auth') || msg.includes('credential') || msg.includes('unauthorized') || msg.includes('token') || msg.includes('download failed: 401')))
  );
}

/**
 * Classify an error for retry decisions.
 * @param {Error|unknown} err
 * @returns {'throttle'|'timeout'|'network'|'permanent'|'auth'}
 */
function classifyError(err) {
  const msg = String(err?.message || err).toLowerCase();

  // Authentication errors (expired refresh token, revoked access, 401 Unauthorized)
  if (isAuthError(err)) {
    return 'auth';
  }

  // Throttle errors (Telegram flood / Drive 429)
  if (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('flood') ||
    msg.includes('too many requests')
  ) {
    return 'throttle';
  }

  // Timeout errors
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'timeout';
  }

  // Network errors
  if (
    msg.includes('econnreset') || msg.includes('enotfound') ||
    msg.includes('socket hang up') || msg.includes('econnrefused') ||
    msg.includes('network') || msg.includes('fetch failed')
  ) {
    return 'network';
  }

  // Permanent errors (404, 403 non-rate-limit, trashed)
  if (msg.includes('404') || msg.includes('not found') || msg.includes('trashed')) {
    return 'permanent';
  }
  if (msg.includes('403') && !msg.includes('rate')) {
    return 'permanent';
  }

  return 'network';
}

module.exports = {
  createAbortError,
  sleepWithAbort,
  classifyError,
  isAuthError,
  FRIENDLY_AUTH_ERROR_MSG,
  parseFloodWaitSeconds,
};

