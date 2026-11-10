import { themes } from './themes.js';
const app = document.querySelector('#app');
const role = location.pathname.slice(1);
const params = new URLSearchParams(location.search);
let code = params.get('code') || '', state, stream;
let hostToken = sessionStorage.getItem(`host:${code}`) || '';
let playerToken = localStorage.getItem(`player:${code}`) || '';
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const notice = message => {document.querySelector('#notice').textContent=message; setTimeout(()=>document.querySelector('#notice').textContent='',5000);};
async function api(action,data={}) {
  const response = await fetch(`/api/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,hostToken,playerToken,...data})});
  const result = await response.json(); if(!response.ok) throw new Error(result.error); return result;
}
function applyTheme(theme) {
  const selected = Object.hasOwn(themes, theme) ? theme : 'default';
  document.documentElement.dataset.theme = selected;
  document.querySelector('meta[name="theme-color"]').content = themes[selected].color;
}
const themePicker = (selected = 'default') => `<label class="theme-picker">Theme<select id="theme" name="theme">${Object.entries(themes).map(([id, theme]) => `<option value="${id}" ${id===selected?'selected':''}>${theme.name}</option>`).join('')}</select></label>`;
const ranking = () => `<div class="ranking">${state.players.map((p,i)=>`<div><span class="rank">${i+1}</span><strong>${esc(p.name)}</strong><span>${p.score.toLocaleString()} <small>pts</small></span></div>`).join('') || '<p>The room is waiting for its first challenger.</p>'}</div>`;
function connect() {
  stream?.close();
  stream = new EventSource(`/events?${new URLSearchParams({code,...(role==='host'?{host:hostToken}:{}),...(role==='play'?{player:playerToken}:{})})}`);
  stream.onmessage = event => {state=JSON.parse(event.data);document.querySelector('#connection').textContent='● CONNECTED';render();};
  stream.onerror = () => {document.querySelector('#connection').textContent='RECONNECTING…';};
}
function landing() {
  app.innerHTML = `<section class="hero"><div class="eyebrow">GAME NIGHT, UPGRADED</div><h1>Big questions.<br><span>Bigger bragging rights.</span></h1><p>Bring your people together for a live quiz.<br>Your questions, your server, everyone's game.</p><div class="choices"><a href="/host" class="choice purple"><span class="symbol">✦</span><h2>Run the show</h2><p>Create a room, load your questions,<br>and let the competition begin.</p><span class="cta">Host a game <b>↗</b></span></a><a href="/play" class="choice green"><span class="symbol">↗</span><h2>Got the answers?</h2><p>Grab your room code and a nickname.<br>You're one tap away from playing.</p><span class="cta">Join a game <b>↗</b></span></a></div><a class="screen-link" href="/screen">▣ &nbsp; Setting up the room? Open the big screen →</a></section><div class="steps"><span><b>01</b> One room code</span><span><b>02</b> Everyone plays live</span><span><b>03</b> One champion</span></div>`;
}
function setup() {
  if(role==='host') app.innerHTML = `<section class="setup"><div class="eyebrow">THE HOST'S SEAT</div><h1>Let's make it<br><span>a game night.</span></h1><p>Use the server's questions or bring your own YAML file.</p><form id="create">${themePicker()}<label class="upload">↥ &nbsp; Load a question file<input type="file" id="yaml" accept=".yaml,.yml"><small id="filename">Optional · defaults to questions.yaml</small></label><button>Create game <span>→</span></button></form><p class="muted">Players join on their phones. Put the big screen on your projector.</p></section>`;
  else app.innerHTML = `<section class="setup"><div class="eyebrow">${role==='screen'?'THE WHOLE ROOM IS WATCHING':'READY WHEN YOU ARE'}</div><h1>${role==='screen'?'Take it to the':'You’re in the'}<br><span>${role==='screen'?'big screen.':'right place.'}</span></h1><form id="join"><label>Room code<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000" value="${esc(code)}" required></label>${role==='screen'?'':'<label>Your nickname<input name="name" maxlength="30" placeholder="The one to beat" required autocomplete="nickname"></label>'}<button>${role==='screen'?'Open display':'Join the game'} <span>→</span></button></form></section>`;
  document.querySelector('#theme')?.addEventListener('change', e => applyTheme(e.target.value));
  document.querySelector('#yaml')?.addEventListener('change',e=>document.querySelector('#filename').textContent=e.target.files[0]?.name || 'Optional · defaults to questions.yaml');
  document.querySelector('#create')?.addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const file=document.querySelector('#yaml').files[0];const result=await api('create',{theme:document.querySelector('#theme').value,...(file?{yaml:await file.text()}:{})});code=result.code;hostToken=result.hostToken;sessionStorage.setItem(`host:${code}`,hostToken);history.replaceState(null,'',`/host?code=${code}`);connect();}catch(err){notice(err.message);button.disabled=false;}});
  document.querySelector('#join')?.addEventListener('submit',async e=>{e.preventDefault();const data=new FormData(e.target);code=data.get('code');try{if(role==='play'){const result=await api('join',{name:data.get('name')});playerToken=result.playerToken;localStorage.setItem(`player:${code}`,playerToken);}else{const response=await fetch(`/events?code=${encodeURIComponent(code)}`);if(!response.ok)throw new Error('Room not found.');await response.body.cancel();}history.replaceState(null,'',`/${role}?code=${code}`);connect();}catch(err){notice(err.message);}});
}
function render() {
  applyTheme(state.theme);
  const host=role==='host', player=role==='play';
  if(player && !state.me){stream.close();playerToken='';setup();return;}
  const q=state.question;
  let content='';
  if(state.phase==='lobby') content=`<section class="lobby"><div class="eyebrow">${player?'YOU’RE ON THE LIST':'THE MORE, THE MERRIER'}</div><h1>${player?`Hey, ${esc(state.me.name)}.`:'Gather your crowd.'}</h1><p>${player?'Keep this screen open. Your host will start the game.':`Join at <strong>${esc(location.host)}/play</strong>`}</p><div class="room-code"><small>ROOM CODE</small>${code}</div><div class="section-label">${state.players.length} PLAYER${state.players.length===1?'':'S'} IN THE ROOM <span class="pulse">●</span></div><div class="names">${state.players.map(p=>`<span>${esc(p.name)}</span>`).join('') || '<p>Waiting for the first player…</p>'}</div>${host?`${themePicker(state.theme)}<div class="host-actions"><button data-action="next" ${state.players.length?'':'disabled'}>Start game →</button><a class="secondary" href="/screen?code=${code}" target="_blank" rel="noopener">Open big screen ↗</a></div><p class="muted">${state.total} questions loaded · Everyone ready?</p>`:''}</section>`;
  else if(state.phase==='finished') content=`<section class="lobby"><div class="eyebrow">THAT'S A WRAP</div><div class="trophy">✦</div><h1>${esc(state.players[0]?.name || 'Everyone')} wins!</h1><p>Good questions. Great company. One more round?</p>${ranking()}<a class="secondary" href="/">Back to home →</a></section>`;
  else {
    const reveal=state.phase==='reveal';
    content=`<section class="game"><div class="game-meta"><span>QUESTION ${state.index+1} <span class="muted">/ ${state.total}</span></span><span>${state.answered} / ${state.players.length} answered</span><span id="timer">${reveal?'ROUND COMPLETE':''}</span></div><div class="time-track"><div id="timebar"></div></div><div class="eyebrow">${esc(q.title)}</div><h1 class="question">${esc(q.text)}</h1>${q.image?`<img class="question-image" src="${esc(q.image)}" alt="Image for ${esc(q.title)}">`:""}${q.options?`<div class="answers">${Object.entries(q.options).map(([key,value],i)=>`<${player&&!reveal&&!state.me.submitted?'button':'div'} class="answer color-${i%4} ${reveal&&key===q.answer?'correct':''}" ${player&&!reveal&&!state.me.submitted?`data-answer="${esc(key)}"`:''}><b>${esc(key)}</b><span>${esc(value)}</span>${reveal&&key===q.answer?'<strong>✓</strong>':''}</${player&&!reveal&&!state.me.submitted?'button':'div'}>`).join('')}</div>`: player&&!reveal&&!state.me.submitted?'<form id="text-answer"><label>Your answer<input name="answer" maxlength="500" required autocomplete="off" placeholder="Type your answer…"></label><button>Lock it in →</button></form>':''}
    ${player&&!reveal?`<p class="status">${state.me.submitted?'✓ Answer locked in. Eyes on the big screen!':'Trust your instincts. Lock in your answer.'}</p>`:''}
    ${reveal?`<div class="result"><small>CORRECT ANSWER</small><h2>${esc(q.options?q.options[q.answer]:q.answer)}</h2>${player?`<p>${state.me.points?`Nice one! +${state.me.points} points`:'No points this round.'} · Total ${state.me.score}</p>`:''}</div>${ranking()}`:''}
    ${host?`<div class="host-actions"><button data-action="${reveal?'next':'reveal'}">${reveal?(state.index+1===state.total?'Show final results':'Next question'):'Reveal answer'} →</button></div>`:''}</section>`;
  }
  app.innerHTML=content;
  document.querySelector('#theme')?.addEventListener('change', async e => {
    e.target.disabled = true;
    try { await api('theme', {theme:e.target.value}); }
    catch (err) { notice(err.message); render(); }
  });
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>api(b.dataset.action).catch(e=>notice(e.message)));
  document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>submit(b.dataset.answer));
  document.querySelector('#text-answer')?.addEventListener('submit',e=>{e.preventDefault();submit(new FormData(e.target).get('answer'));});
  tick();
}
async function submit(answer){try{await api('answer',{answer});}catch(e){notice(e.message);}}
function tick(){if(!state?.deadline)return;const remaining=Math.max(0,state.deadline-Date.now());const timer=document.querySelector('#timer');if(timer)timer.textContent=`${Math.ceil(remaining/1000)}s`;const bar=document.querySelector('#timebar');if(bar)bar.style.width=`${remaining/(state.question.duration*1000)*100}%`;}
setInterval(tick,100);
if(!role)landing();else if(!['host','play','screen'].includes(role))landing();else if(code&&(role==='screen'||role==='host'&&hostToken||role==='play'&&playerToken))connect();else setup();
