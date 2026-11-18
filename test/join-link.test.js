import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { joinLink } from '../join-link.js';

test('join links use the public origin and the current room code', () => {
  assert.equal(joinLink(undefined, '123456'), null);
  assert.equal(joinLink(' ', '123456'), null);
  assert.equal(joinLink('https://quiz.example:8443/old?other=yes#fragment', '123456'),
    'https://quiz.example:8443/play?code=123456');
  for (const url of ['bad', 'javascript:alert(1)', 'ftp://example.com', 'https://user:secret@example.com']) {
    assert.throws(() => joinLink(url, '123456'));
  }
});

for (const configured of [false, true]) {
  test(`lobby QR endpoint and live state with PUBLIC_URL ${configured ? 'set' : 'unset'}`, {timeout:15000}, async t => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: new URL('..', import.meta.url),
      env: {...process.env, HOST:'127.0.0.1', PORT:'0', PUBLIC_URL:configured ? 'https://quiz.example.com' : ''},
      stdio:['ignore','pipe','pipe'],
    });
    t.after(async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    });
    const port = await new Promise((resolve, reject) => {
      child.stdout.on('data', data => {
        const match = data.toString().match(/port (\d+)/);
        if (match) resolve(match[1]);
      });
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Server exited before listening')));
    });
    const base = `http://127.0.0.1:${port}`;
    const post = async (action, data) => (await fetch(`${base}/api/${action}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data),
    })).json();
    const room = await post('create', {yaml:'- text: Test\n  answer: Yes'});
    const events = await fetch(`${base}/events?code=${room.code}`);
    const reader = events.body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    const state = JSON.parse(first.split('\n')[0].slice(6));
    await reader.cancel();
    assert.equal(state.joinUrl, configured ? `https://quiz.example.com/play?code=${room.code}` : null);
    const qr = await fetch(`${base}/api/join-qr?code=${room.code}`);
    assert.equal(qr.status, configured ? 200 : 404);
    if (configured) {
      assert.equal(qr.headers.get('content-type'), 'image/svg+xml');
      assert.match(await qr.text(), /<svg/);
    }
    assert.equal((await fetch(`${base}/api/join-qr?code=missing`)).status, 404);
    await post('join', {code:room.code, name:'Player'});
    await post('next', room);
    assert.equal((await fetch(`${base}/api/join-qr?code=${room.code}`)).status, 404);
  });
}
