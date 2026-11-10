import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game, readQuestions } from './game.js';
const root = dirname(fileURLToPath(import.meta.url));
const rooms = new Map();
const clients = new Set();
const broadcast = game => { for (const c of clients) if(c.code === game.code) c.res.write(`data: ${JSON.stringify(game.state(c.player,c.host))}\n\n`); };
const send = (res,status,data) => { res.writeHead(status,{'Content-Type':'application/json'}); res.end(JSON.stringify(data)); };
const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  try {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname === '/events') {
      const game = rooms.get(url.searchParams.get('code'));
      if (!game) return send(res,404,{error:'Room not found.'});
      const c = {res,code:game.code,player:url.searchParams.get('player'),host:url.searchParams.get('host') === game.hostToken};
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
      clients.add(c); res.write(`data: ${JSON.stringify(game.state(c.player,c.host))}\n\n`);
      req.on('close',()=>clients.delete(c)); return;
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw)>262144) return send(res,413,{error:'Request too large.'}); }
      const body = JSON.parse(raw || '{}');
      if(url.pathname === '/api/create') {
        if(rooms.size >= 100) return send(res,429,{error:'Room limit reached. Restart the server to clear old rooms.'});
        const questions = readQuestions(body.yaml || await readFile(resolve(process.env.QUESTIONS_FILE || resolve(root,'questions.yaml')),'utf8'));
        let game; do { game = new Game(questions); } while(rooms.has(game.code));
        rooms.set(game.code,game); return send(res,200,{code:game.code,hostToken:game.hostToken});
      }
      const game = rooms.get(String(body.code));
      if(!game) return send(res,404,{error:'Room not found. Check the six-digit code.'});
      let result = {};
      if(url.pathname === '/api/join') result = {playerToken:game.join(body.name)};
      else if(url.pathname === '/api/answer') game.answer(body.playerToken,body.answer);
      else if(['/api/next','/api/reveal'].includes(url.pathname)) {
        if(body.hostToken !== game.hostToken) return send(res,403,{error:'Host access required.'});
        if(url.pathname === '/api/next') game.next(); else game.reveal();
      } else return send(res,404,{error:'Unknown action.'});
      broadcast(game); return send(res,200,result);
    }
    const files = {'/':'index.html','/host':'index.html','/play':'index.html','/screen':'index.html','/app.js':'app.js','/style.css':'style.css'};
    if(req.method !== 'GET' || !files[url.pathname]) return send(res,404,{error:'Not found.'});
    res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html');
    res.end(await readFile(resolve(root,'public',files[url.pathname])));
  } catch(error) { send(res,400,{error:error.message}); }
});
setInterval(()=>{ for(const game of rooms.values()) if(game.phase==='question' && Date.now()>=game.deadline) {game.reveal(); broadcast(game);} },200).unref();
setInterval(()=>{for(const c of clients)c.res.write(': heartbeat\n\n');},15000).unref();
server.listen(Number(process.env.PORT || 3000),process.env.HOST || '0.0.0.0',()=>console.log(`Quiz server listening on port ${process.env.PORT || 3000}`));
