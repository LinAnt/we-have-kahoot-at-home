import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Game, readQuestions } from '../game.js';
const source = '- title: Test\n  type: text\n  text: Pick one\n  options:\n    a: Yes\n    B: No\n  answer: A';
test('supplied questions load, including text questions with options',async()=>{
 const questions=readQuestions(await readFile(new URL('../questions.yaml',import.meta.url),'utf8'));
 assert.equal(questions.length,15); assert.equal(questions.at(-1).options.C,'~31 tbps');
});
test('choice game keeps answers and scores secret until reveal, scores once, and finishes',()=>{
 const game=new Game(readQuestions(source)); const a=game.join('Alice'); const b=game.join('Bob');
 assert.throws(()=>game.join(' alice '),/taken/);game.next();
 assert.throws(()=>game.join('Late'),/started/);
 assert.equal(game.state(a).question.answer,undefined);assert.equal(game.state(null,true).question.answer,'A');
 const choice = (id, text) => Object.entries(game.state(id).question.options).find(([, value]) => value === text)[0];
 game.answer(a,choice(a,'Yes'));assert.equal(game.state(a).players[0].score,0);assert.equal(game.state(a).me.points,undefined);
 assert.throws(()=>game.answer(a,'B'),/already/);game.answer(b,choice(b,'No'));
 assert.equal(game.phase,'reveal');assert.ok(game.players.get(a).score>=500);assert.equal(game.players.get(b).score,0);
 assert.throws(()=>game.reveal(),/active/);game.next();assert.equal(game.phase,'finished');
});
test('free text normalization and expired deadlines',()=>{
 const game=new Game(readQuestions('- text: Name\n  answer: Hello World'));
 const p=game.join('Player');game.next();game.answer(p,'  HELLO   world ');assert.ok(game.players.get(p).score>=500);
 const late=new Game(readQuestions(source));const id=late.join('Late');late.next();late.deadline=Date.now()-1;
 assert.throws(()=>late.answer(id,'A'),/closed/);late.reveal();assert.equal(late.players.get(id).score,0);
});
test('player choices stay stable and translate local letters for scoring and reveal',()=>{
 const questions=readQuestions(source);
 const game=new Game([...questions,...questions]);
 const a=game.join('Alice'), b=game.join('Bob');game.next();
 assert.notEqual(game.players.get(a).optionKeys,game.players.get(b).optionKeys);
 for (const id of [a,b]) {
  assert.deepEqual([...game.players.get(id).optionKeys].sort(),['A','B']);
  assert.deepEqual(game.state(id).question.options,game.state(id).question.options);
 }
 // Exercise different permutations deterministically, regardless of random output.
 game.players.get(a).optionKeys=['B','A'];game.players.get(b).optionKeys=['A','B'];
 assert.deepEqual(game.state(a).question.options,{A:'No',B:'Yes'});
 assert.deepEqual(game.state(b).question.options,{A:'Yes',B:'No'});
 assert.deepEqual(game.state(null).question.options,questions[0].options);
 assert.deepEqual(game.state(null,true).question.options,questions[0].options);
 assert.equal(game.state(a).question.answer,undefined);
 assert.throws(()=>game.answer(a,'AB'),/valid/);
 assert.throws(()=>game.answer(a,'C'),/valid/);
 game.answer(a,'B');game.answer(b,'B');
 assert.ok(game.state(a).me.points>=500);assert.equal(game.state(b).me.points,0);
 assert.equal(game.state(a).question.answer,'B');assert.equal(game.state(b).question.answer,'A');
 assert.equal(game.state(a).me.answer,'B');assert.equal(game.state(b).me.answer,'B');
 assert.deepEqual(game.state(a).question.options,{A:'No',B:'Yes'});
 assert.deepEqual(questions[0].options,{A:'Yes',B:'No'});
 const previous=game.players.get(a).optionKeys;game.next();
 assert.notEqual(game.players.get(a).optionKeys,previous);
 assert.equal(game.state(a).me.submitted,false);
});
test('invalid YAML and invalid options are rejected',()=>{
 for(const input of ['{}','[]','- text: Missing answer','- text: Invalid\n  answer: Z\n  options:\n    A: one\n    B: two','- text: Duration\n  answer: ok\n  duration: -1']) assert.throws(()=>readQuestions(input));
});
test('optional images are normalized and shared with every view through reveal',()=>{
 for (const path of ['assets/photo.png', '/assets/round one/photo.JPG']) {
  const game=new Game(readQuestions(`- text: Identify this\n  answer: Cat\n  image: ${path}`));
  const player=game.join('Player');game.next();
  for (const [id, host] of [[player,false],[null,true],[null,false]]) {
   assert.equal(game.state(id,host).question.image,`/${path.replace(/^\//,'')}`);
  }
  game.reveal();assert.equal(game.state(player).question.image,`/${path.replace(/^\//,'')}`);
 }
 assert.equal(readQuestions(source)[0].image,null);
});
test('image paths must point to supported images inside assets',()=>{
 for (const image of ['https://example.com/a.png','photo.png','assets/../photo.png','assets/nested/../../photo.png','assets/a.js','assets/a.png?x=1','assets/%2e%2e/a.png','assets/./a.png',42,'']) {
  assert.throws(()=>readQuestions(`- text: Image\n  answer: ok\n  image: ${JSON.stringify(image)}`),/image must/);
 }
});
