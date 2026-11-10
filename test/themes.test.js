import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, readQuestions } from '../game.js';

test('room themes default, validate, and reach every view throughout a game', () => {
  const game = new Game(readQuestions('- text: A question\n  answer: Yes'));
  assert.equal(game.state().theme, 'default');
  for (const invalid of ['unknown', '__proto__', null, undefined]) {
    assert.throws(() => game.setTheme(invalid), /valid theme/);
    assert.equal(game.theme, 'default');
  }
  game.setTheme('christmas');
  const player = game.join('Player');
  const checkViews = () => {
    for (const [id, host] of [[player, false], [null, true], [null, false]]) {
      assert.equal(game.state(id, host).theme, 'christmas');
    }
  };
  checkViews();
  game.setTheme('default');
  assert.equal(game.state().theme, 'default');
  game.setTheme('christmas');
  game.next();
  checkViews();
  assert.throws(() => game.setTheme('default'), /before starting/);
  game.reveal();
  checkViews();
  game.next();
  checkViews();
});
