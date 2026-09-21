const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const Module = require('node:module');

let opened_url = null;
const original_loader = Module._load;
Module._load = function loadTestModule(module_name, parent_module, is_main) {
  if (module_name === 'electron') {
    return {
      shell: {
        openExternal: async (external_url) => {
          opened_url = external_url;
        },
      },
    };
  }
  return original_loader.call(this, module_name, parent_module, is_main);
};
delete require.cache[require.resolve('../gdriveAuth')];
const { GDriveAuth } = require('../gdriveAuth');
Module._load = original_loader;

function createAuth() {
  const stored_values = new Map([
    ['client_id', 'client-id'],
    ['client_secret', 'client-secret'],
  ]);
  const mock_db = {
    gdriveTokenGet: (token_key) => stored_values.get(token_key) || null,
    gdriveTokenSet: (token_key, token_value) => stored_values.set(token_key, token_value),
    gdriveTokenDelete: (token_key) => stored_values.delete(token_key),
    gdriveTokensClear: () => stored_values.clear(),
  };
  return new GDriveAuth({ db: mock_db });
}

function requestCallback(callback_port, callback_query) {
  return new Promise((resolve, reject) => {
    const callback_request = http.get(
      `http://127.0.0.1:${callback_port}/?${callback_query}`,
      (callback_response) => {
        callback_response.resume();
        callback_response.on('end', () => resolve(callback_response.statusCode));
      },
    );
    callback_request.on('error', reject);
  });
}

test('authorize stores state and includes it with readonly scope', async () => {
  opened_url = null;
  const drive_auth = createAuth();
  let pending_state = null;
  drive_auth._listenForCode = (expected_state) => {
    pending_state = expected_state;
    return Promise.resolve({ port: 4567, code: Promise.resolve('auth-code') });
  };
  drive_auth._exchangeCode = async () => ({
    ok: true,
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expiry: '123',
  });
  drive_auth._fetchEmail = async () => 'user@example.com';

  const auth_result = await drive_auth.authorize();
  const authorize_url = new URL(opened_url);

  assert.equal(auth_result.ok, true);
  assert.match(pending_state, /^[a-f0-9]{32}$/);
  assert.equal(authorize_url.searchParams.get('state'), pending_state);
  assert.equal(
    authorize_url.searchParams.get('scope'),
    'https://www.googleapis.com/auth/drive.readonly',
  );
  assert.equal(drive_auth._active_authorization, false);
});

test('OAuth callback rejects mismatched state', async () => {
  const drive_auth = createAuth();
  const { port: callback_port, code: pending_code } = await drive_auth._listenForCode(
    'expected-state',
  );
  const rejection_assertion = assert.rejects(pending_code, /OAuth state mismatch/);

  const status_code = await requestCallback(
    callback_port,
    'code=auth-code&state=wrong-state',
  );

  assert.equal(status_code, 400);
  await rejection_assertion;
});

test('OAuth callback accepts matching state', async () => {
  const drive_auth = createAuth();
  const { port: callback_port, code: pending_code } = await drive_auth._listenForCode(
    'expected-state',
  );

  const status_code = await requestCallback(
    callback_port,
    'code=auth-code&state=expected-state',
  );

  assert.equal(status_code, 200);
  assert.equal(await pending_code, 'auth-code');
});

test('authorize rejects an overlapping OAuth flow', async () => {
  const drive_auth = createAuth();
  const code_resolvers = [];
  let listener_count = 0;
  drive_auth._listenForCode = () => {
    listener_count += 1;
    return Promise.resolve({
      port: 4567,
      code: new Promise((resolve) => code_resolvers.push(resolve)),
    });
  };
  drive_auth._exchangeCode = async () => ({
    ok: true,
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expiry: '123',
  });
  drive_auth._fetchEmail = async () => 'user@example.com';

  const first_authorization = drive_auth.authorize();
  await new Promise((resolve) => setImmediate(resolve));
  const second_authorization = drive_auth.authorize();
  await new Promise((resolve) => setImmediate(resolve));

  code_resolvers.forEach((resolve) => resolve('auth-code'));
  const [first_result, second_result] = await Promise.all([
    first_authorization,
    second_authorization,
  ]);

  assert.equal(first_result.ok, true);
  assert.equal(second_result.ok, false);
  assert.match(second_result.error, /already in progress/i);
  assert.equal(listener_count, 1);
});

test('authorize includes prompt=select_account consent in auth URL and notifies onAuthUrl', async () => {
  opened_url = null;
  const emitted_urls = [];
  const stored_values = new Map([
    ['client_id', 'client-id-test'],
    ['client_secret', 'client-secret-test'],
  ]);
  const mock_db = {
    gdriveTokenGet: (k) => stored_values.get(k) || null,
    gdriveTokenSet: (k, v) => stored_values.set(k, v),
  };
  const drive_auth = new GDriveAuth({
    db: mock_db,
    onAuthUrl: (url) => emitted_urls.push(url),
  });

  drive_auth._listenForCode = () => Promise.resolve({ port: 9876, code: Promise.resolve('code-123') });
  drive_auth._exchangeCode = async () => ({
    ok: true,
    access_token: 'at-1',
    refresh_token: 'rt-1',
    expiry: '99999',
  });
  drive_auth._fetchEmail = async () => 'test@example.com';

  const res = await drive_auth.authorize();
  assert.equal(res.ok, true);

  const authUrl = new URL(opened_url);
  assert.equal(authUrl.searchParams.get('prompt'), 'select_account consent');
  assert.equal(authUrl.searchParams.get('client_id'), 'client-id-test');
  // onAuthUrl was called with the auth URL, and then null upon completion
  assert.equal(emitted_urls.length, 2);
  assert.equal(emitted_urls[0], opened_url);
  assert.equal(emitted_urls[1], null);
  assert.equal(drive_auth.currentAuthUrl, null);
});

