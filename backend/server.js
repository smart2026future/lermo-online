import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const DATA_DIR   = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const MSGS_FILE  = path.join(DATA_DIR, 'messages.json');
const LOGS_FILE  = path.join(DATA_DIR, 'logs.json');
const FILES_DIR  = path.join(DATA_DIR, 'uploads');
const UI_DIR     = path.join(__dirname, '..', 'frontend');

app.use('/', express.static(UI_DIR, { etag: false, maxAge: 0 }));
app.use('/uploads', express.static(FILES_DIR));
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') res.setHeader('Cache-Control','no-store');
  next();
});

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [{
      id:'admin', username:'admin', name:'Administrator', email:'admin@lermo.app',
      password:'Admin123!', role:'admin', color:'navy', avatar:'AD', lang:'en',
      theme:'dark', createdAt: new Date().toISOString(), online:false, passwordReset:false,
      bio:'Platform Administrator', status:'available', jobTitle:'Platform Administrator'
    }] }, null, 2));
  }
  if (!fs.existsSync(ROOMS_FILE)) {
    const now = new Date().toISOString();
    fs.writeFileSync(ROOMS_FILE, JSON.stringify({ rooms: [
      { id:'general',       name:'general',       type:'public',  icon:'💬', desc:'Main community channel',          createdBy:'admin', createdAt:now, members:[], pinned:[] },
      { id:'announcements', name:'announcements', type:'public',  icon:'📣', desc:'Official announcements',          createdBy:'admin', createdAt:now, members:[], pinned:[] },
      { id:'creativity',    name:'creativity',    type:'public',  icon:'🎨', desc:'Art, design & creative ideas',    createdBy:'admin', createdAt:now, members:[], pinned:[] },
      { id:'wellness',      name:'wellness',      type:'public',  icon:'🌿', desc:'Health, fitness & self-care',     createdBy:'admin', createdAt:now, members:[], pinned:[] },
      { id:'games',         name:'games',         type:'public',  icon:'🎮', desc:'Play games together!',            createdBy:'admin', createdAt:now, members:[], pinned:[] },
      { id:'vip-lounge',    name:'vip-lounge',    type:'private', icon:'🔒', desc:'Private VIP room — members only', createdBy:'admin', createdAt:now, members:['admin'], pinned:[] }
    ] }, null, 2));
  }
  if (!fs.existsSync(MSGS_FILE))  fs.writeFileSync(MSGS_FILE,  JSON.stringify({ messages:{} }, null, 2));
  if (!fs.existsSync(LOGS_FILE))  fs.writeFileSync(LOGS_FILE,  JSON.stringify({ logs:[] }, null, 2));
}

function loadJson(file, fallback) {
  ensureData();
  try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return fallback; }
}
function saveJson(file, data) {
  ensureData();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
function addLog(type, msg) {
  const db = loadJson(LOGS_FILE,{logs:[]});
  const t = new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  db.logs.unshift({type,msg,t,date:new Date().toISOString()});
  if (db.logs.length > 500) db.logs = db.logs.slice(0,500);
  saveJson(LOGS_FILE, db);
}

let wss = null;
function broadcast(data) {
  if (!wss) return;
  const str = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState===1) c.send(str); });
}

// ── AUTH ──────────────────────────────────────────────────
app.post('/api/login', (req,res) => {
  const {username,password} = req.body;
  const db = loadJson(USERS_FILE,{users:[]});
  const user = db.users.find(u=>u.username===username && u.password===password);
  if (!user) return res.json({ok:false,error:'invalid_credentials'});
  user.online=true; user.lastSeen=new Date().toISOString();
  saveJson(USERS_FILE,db);
  addLog('auth',`Login: @${username}`);
  broadcast({type:'presence',userId:user.id,online:true,name:user.name});
  const {password:_p,...safe}=user;
  res.json({ok:true,user:safe});
});

app.post('/api/logout', (req,res) => {
  const {userId}=req.body;
  const db=loadJson(USERS_FILE,{users:[]});
  const user=db.users.find(u=>u.id===userId);
  if (user){user.online=false;user.lastSeen=new Date().toISOString();saveJson(USERS_FILE,db);}
  addLog('auth',`Logout: @${userId}`);
  broadcast({type:'presence',userId,online:false});
  res.json({ok:true});
});

