'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateServerUrl } = require('../electron/voice.cjs');

test('voice gateway normalizes secure remote and loopback URLs', () => {
  assert.equal(validateServerUrl('https://voice.example.test/rooms/'), 'https://voice.example.test/rooms');
  assert.equal(validateServerUrl('http://localhost:3080'), 'http://localhost:3080');
  assert.equal(validateServerUrl('http://127.0.0.1:3080'), 'http://127.0.0.1:3080');
});

test('voice gateway rejects insecure or ambiguous server URLs', () => {
  for (const value of [
    '',
    'http://voice.example.test',
    'https://user:password@voice.example.test',
    'https://voice.example.test?token=secret',
    'https://voice.example.test/#fragment',
    'file:///tmp/socket',
  ]) {
    assert.throws(() => validateServerUrl(value), /servidor|dirección/);
  }
});