test('cancelAuthorization aborts in-progress authorization flow', async () => {
  const emitted_urls = [];
  const stored_values = new Map([
    ['client_id', 'cid'],
    ['client_secret', 'csec'],
  ]);
  const mock_db = {
    gdriveTokenGet: (k) => stored_values.get(k) || null,
    gdriveTokenSet: (k, v) => stored_values.set(k, v),
  };
  const drive_auth = new GDriveAuth({
    db: mock_db,
    onAuthUrl: (url) => emitted_urls.push(url),
  });

  drive_auth._listenForCode = () => {
    return Promise.resolve({
      port: 8888,
      code: new Promise((_resolve, reject) => {
        drive_auth._pending_auth = { reject };
      }),
    });
  };

  const auth_promise = drive_auth.authorize();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(drive_auth._active_authorization, true);
  assert.ok(drive_auth.currentAuthUrl);

  drive_auth.cancelAuthorization('User clicked cancel');
  const result = await auth_promise;
  assert.equal(result.ok, false);
  assert.match(result.error, /User clicked cancel/);
  assert.equal(drive_auth._active_authorization, false);
  assert.equal(drive_auth.currentAuthUrl, null);
});

test('authorize with force: true cancels pending authorization and starts a new one', async () => {
  const drive_auth = createAuth();
  let first_aborted = false;

  let call_idx = 0;
  drive_auth._listenForCode = () => {
    call_idx += 1;
    const current_call = call_idx;
    return Promise.resolve({
      port: 7000 + current_call,
      code: new Promise((resolve, reject) => {
        if (current_call === 1) {
          drive_auth._pending_auth = { reject };
        } else {
          resolve('auth-code-second');
        }
      }),
    });
  };

  drive_auth._exchangeCode = async (code) => ({
    ok: true,
    access_token: `access-${code}`,
    refresh_token: 'rt',
    expiry: '123',
  });
  drive_auth._fetchEmail = async () => 'user@example.com';

  const first_auth = drive_auth.authorize().then((r) => {
    if (!r.ok) first_aborted = true;
    return r;
  });
  await new Promise((resolve) => setImmediate(resolve));

  // Force re-auth
  const second_auth = await drive_auth.authorize({ force: true });
  await first_auth;

  assert.equal(first_aborted, true);
  assert.equal(second_auth.ok, true);
});

test('disconnect preserves client credentials while clearing session tokens', () => {
  const drive_auth = createAuth();
  drive_auth.db.gdriveTokenSet('access_token', 'token-123');
  drive_auth.db.gdriveTokenSet('refresh_token', 'refresh-456');
  drive_auth.db.gdriveTokenSet('expiry', '9999999');
  drive_auth.db.gdriveTokenSet('email', 'user@example.com');

  assert.equal(drive_auth.isConnected(), true);
  assert.equal(drive_auth.clientId, 'client-id');
  assert.equal(drive_auth.clientSecret, 'client-secret');

  // Disconnect with default keepCredentials: true
  drive_auth.disconnect();

  assert.equal(drive_auth.isConnected(), false);
  assert.equal(drive_auth.accessToken, null);
  assert.equal(drive_auth.refreshToken, null);
  assert.equal(drive_auth.expiry, null);
  assert.equal(drive_auth.email, null);
  // Credentials remain preserved
  assert.equal(drive_auth.clientId, 'client-id');
  assert.equal(drive_auth.clientSecret, 'client-secret');
});

test('disconnect({ keepCredentials: false }) clears all tokens including credentials', () => {
  const drive_auth = createAuth();
  drive_auth.db.gdriveTokenSet('access_token', 'token-123');
  drive_auth.db.gdriveTokenSet('refresh_token', 'refresh-456');

  drive_auth.disconnect({ keepCredentials: false });

  assert.equal(drive_auth.isConnected(), false);
  assert.equal(drive_auth.clientId, null);
  assert.equal(drive_auth.clientSecret, null);
});

test('saveCredentials updates credentials or deletes when empty', () => {
  const drive_auth = createAuth();

  drive_auth.saveCredentials('new-cid', 'new-secret');
  assert.equal(drive_auth.clientId, 'new-cid');
  assert.equal(drive_auth.clientSecret, 'new-secret');

  drive_auth.saveCredentials('', '');
  assert.equal(drive_auth.clientId, null);
  assert.equal(drive_auth.clientSecret, null);
});