app.post('/api/register', (req,res) => {
  const {username,name,email,password,color,avatar,jobTitle}=req.body;
  const db=loadJson(USERS_FILE,{users:[]});
  if (!username||!name||!email||!password) return res.json({ok:false,error:'missing_fields'});
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return res.json({ok:false,error:'invalid_username'});
  if (db.users.find(u=>u.username===username)) return res.json({ok:false,error:'username_taken'});
  if (password.length<6) return res.json({ok:false,error:'password_short'});
  const COLORS=['navy','crimson','teal','olive','slate','burgundy','forest','amber'];
  const newUser={
    id:username,username,name,email,password,role:'member',
    color:color||COLORS[db.users.length%COLORS.length],
    avatar:avatar||name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2),
    lang:'en',theme:'dark',createdAt:new Date().toISOString(),
    online:true,passwordReset:false,bio:'',status:'available',jobTitle:jobTitle||'',lastSeen:new Date().toISOString()
  };
  db.users.push(newUser);
  saveJson(USERS_FILE,db);
  addLog('auth',`Register: @${username}`);
  broadcast({type:'user_joined',user:{...newUser,password:undefined}});
  const {password:_p,...safe}=newUser;
  res.json({ok:true,user:safe});
});

app.post('/api/change-password',(req,res)=>{
  const {userId,oldPassword,newPassword}=req.body;
  const db=loadJson(USERS_FILE,{users:[]});
  const user=db.users.find(u=>u.id===userId);
  if (!user) return res.json({ok:false,error:'not_found'});
  if (user.password!==oldPassword) return res.json({ok:false,error:'wrong_password'});
  if (newPassword.length<6) return res.json({ok:false,error:'password_short'});
  user.password=newPassword;user.passwordReset=false;
  saveJson(USERS_FILE,db);
  addLog('auth',`Password changed: @${userId}`);
  res.json({ok:true});
});

app.post('/api/update-prefs',(req,res)=>{
  const {userId,lang,theme,bio,status,jobTitle}=req.body;
  const db=loadJson(USERS_FILE,{users:[]});
  const user=db.users.find(u=>u.id===userId);
  if (!user) return res.json({ok:false,error:'not_found'});
  if (lang)   user.lang=lang;
  if (theme)  user.theme=theme;
  if (bio!==undefined) user.bio=bio;
  if (status) user.status=status;
  if (jobTitle!==undefined) user.jobTitle=String(jobTitle).slice(0,80);
  saveJson(USERS_FILE,db);
  broadcast({type:'user_updated',userId,bio:user.bio,status:user.status,jobTitle:user.jobTitle});
  res.json({ok:true});
});

