const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');
const { shell } = require('electron');

const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

class GDriveAuth {
  /**
   * @param {{ db: import('../db/indexDb').ReturnType<import('../db/indexDb').openIndexDb> }} opts
   */
  constructor({ db, onAuthUrl } = {}) {
    this.db = db;
    this.onAuthUrl = onAuthUrl || null;
    this._active_authorization = false;
    this._pending_auth = null;
    this.currentAuthUrl = null;
  }

  get clientId() { return this.db.gdriveTokenGet('client_id'); }
  get clientSecret() { return this.db.gdriveTokenGet('client_secret'); }
  get accessToken() { return this.db.gdriveTokenGet('access_token'); }
  get refreshToken() { return this.db.gdriveTokenGet('refresh_token'); }
  get expiry() { return this.db.gdriveTokenGet('expiry'); }
  get email() { return this.db.gdriveTokenGet('email'); }

  isConnected() {
    return Boolean(this.refreshToken || this.accessToken);
  }

  saveCredentials(clientId, clientSecret) {
    if (clientId) {
      this.db.gdriveTokenSet('client_id', clientId);
    } else if (typeof this.db.gdriveTokenDelete === 'function') {
      this.db.gdriveTokenDelete('client_id');
    }
    if (clientSecret) {
      this.db.gdriveTokenSet('client_secret', clientSecret);
    } else if (typeof this.db.gdriveTokenDelete === 'function') {
      this.db.gdriveTokenDelete('client_secret');
    }
  }

  cancelAuthorization(reason = 'Đã hủy phiên xác thực Google Drive') {
    if (this._pending_auth) {
      const pending = this._pending_auth;
      this._pending_auth = null;
      if (typeof pending.reject === 'function') {
        pending.reject(new Error(reason));
      }
    }
    this._active_authorization = false;
    this.currentAuthUrl = null;
    if (typeof this.onAuthUrl === 'function') {
      this.onAuthUrl(null);
    }
  }

  /**
   * Start OAuth2 flow: open browser, listen for redirect.
   * @param {{ force?: boolean }} [opts]
   * @returns {Promise<{ ok: boolean, email?: string, error?: string, authUrl?: string }>}
   */
  async authorize({ force = false } = {}) {
    const clientId = this.clientId;
    const clientSecret = this.clientSecret;
    if (!clientId || !clientSecret) return { ok: false, error: 'Missing client credentials' };
    if (this._active_authorization) {
      if (force) {
        this.cancelAuthorization('Bắt đầu phiên xác thực mới');
      } else {
        return { ok: false, error: 'OAuth authorization already in progress' };
      }
    }

    this._active_authorization = true;
    try {
      const expected_state = crypto.randomBytes(16).toString('hex');
      const { port, code } = await this._listenForCode(expected_state);
      const redirectUri = `http://localhost:${port}`;

      const authUrl = `${AUTH_URL}?client_id=${encodeURIComponent(clientId)}`
        + `&redirect_uri=${encodeURIComponent(redirectUri)}`
        + `&response_type=code&scope=${encodeURIComponent(SCOPES)}`
        + `&access_type=offline&prompt=select_account%20consent`
        + `&state=${encodeURIComponent(expected_state)}`;

      this.currentAuthUrl = authUrl;
      if (typeof this.onAuthUrl === 'function') {
        this.onAuthUrl(authUrl);
      }
      await shell.openExternal(authUrl);

      let authCode;
      try {
        authCode = await code;
      } catch (e) {
        return { ok: false, error: String(e.message || e) };
      }

      // Exchange code for tokens
      const tokens = await this._exchangeCode(authCode, redirectUri);
      if (!tokens.ok) return tokens;

      this.db.gdriveTokenSet('access_token', tokens.access_token);
      this.db.gdriveTokenSet('refresh_token', tokens.refresh_token);
      this.db.gdriveTokenSet('expiry', tokens.expiry);

      // Get user email
      const email = await this._fetchEmail(tokens.access_token);
      if (email) this.db.gdriveTokenSet('email', email);

      return { ok: true, email };
    } finally {
      this._active_authorization = false;
      this._pending_auth = null;
      this.currentAuthUrl = null;
      if (typeof this.onAuthUrl === 'function') {
        this.onAuthUrl(null);
      }
    }
  }

