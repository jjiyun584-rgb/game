'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {companies,news,rates,explanation,totalRounds,introNews}=require('./game-data');
const PORT=Number(process.env.PORT||3000),DB=process.env.DATA_FILE||path.join(__dirname,'rooms.json');
let rooms={};try{rooms=JSON.parse(fs.readFileSync(DB,'utf8'));}catch{}
// Normalize rooms saved by an older 10-company version to the current eight companies.
const legacyKeep=[0,1,2,3,6,7,8,9];
let changed=false;
for(const room of Object.values(rooms)){
 if(!Array.isArray(room.prices)||room.prices.length!==10)continue;
 const oldPrices=room.prices;
 for(const student of Object.values(room.students||{})){
   if(Array.isArray(student.holdings)&&student.holdings.length===10){
     // Convert the two removed positions to cash at their last recorded prices.
     student.cash+=(student.holdings[4]||0)*oldPrices[4]+(student.holdings[5]||0)*oldPrices[5];
     student.holdings=legacyKeep.map(i=>student.holdings[i]);
   }
   if(Array.isArray(student.transactions)){
     student.transactions=student.transactions.filter(t=>!['sdi','bio','biologics','samsung-sdi','samsung-bio'].includes(String(t.company||'').toLowerCase()));
   }
 }
 room.prices=legacyKeep.map(i=>oldPrices[i]);
 if(Array.isArray(room.history))room.history=room.history.map(h=>h.length===10?legacyKeep.map(i=>h[i]):h);
 if(Array.isArray(room.lastResults)&&room.lastResults.length===10)room.lastResults=legacyKeep.map(i=>room.lastResults[i]);
 changed=true;
}
if(changed){const tmp=DB+'.tmp';fs.writeFileSync(tmp,JSON.stringify(rooms));fs.renameSync(tmp,DB);}
const token=()=>crypto.randomBytes(24).toString('hex');
const persist=()=>{const temp=DB+'.tmp';fs.writeFileSync(temp,JSON.stringify(rooms));fs.renameSync(temp,DB);};
const err=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
const money=n=>Number.isSafeInteger(n)&&n>=0;
function prices(room){return companies.map((c,i)=>room.prices[i]);}
function ranking(room){let a=Object.values(room.students).map(s=>({name:s.name,cash:s.cash,assets:s.cash+s.holdings.reduce((v,n,i)=>v+n*room.prices[i],0),holdings:s.holdings,done:s.done})).sort((x,y)=>y.assets-x.assets||x.name.localeCompare(y.name,'ko'));let last=null,rank=0;return a.map((s,i)=>{if(s.assets!==last){rank=i+1;last=s.assets;}return {...s,rank};});}
function studentView(room,s){return {role:'student',code:room.code,status:room.status,round:room.round,totalRounds,news:room.round?news[room.round-1]:introNews,companies,prices:prices(room),history:room.history,student:{name:s.name,cash:s.cash,holdings:s.holdings,done:s.done,transactions:s.transactions.slice(-30)},members:Object.keys(room.students).length,completed:Object.values(room.students).filter(x=>x.done).length,results:room.status==='results'||room.status==='finished'?room.lastResults:null};}
function teacherView(room){return {role:'teacher',code:room.code,status:room.status,round:room.round,totalRounds,news:room.round?news[room.round-1]:introNews,companies,prices:prices(room),history:room.history,members:Object.values(room.students).map(s=>({name:s.name,done:s.done})),completed:Object.values(room.students).filter(x=>x.done).length,results:room.lastResults,rankingVisible:room.rankingVisible,ranking:room.rankingVisible||room.finalPublished?ranking(room).map(x=>({name:x.name,assets:x.assets,rank:x.rank})):null,finalPublished:room.finalPublished};}
function getRoom(code){const room=rooms[String(code||'').trim().toUpperCase()];if(!room)err('게임방을 찾을 수 없어요.',404);return room;}
function authenticate(body){const room=getRoom(body.code);if(body.teacherToken){if(room.teacherToken!==body.teacherToken)err('선생님 인증에 실패했어요.',403);return {room,teacher:true};}const name=String(body.name||'').trim();const s=room.students[name];if(!s)err('등록되지 않은 학생 이름이에요.',403);return {room,s,teacher:false};}
function teacher(body){const a=authenticate(body);if(!a.teacher)err('선생님만 사용할 수 있어요.',403);return a.room;}
function student(body){const a=authenticate(body);if(a.teacher)err('학생만 사용할 수 있어요.',403);return a;}
function results(room){return companies.map((c,i)=>({id:c.id,name:c.name,old:room.prices[i],rate:rates[room.round-1][i],next:Math.round(room.prices[i]*(100+rates[room.round-1][i])/100),...explanation(room.round,i)}));}
function api(route,b){if(route==='/api/create'){
 let code;do{code=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(rooms[code]);const teacherToken=token();rooms[code]={code,teacherToken,status:'lobby',round:0,prices:companies.map(c=>c.price),history:[companies.map(c=>c.price)],students:{},rankingVisible:false,finalPublished:false,lastResults:null};persist();return {code,teacherToken,view:teacherView(rooms[code])};}
 if(route==='/api/join'){
 const room=getRoom(b.code),name=String(b.name||'').trim().replace(/\s+/g,' ');if(!name||name.length>20)err('이름을 1~20자로 입력해 주세요.');if(!room.students[name]){if(room.status!=='lobby')err('1라운드 시작 후에는 새로 입장할 수 없어요.');if(Object.keys(room.students).length>=10)err('게임방 정원은 10명이에요.');if(Object.keys(room.students).some(n=>n.toLocaleLowerCase('ko')===name.toLocaleLowerCase('ko')))err('이미 사용 중인 이름이에요.');room.students[name]={name,cash:1000000,holdings:companies.map(()=>0),done:false,transactions:[],txIds:[]};persist();}return {code:room.code,name,view:studentView(room,room.students[name])};}
 if(route==='/api/state'){const a=authenticate(b);return a.teacher?teacherView(a.room):studentView(a.room,a.s);}
 if(route==='/api/trade'){
 const {room,s}=student(b);if(room.status!=='trading'||s.done)err('현재는 거래할 수 없어요.');const idx=companies.findIndex(c=>c.id===b.company);if(idx<0)err('기업을 선택해 주세요.');const qty=Number(b.quantity);if(!Number.isSafeInteger(qty)||qty<1||qty>100000)err('수량은 1 이상의 정수여야 해요.');if(!['buy','sell'].includes(b.side))err('매수 또는 매도를 선택해 주세요.');const txid=String(b.txid||'');if(!/^[a-zA-Z0-9_-]{8,100}$/.test(txid))err('거래 요청 번호가 올바르지 않아요.');if(s.txIds.includes(txid))return studentView(room,s);
 const cost=room.prices[idx]*qty;if(!money(cost))err('거래 금액이 너무 커요.');if(b.side==='buy'){if(s.cash<cost)err('현금이 부족해요.');s.cash-=cost;s.holdings[idx]+=qty;}else{if(s.holdings[idx]<qty)err('보유 주식이 부족해요.');s.cash+=cost;s.holdings[idx]-=qty;}s.txIds.push(txid);s.transactions.push({round:room.round,side:b.side,company:b.company,quantity:qty,price:room.prices[idx]});persist();return studentView(room,s);}
 if(route==='/api/done'){const {room,s}=student(b);if(room.status!=='trading')err('투자 가능한 라운드가 아니에요.');s.done=true;persist();return studentView(room,s);}
 if(route==='/api/undone'){const {room,s}=student(b);if(room.status!=='trading')err('라운드가 종료되어 취소할 수 없어요.');s.done=false;persist();return studentView(room,s);}
 if(route==='/api/start'){const room=teacher(b);if(room.status!=='lobby')err('이미 시작한 게임이에요.');if(!Object.keys(room.students).length)err('학생이 한 명 이상 입장해야 해요.');room.round=1;room.status='trading';persist();return teacherView(room);}
 if(route==='/api/end'){const room=teacher(b);if(room.status!=='trading')err('진행 중인 라운드가 아니에요.');if(Object.values(room.students).some(s=>!s.done))err('모든 학생이 투자 완료할 때까지 기다려야 해요.');room.lastResults=results(room);room.prices=room.lastResults.map(r=>r.next);room.history.push([...room.prices]);room.status=room.round===totalRounds?'finished':'results';room.rankingVisible=false;persist();return teacherView(room);}
 if(route==='/api/reveal'){const room=teacher(b);if(!['results','finished'].includes(room.status))err('라운드 종료 후 순위를 확인할 수 있어요.');room.rankingVisible=true;persist();return teacherView(room);}
 if(route==='/api/next'){const room=teacher(b);if(room.status!=='results'||room.round>=totalRounds)err('다음 라운드를 진행할 수 없어요.');room.round++;room.status='trading';room.rankingVisible=false;room.lastResults=null;Object.values(room.students).forEach(s=>s.done=false);persist();return teacherView(room);}
 if(route==='/api/final'){const room=teacher(b);if(room.status!=='finished')err(totalRounds+'라운드 종료 후 공개할 수 있어요.');room.finalPublished=true;room.rankingVisible=true;persist();return teacherView(room);}
 err('존재하지 않는 기능이에요.',404);
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.ico':'image/x-icon'};
http.createServer((req,res)=>{
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 if(req.url.startsWith('/api/')){if(req.method!=='POST')return send(405,{error:'POST 요청만 가능해요.'});let raw='';req.on('data',c=>{raw+=c;if(raw.length>30000)req.destroy();});req.on('end',()=>{try{send(200,api(req.url,JSON.parse(raw||'{}')));}catch(e){send(e.status||500,{error:e.status?e.message:'서버 오류가 발생했어요.'});}});return;}
 if(req.method!=='GET')return send(405,{error:'허용되지 않는 요청이에요.'});const url=(req.url||'/').split('?')[0];const p=path.resolve(__dirname,'public','.'+decodeURIComponent(url==='/'?'/index.html':url));const root=path.resolve(__dirname,'public');if(!p.startsWith(root+path.sep))return send(403,{error:'접근할 수 없어요.'});fs.readFile(p,(e,data)=>{if(e){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(data);});
}).listen(PORT,'0.0.0.0',()=>console.log(`모의주식 게임: http://localhost:${PORT}`));