// ── ADMIN ─────────────────────────────────────────────────
app.get('/api/admin/users',(req,res)=>{
  const db=loadJson(USERS_FILE,{users:[]});
  res.json({ok:true,users:db.users.map(({password:_p,...u})=>u)});
});
app.post('/api/admin/reset-password',(req,res)=>{
  const {adminId,targetId,newPassword}=req.body;
  const db=loadJson(USERS_FILE,{users:[]});
  const admin=db.users.find(u=>u.id===adminId);
  if (!admin||admin.role!=='admin') return res.json({ok:false,error:'not_admin'});
  const target=db.users.find(u=>u.id===targetId);
  if (!target) return res.json({ok:false,error:'not_found'});
  if (newPassword.length<6) return res.json({ok:false,error:'password_short'});
  target.password=newPassword;target.passwordReset=true;
  saveJson(USERS_FILE,db);
  addLog('admin',`Password reset: @${targetId} by admin`);
  res.json({ok:true});
});
app.post('/api/admin/update-user',(req,res)=>{
  const {adminId,targetId,name,username,email,jobTitle,role,color,password}=req.body;
  const db=loadJson(USERS_FILE,{users:[]});
  const admin=db.users.find(u=>u.id===adminId);
  if (!admin||admin.role!=='admin') return res.json({ok:false,error:'not_admin'});
  const user=db.users.find(u=>u.id===targetId);
  if (!user) return res.json({ok:false,error:'not_found'});
  if (name!==undefined && String(name).trim()) user.name=String(name).trim().slice(0,80);
  if (email!==undefined) user.email=String(email).trim().slice(0,120);
  if (jobTitle!==undefined) user.jobTitle=String(jobTitle).trim().slice(0,80);
  if (color!==undefined) user.color=String(color).trim()||user.color;
  if (role!==undefined && user.id!=='admin' && ['member','admin'].includes(role)) user.role=role;
  if (username!==undefined && user.id!=='admin') {
    const clean=String(username).trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(clean)) return res.json({ok:false,error:'invalid_username'});
    if (clean!==user.username && db.users.find(u=>u.username===clean)) return res.json({ok:false,error:'username_taken'});
    user.username=clean;
  }
  if (password!==undefined && String(password).trim()) {
    if (String(password).length<6) return res.json({ok:false,error:'password_short'});
    user.password=String(password);user.passwordReset=true;
  }
  user.avatar=user.avatar||user.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  saveJson(USERS_FILE,db);
  addLog('admin',`User updated: @${user.id} by @${adminId}`);
  const {password:_p,...safe}=user;
  broadcast({type:'user_updated',userId:user.id,bio:user.bio,status:user.status,jobTitle:user.jobTitle,name:user.name,color:user.color,role:user.role});
  res.json({ok:true,user:safe});
});
app.post('/api/admin/remove-user',(req,res)=>{
  const {adminId,targetId}=req.body;
  const db=loadJson(USERS_FILE,{users:[]});
  const admin=db.users.find(u=>u.id===adminId);
  if (!admin||admin.role!=='admin') return res.json({ok:false,error:'not_admin'});
  const idx=db.users.findIndex(u=>u.id===targetId);
  if (idx===-1) return res.json({ok:false,error:'not_found'});
  db.users.splice(idx,1);
  saveJson(USERS_FILE,db);
  addLog('admin',`User removed: @${targetId}`);
  broadcast({type:'user_removed',userId:targetId});
  res.json({ok:true});
});
app.post('/api/admin/delete-room',(req,res)=>{
  const {adminId,roomId}=req.body;
  const db=loadJson(USERS_FILE,{users:[]});
  const admin=db.users.find(u=>u.id===adminId);
  if (!admin||admin.role!=='admin') return res.json({ok:false,error:'not_admin'});
  if (roomId==='general') return res.json({ok:false,error:'protected'});
  const rdb=loadJson(ROOMS_FILE,{rooms:[]});
  rdb.rooms=rdb.rooms.filter(r=>r.id!==roomId);
  saveJson(ROOMS_FILE,rdb);
  const mdb=loadJson(MSGS_FILE,{messages:{}});
  delete mdb.messages[roomId];
  saveJson(MSGS_FILE,mdb);
  addLog('admin',`Room deleted: #${roomId}`);
  broadcast({type:'room_deleted',roomId});
  res.json({ok:true});
});
app.get('/api/admin/logs',(req,res)=>{
  const db=loadJson(LOGS_FILE,{logs:[]});
  res.json({ok:true,logs:db.logs});
});
app.get('/api/admin/stats',(req,res)=>{
  const users=loadJson(USERS_FILE,{users:[]}).users;
  const rooms=loadJson(ROOMS_FILE,{rooms:[]}).rooms;
  const mdb=loadJson(MSGS_FILE,{messages:{}});
  let totalMsgs=0,dmCount=0,roomMsgs=0;
  Object.entries(mdb.messages).forEach(([k,arr])=>{
    totalMsgs+=arr.length;
    if(k.startsWith('dm_')) dmCount+=arr.length;
    else roomMsgs+=arr.length;
  });
  const today=new Date().toDateString();
  let todayMsgs=0;
  Object.values(mdb.messages).forEach(arr=>arr.forEach(m=>{
    if(m.ts && new Date(m.ts).toDateString()===today) todayMsgs++;
  }));
  res.json({ok:true,
    totalUsers:users.length,onlineUsers:users.filter(u=>u.online).length,
    totalRooms:rooms.length,totalMessages:totalMsgs,
    dmMessages:dmCount,roomMessages:roomMsgs,todayMessages:todayMsgs,
    membersSince:users.map(u=>({name:u.name,date:u.createdAt,role:u.role}))
  });
});