  /**
   * Get a valid access token, refreshing if needed.
   * @returns {Promise<string>}
   */
  async getValidToken() {
    const expiry = this.expiry;
    const now = Date.now();
    if (expiry && Number(expiry) > now + 60_000) {
      return this.accessToken;
    }
    return this._refreshAccessToken();
  }

  async _refreshAccessToken() {
    const clientId = this.clientId;
    const clientSecret = this.clientSecret;
    const refreshToken = this.refreshToken;
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Cannot refresh — missing credentials');
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString();

    const data = await this._post(TOKEN_URL, body);
    if (data.error) throw new Error(`Token refresh failed: ${data.error_description || data.error}`);

    this.db.gdriveTokenSet('access_token', data.access_token);
    const expiry = String(Date.now() + (data.expires_in || 3600) * 1000);
    this.db.gdriveTokenSet('expiry', expiry);
    if (data.refresh_token) {
      this.db.gdriveTokenSet('refresh_token', data.refresh_token);
    }
    return data.access_token;
  }

  disconnect({ keepCredentials = true } = {}) {
    if (keepCredentials && typeof this.db.gdriveTokenDelete === 'function') {
      this.db.gdriveTokenDelete('access_token');
      this.db.gdriveTokenDelete('refresh_token');
      this.db.gdriveTokenDelete('expiry');
      this.db.gdriveTokenDelete('email');
    } else {
      this.db.gdriveTokensClear();
    }
  }

  /**
   * Start a temporary local HTTP server to receive the OAuth redirect.
   * @returns {Promise<{ port: number, code: Promise<string> }>}
   */
  _listenForCode(expected_state) {
    return new Promise((resolve) => {
      const server = http.createServer();
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        let settled = false;
        let timeout = null;

        const codePromise = new Promise((resolveCode, rejectCode) => {
          const cleanup = () => {
            if (settled) return;
            settled = true;
            if (timeout) clearTimeout(timeout);
            try { server.close(); } catch {}
          };

          this._pending_auth = {
            server,
            reject: (err) => {
              cleanup();
              rejectCode(err);
            },
          };

          timeout = setTimeout(() => {
            cleanup();
            rejectCode(new Error('OAuth timeout — vui lòng thử lại'));
          }, 5 * 60 * 1000);
          this._pending_auth.timeout = timeout;

          server.on('request', (req, res) => {
            if (settled) return;
            const url = new URL(req.url, `http://localhost:${port}`);
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            const received_state = url.searchParams.get('state');
            const pending_buffer = Buffer.from(expected_state || '');
            const received_buffer = Buffer.from(received_state || '');
            const valid_state = Boolean(
              pending_buffer.length
              && pending_buffer.length === received_buffer.length
              && crypto.timingSafeEqual(pending_buffer, received_buffer),
            );

            if (!valid_state) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<html><body><h2>Lỗi: OAuth state mismatch</h2></body></html>');
              cleanup();
              rejectCode(new Error('OAuth state mismatch'));
              return;
            }

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            cleanup();
            if (code) {
              res.end('<html><body><h2>Đã kết nối Google Drive! Bạn có thể đóng tab này.</h2></body></html>');
              resolveCode(code);
            } else {
              res.end(`<html><body><h2>Lỗi: ${error || 'unknown'}</h2></body></html>`);
              rejectCode(new Error(error || 'OAuth failed'));
            }
          });
        });
        resolve({ port, code: codePromise });
      });
    });
  }

  async _exchangeCode(code, redirectUri) {
    const body = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString();

    const data = await this._post(TOKEN_URL, body);
    if (data.error) return { ok: false, error: data.error_description || data.error };

    return {
      ok: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry: String(Date.now() + (data.expires_in || 3600) * 1000),
    };
  }

  async _fetchEmail(token) {
    try {
      const data = await this._get('https://www.googleapis.com/oauth2/v2/userinfo', token);
      return data.email || null;
    } catch { return null; }
  }

  /**
   * POST request via node:https.
   */
  _post(url, body) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 15000,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); });
        res.on('end', () => {
          try {
            const data = Buffer.concat(chunks).toString('utf8');
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Google Drive Auth Request Timeout'));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * GET request via node:https with Bearer auth.
   */
  _get(url, token) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); });
        res.on('end', () => {
          try {
            const data = Buffer.concat(chunks).toString('utf8');
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Google Drive API Request Timeout'));
      });
      req.on('error', reject);
      req.end();
    });
  }
}

module.exports = { GDriveAuth };
