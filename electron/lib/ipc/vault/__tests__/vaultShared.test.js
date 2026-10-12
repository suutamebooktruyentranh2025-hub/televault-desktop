const test = require('node:test');
const assert = require('node:assert/strict');
const { BrowserWindow } = require('electron');
const { safeSend, safeBroadcast } = require('../vaultShared');

test('safeSend sends IPC message when window and webContents are active', () => {
  let sentChannel = null;
  let sentArgs = null;

  const mockWin = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      isCrashed: () => false,
      send: (channel, ...args) => {
        sentChannel = channel;
        sentArgs = args;
      },
    },
  };

  safeSend(mockWin, 'test:event', { foo: 'bar' });
  assert.equal(sentChannel, 'test:event');
  assert.deepEqual(sentArgs, [{ foo: 'bar' }]);
});

test('safeSend ignores when window is destroyed', () => {
  let called = false;
  const mockWin = {
    isDestroyed: () => true,
    webContents: {
      isDestroyed: () => false,
      send: () => { called = true; },
    },
  };

  safeSend(mockWin, 'test:event');
  assert.equal(called, false);
});

test('safeSend ignores when webContents is destroyed or crashed', () => {
  let called = false;
  const mockWinDestroyedWc = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => true,
      send: () => { called = true; },
    },
  };

  safeSend(mockWinDestroyedWc, 'test:event');
  assert.equal(called, false);

  const mockWinCrashed = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      isCrashed: () => true,
      send: () => { called = true; },
    },
  };

  safeSend(mockWinCrashed, 'test:event');
  assert.equal(called, false);
});

test('safeSend catches "Render frame was disposed before WebFrameMain could be accessed" error gracefully', () => {
  const mockWinDisposed = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      isCrashed: () => false,
      send: () => {
        throw new Error('Render frame was disposed before WebFrameMain could be accessed');
      },
    },
  };

  assert.doesNotThrow(() => {
    safeSend(mockWinDisposed, 'test:event');
  });
});