// ── WEATHER ─────────────────────────────────────────────────
app.get('/api/weather', async (req,res)=>{
  const city=String(req.query.city||'Erbil').trim()||'Erbil';
  try{
    const url=`https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    const r=await fetch(url,{headers:{'User-Agent':'LERMO-weather/1.0'}});
    const raw=await r.text();
    if (!r.ok || raw.trim().startsWith('<')) throw new Error('bad_weather_response');
    const data=JSON.parse(raw);
    const cc=data.current_condition?.[0]||{};
    const temp=Number(cc.temp_C);
    const status=(cc.weatherDesc?.[0]?.value)||'Current weather';
    const code=String(cc.weatherCode||'');
    const hour=new Date().getHours();
    const isNight=hour<6||hour>=18;
    const icon = /113/.test(code) ? (isNight?'🌙':'☀️') : /116|119|122/.test(code) ? '⛅' : /176|263|266|293|296|299|302|305|308|353|356|359/.test(code) ? '🌧️' : /179|227|230|323|326|329|332|335|338|368|371/.test(code) ? '❄️' : /200|386|389|392|395/.test(code) ? '⛈️' : /143|248|260/.test(code) ? '🌫️' : (isNight?'🌙':'☀️');
    res.json({ok:true,city,temp:Number.isFinite(temp)?temp:'--',status,icon,isNight});
  }catch(e){
    res.json({ok:false,error:'weather_unavailable',city});
  }
});

// ── ROOMS ──────────────────────────────────────────────────
app.get('/api/rooms',(req,res)=>{
  const db=loadJson(ROOMS_FILE,{rooms:[]});
  res.json({ok:true,rooms:db.rooms});
});
app.post('/api/rooms',(req,res)=>{
  const {name,type,desc,icon,createdBy}=req.body;
  if (!name||!type||!createdBy) return res.json({ok:false,error:'missing_fields'});
  const rdb=loadJson(ROOMS_FILE,{rooms:[]});
  if (rdb.rooms.find(r=>r.id===name)) return res.json({ok:false,error:'room_exists'});
  const room={id:name,name,type,icon:icon||(type==='private'?'🔒':type==='group'?'💬':'📢'),
    desc:desc||`${name} room`,createdBy,createdAt:new Date().toISOString(),members:[createdBy],pinned:[]};
  rdb.rooms.push(room);
  saveJson(ROOMS_FILE,rdb);
  const mdb=loadJson(MSGS_FILE,{messages:{}});
  if (!mdb.messages[name]) mdb.messages[name]=[];
  saveJson(MSGS_FILE,mdb);
  addLog('room',`Room created: #${name} (${type}) by @${createdBy}`);
  broadcast({type:'room_created',room});
  res.json({ok:true,room});
});

// ── MESSAGES ───────────────────────────────────────────────
app.get('/api/messages/:roomId',(req,res)=>{
  const mdb=loadJson(MSGS_FILE,{messages:{}});
  res.json({ok:true,messages:mdb.messages[req.params.roomId]||[]});
});
app.post('/api/messages',(req,res)=>{
  const {roomId,userId,username,name,color,avatar,jobTitle,text,fileUrl,fileName,fileType,replyTo}=req.body;
  if (!roomId||!userId) return res.json({ok:false,error:'missing_fields'});
  if (!text&&!fileUrl) return res.json({ok:false,error:'empty_message'});
  const mdb=loadJson(MSGS_FILE,{messages:{}});
  if (!mdb.messages[roomId]) mdb.messages[roomId]=[];
  const msg={
    id:Date.now(),roomId,userId,username,name,color,avatar,jobTitle:jobTitle||'',
    text:text?String(text).slice(0,3000):'',
    fileUrl:fileUrl||null,fileName:fileName||null,fileType:fileType||null,
    replyTo:replyTo||null,
    time:new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),
    ts:Date.now(),reactions:{},edited:false
  };
  mdb.messages[roomId].push(msg);
  if (mdb.messages[roomId].length>1000) mdb.messages[roomId]=mdb.messages[roomId].slice(-1000);
  saveJson(MSGS_FILE,mdb);
  broadcast({type:'new_message',message:msg});
  res.json({ok:true,message:msg});
});
app.post('/api/messages/react',(req,res)=>{
  const {roomId,msgId,userId,emoji}=req.body;
  const mdb=loadJson(MSGS_FILE,{messages:{}});
  const msgs=mdb.messages[roomId]||[];
  const msg=msgs.find(m=>m.id===msgId);
  if (!msg) return res.json({ok:false,error:'not_found'});
  if (!msg.reactions) msg.reactions={};
  if (!msg.reactions[emoji]) msg.reactions[emoji]=[];
  const idx=msg.reactions[emoji].indexOf(userId);
  if (idx>-1) msg.reactions[emoji].splice(idx,1);
  else msg.reactions[emoji].push(userId);
  saveJson(MSGS_FILE,mdb);
  broadcast({type:'reaction',roomId,msgId,reactions:msg.reactions});
  res.json({ok:true,reactions:msg.reactions});
});
app.post('/api/messages/delete',(req,res)=>{
  const {roomId,msgId,userId}=req.body;
  const mdb=loadJson(MSGS_FILE,{messages:{}});
  const msgs=mdb.messages[roomId]||[];
  const idx=msgs.findIndex(m=>m.id===msgId);
  if (idx===-1) return res.json({ok:false,error:'not_found'});
  const msg=msgs[idx];
  const users=loadJson(USERS_FILE,{users:[]}).users;
  const user=users.find(u=>u.id===userId);
  if (msg.userId!==userId && (!user||user.role!=='admin')) return res.json({ok:false,error:'forbidden'});
  msgs.splice(idx,1);
  saveJson(MSGS_FILE,mdb);
  broadcast({type:'message_deleted',roomId,msgId});
  res.json({ok:true});
});

