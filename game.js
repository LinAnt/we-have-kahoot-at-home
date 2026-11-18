import { randomBytes, randomInt } from 'node:crypto';
import { parse } from 'yaml';
import { themes } from './public/themes.js';
export function readQuestions(source) {
  const rows = parse(source);
  if (!Array.isArray(rows) || !rows.length) throw new Error('Provide a nonempty YAML list of questions.');
  return rows.map((q, i) => {
    const fail = message => { throw new Error(`Question ${i + 1}: ${message}`); };
    if (!q || !q.text || q.answer == null) fail('text and answer are required.');
    if (q.type && !['text', 'multi-answer', 'multiple-choice'].includes(q.type)) fail('unsupported type.');
    let image = null;
    if (q.image != null) {
      if (typeof q.image !== 'string' || !/^\/?assets\/(?:[^/\\?#%\x00-\x1f]+\/)*[^/\\?#%\x00-\x1f]+\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(q.image) || q.image.split('/').some(part => part === '.' || part === '..')) fail('image must be an image path inside assets, such as assets/example.png.');
      image = `/${q.image.replace(/^\//, '')}`;
    }
    let options = null;
    if (q.options != null) {
      if (typeof q.options !== 'object' || Array.isArray(q.options)) fail('options must map letters to answers.');
      options = Object.fromEntries(Object.entries(q.options).map(([k,v]) => [k.toUpperCase(), String(v)]));
      if (Object.keys(options).length < 2 || Object.keys(options).length > 8) fail('provide 2–8 options.');
      if (!(Object.hasOwn(options, String(q.answer).toUpperCase()))) fail('answer must match an option key.');
    }
    const duration = Number(q.duration ?? 30);
    if (!Number.isInteger(duration) || duration < 5 || duration > 300) fail('duration must be 5–300 seconds.');
    return { title: String(q.title || `Question ${i + 1}`), text: String(q.text), image, options, answer: options ? String(q.answer).toUpperCase() : String(q.answer), duration };
  });
}
export const token = () => randomBytes(24).toString('hex');
const normalize = value => String(value).normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
export class Game {
  constructor(questions, code = String(randomInt(100000,1000000))) {
    this.code = code; this.hostToken = token(); this.questions = questions;
    this.theme = 'default';
    this.randomizeAnswers = true;
    this.players = new Map(); this.phase = 'lobby'; this.index = -1; this.deadline = null;
  }
  setTheme(theme) {
    if (!Object.hasOwn(themes, theme)) throw new Error('Choose a valid theme.');
    if (this.phase !== 'lobby') throw new Error('Choose a theme before starting the game.');
    this.theme = theme;
  }
  setRandomizeAnswers(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Choose whether to randomize answer order.');
    if (this.phase !== 'lobby') throw new Error('Choose the answer order before starting the game.');
    this.randomizeAnswers = enabled;
  }
  join(name) {
    name = String(name || '').trim().slice(0,30);
    if (!name) throw new Error('Enter a nickname.');
    if (this.phase !== 'lobby') throw new Error('This game has already started.');
    if ([...this.players.values()].some(p => normalize(p.name) === normalize(name))) throw new Error('That nickname is already taken.');
    if (this.players.size >= 200) throw new Error('This room is full.');
    const id = token(); this.players.set(id, { id, name, score: 0, answer: null, points: 0 }); return id;
  }
  next() {
    if (!['lobby','reveal'].includes(this.phase)) throw new Error('Reveal the answer first.');
    if (!this.players.size) throw new Error('Wait for a player to join.');
    this.index++;
    if (this.index >= this.questions.length) { this.phase = 'finished'; this.deadline = null; return; }
    this.phase = 'question'; this.deadline = Date.now() + this.questions[this.index].duration * 1000;
    for (const p of this.players.values()) {
      p.answer = null; p.points = 0;
      const options = this.questions[this.index].options;
      p.optionKeys = this.randomizeAnswers && options ? Object.keys(options) : null;
      // Shuffle once per player and round, so reconnects keep the same choices.
      if (p.optionKeys) for (let i = p.optionKeys.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [p.optionKeys[i], p.optionKeys[j]] = [p.optionKeys[j], p.optionKeys[i]];
      }
    }
  }
  answer(id, value) {
    const p = this.players.get(id);
    if (!p) throw new Error('Join this room first.');
    if (this.phase !== 'question' || Date.now() >= this.deadline) throw new Error('Answers are closed.');
    if (p.answer !== null) throw new Error('You already answered.');
    const q = this.questions[this.index];
    value = String(value ?? '').trim().slice(0,500);
    if (p.optionKeys) {
      const index = 'ABCDEFGH'.indexOf(value);
      if (value.length !== 1 || index < 0 || index >= p.optionKeys.length) throw new Error('Choose a valid answer.');
      value = p.optionKeys[index];
    } else if (q.options && !Object.hasOwn(q.options, value)) {
      throw new Error('Choose a valid answer.');
    }
    if (!value) throw new Error('Choose a valid answer.');
    p.answer = value;
    p.points = normalize(value) === normalize(q.answer) ? 500 + Math.round(500 * Math.max(0,(this.deadline-Date.now())/(q.duration*1000))) : 0;
    // Scores are applied only on reveal, so players cannot infer the correct answer early.
    if ([...this.players.values()].every(p => p.answer !== null)) this.reveal();
  }
  reveal() {
    if (this.phase !== 'question') throw new Error('No active question.');
    this.phase = 'reveal'; this.deadline = null;
    for (const p of this.players.values()) p.score += p.points;
  }
  state(id, host = false) {
    const q = this.questions[this.index];
    const revealed = ['reveal','finished'].includes(this.phase);
    const me = this.players.get(id);
    const optionKeys = !host && me?.optionKeys;
    const displayAnswer = value => optionKeys && value !== null ? 'ABCDEFGH'[optionKeys.indexOf(value)] : value;
    const options = q?.options && optionKeys
      ? Object.fromEntries(optionKeys.map((key, i) => ['ABCDEFGH'[i], q.options[key]])) : q?.options;
    return { code:this.code, theme:this.theme, phase:this.phase, index:this.index, total:this.questions.length, deadline:this.deadline,
      ...(host ? {randomizeAnswers:this.randomizeAnswers} : {}),
      question: q ? {title:q.title,text:q.text,image:q.image,options,duration:q.duration,...(revealed || host ? {answer:displayAnswer(q.answer)} : {})} : null,
      answered:[...this.players.values()].filter(p=>p.answer !== null).length,
      players:[...this.players.values()].map(p=>({name:p.name,score:p.score})).sort((a,b)=>b.score-a.score),
      me:me ? {name:me.name,score:me.score,submitted:me.answer !== null,...(revealed ? {answer:displayAnswer(me.answer),points:me.points} : {})} : null };
  }
}