// ── FILE UPLOAD ────────────────────────────────────────────
app.post('/api/upload',(req,res)=>{
  const {fileName,fileData,fileType,userId}=req.body;
  if (!fileName||!fileData||!userId) return res.json({ok:false,error:'missing'});
  const ext=path.extname(fileName).toLowerCase();
  const safe=Date.now()+'_'+fileName.replace(/[^a-zA-Z0-9._-]/g,'_');
  const filePath=path.join(FILES_DIR,safe);
  const base64=fileData.replace(/^data:[^;]+;base64,/,'');
  fs.writeFileSync(filePath,Buffer.from(base64,'base64'));
  addLog('file',`File uploaded: ${fileName} by @${userId}`);
  res.json({ok:true,fileUrl:`/uploads/${safe}`,fileName,fileType});
});

// ── USERS ──────────────────────────────────────────────────
app.get('/api/users',(req,res)=>{
  const db=loadJson(USERS_FILE,{users:[]});
  res.json({ok:true,users:db.users.map(({password:_p,...u})=>u)});
});
app.get('/api/stats',(req,res)=>{
  const users=loadJson(USERS_FILE,{users:[]}).users;
  const rooms=loadJson(ROOMS_FILE,{rooms:[]}).rooms;
  const mdb=loadJson(MSGS_FILE,{messages:{}});
  let totalMsgs=0;
  Object.values(mdb.messages).forEach(arr=>totalMsgs+=arr.length);
  res.json({ok:true,totalUsers:users.length,onlineUsers:users.filter(u=>u.online).length,totalRooms:rooms.length,totalMessages:totalMsgs});
});

// ── HTTP + WS ──────────────────────────────────────────────
const server=http.createServer(app);
wss=new WebSocketServer({server});
wss.on('connection',(ws)=>{
  ws.on('message',raw=>{
    try {
      const msg=JSON.parse(raw);
      if (msg.type==='join_room') ws.roomId=msg.roomId;
      if (msg.type==='typing') broadcast({type:'typing',userId:msg.userId,name:msg.name,roomId:msg.roomId});
    } catch {}
  });
});

const PORT=8888;
function getLocalIP(){
  const nets=os.networkInterfaces();
  for (const n of Object.values(nets))
    for (const net of n)
      if (net.family==='IPv4'&&!net.internal) return net.address;
  return 'localhost';
}
ensureData();
server.listen(PORT,'0.0.0.0',()=>{
  const ip=getLocalIP();
  console.log('\n=========================================================');
  console.log('   LERMO v2 - Secure Chat Platform');
  console.log('=========================================================');
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${ip}:${PORT}`);
  console.log('   Admin:   admin / Admin123!');
  console.log('   Do NOT close this window!');
  console.log('=========================================================\n');
});
