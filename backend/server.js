import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

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
const FILES_DIR  = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const MEETINGS_FILE = path.join(DATA_DIR, 'meetings.json');
const GAME_FILE  = path.join(DATA_DIR, 'games.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const UI_DIR     = path.join(__dirname, '..', 'frontend');
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const AUTO_APPROVE_USERS = String(process.env.AUTO_APPROVE_USERS || 'false').toLowerCase() === 'true';
const DATABASE_URL = process.env.DATABASE_URL || '';
let pgPool = null;
let pgReady = false;
const kvCache = new Map();

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
  if (!fs.existsSync(MEETINGS_FILE)) fs.writeFileSync(MEETINGS_FILE, JSON.stringify({ meetings:[] }, null, 2));
  if (!fs.existsSync(GAME_FILE)) fs.writeFileSync(GAME_FILE, JSON.stringify({ games:[] }, null, 2));
  if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ settings:{} }, null, 2));
}

const KEY_BY_FILE = new Map([
  [USERS_FILE,'users'], [ROOMS_FILE,'rooms'], [MSGS_FILE,'messages'], [LOGS_FILE,'logs'],
  [MEETINGS_FILE,'meetings'], [GAME_FILE,'games'], [SETTINGS_FILE,'settings']
]);
function loadJson(file, fallback) {
  ensureData();
  const key = KEY_BY_FILE.get(file);
  if (pgReady && key && kvCache.has(key)) return structuredClone(kvCache.get(key));
  try { return JSON.parse(fs.readFileSync(file,'utf8')); } catch { return fallback; }
}
function saveJson(file, data) {
  ensureData();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  const key = KEY_BY_FILE.get(file);
  if (pgReady && key) {
    kvCache.set(key, structuredClone(data));
    pgPool.query('insert into lermo_kv(key,value,updated_at) values($1,$2,now()) on conflict(key) do update set value=excluded.value, updated_at=now()', [key, data]).catch(e=>console.error('Postgres save failed:', e.message));
  }
}
async function initPostgres() {
  ensureData();
  if (!DATABASE_URL) return;
  try {
    pgPool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized:false } });
    await pgPool.query('create table if not exists lermo_kv (key text primary key, value jsonb not null, updated_at timestamptz default now())');
    for (const [file,key] of KEY_BY_FILE.entries()) {
      let localFallback = {};
      if (key === 'users') localFallback = {users:[]};
      if (key === 'rooms') localFallback = {rooms:[]};
      if (key === 'messages') localFallback = {messages:{}};
      if (key === 'logs') localFallback = {logs:[]};
      if (key === 'meetings') localFallback = {meetings:[]};
      if (key === 'games') localFallback = {games:[]};
      if (key === 'settings') localFallback = {settings:{}};
      const found = await pgPool.query('select value from lermo_kv where key=$1', [key]);
      if (found.rows[0]) kvCache.set(key, found.rows[0].value);
      else {
        const local = JSON.parse(fs.readFileSync(file,'utf8') || JSON.stringify(localFallback));
        kvCache.set(key, local);
        await pgPool.query('insert into lermo_kv(key,value) values($1,$2) on conflict do nothing', [key, local]);
      }
    }
    pgReady = true;
    console.log('PostgreSQL storage enabled for LERMO.');
  } catch (e) {
    console.error('PostgreSQL disabled; falling back to JSON files:', e.message);
    pgReady = false;
  }
}
function signToken(user){return jwt.sign({id:user.id,role:user.role},JWT_SECRET,{expiresIn:'12h'});}
function safeUser(user){const {password, passwordHash, ...safe}=user;return safe;}
function ensureSecurityDefaults(db){
  let changed=false;
  for (const u of db.users||[]) {
    if (u.approved === undefined) { u.approved = true; changed = true; }
    if (!u.status) { u.status = 'available'; changed = true; }
    if (!u.role) { u.role = u.id==='admin'?'admin':'member'; changed = true; }
  }
  return changed;
}
async function verifyPassword(user,password){
  if (!user) return false;
  if (user.passwordHash) return bcrypt.compare(password, user.passwordHash);
  if (user.password && user.password === password) {
    user.passwordHash = await bcrypt.hash(password, 12);
    delete user.password;
    return true;
  }
  return false;
}
async function setUserPassword(user,password){ user.passwordHash = await bcrypt.hash(String(password),12); delete user.password; }
function requireAdminUser(db,adminId){const admin=(db.users||[]).find(u=>u.id===adminId);return admin && admin.role==='admin' && admin.approved!==false ? admin : null;}
function backupPayload(){return {exportedAt:new Date().toISOString(), storage: pgReady?'postgresql':'json', users:loadJson(USERS_FILE,{users:[]}), rooms:loadJson(ROOMS_FILE,{rooms:[]}), messages:loadJson(MSGS_FILE,{messages:{}}), meetings:loadJson(MEETINGS_FILE,{meetings:[]}), games:loadJson(GAME_FILE,{games:[]}), logs:loadJson(LOGS_FILE,{logs:[]}), settings:loadJson(SETTINGS_FILE,{settings:{}})};}
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
app.post('/api/login', async (req,res) => {
  const {username,password} = req.body;
  const db = loadJson(USERS_FILE,{users:[]});
  if (ensureSecurityDefaults(db)) saveJson(USERS_FILE,db);
  const user = db.users.find(u=>u.username===username);
  if (!user || !(await verifyPassword(user,password))) return res.json({ok:false,error:'invalid_credentials'});
  if (user.approved === false) return res.json({ok:false,error:'pending_approval'});
  user.online=true; user.lastSeen=new Date().toISOString();
  saveJson(USERS_FILE,db);
  addLog('auth',`Login: @${username}`);
  broadcast({type:'presence',userId:user.id,online:true,name:user.name});
  res.json({ok:true,user:safeUser(user),token:signToken(user)});
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

app.post('/api/register', async (req,res) => {
  const {username,name,email,password,color,avatar,jobTitle}=req.body;
  const db=loadJson(USERS_FILE,{users:[]});
  if (!username||!name||!email||!password) return res.json({ok:false,error:'missing_fields'});
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return res.json({ok:false,error:'invalid_username'});
  if (db.users.find(u=>u.username===username)) return res.json({ok:false,error:'username_taken'});
  if (password.length<6) return res.json({ok:false,error:'password_short'});
  const COLORS=['navy','crimson','teal','olive','slate','burgundy','forest','amber'];
  const newUser={
    id:username,username,name,email,role:'member',approved:AUTO_APPROVE_USERS,
    color:color||COLORS[db.users.length%COLORS.length],
    avatar:avatar||name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2),
    lang:'en',theme:'dark',createdAt:new Date().toISOString(),
    online:true,passwordReset:false,bio:'',status:'available',jobTitle:jobTitle||'',lastSeen:new Date().toISOString()
  };
  await setUserPassword(newUser,password);
  db.users.push(newUser);
  saveJson(USERS_FILE,db);
  addLog('auth',`Register: @${username}`);
  broadcast({type:'user_joined',user:{...newUser,password:undefined}});
  res.json({ok:true,user:safeUser(newUser),pendingApproval:!newUser.approved});
});

app.post('/api/change-password',async (req,res)=>{
  const {userId,oldPassword,newPassword}=req.body;
  const db=loadJson(USERS_FILE,{users:[]});
  const user=db.users.find(u=>u.id===userId);
  if (!user) return res.json({ok:false,error:'not_found'});
  if (!(await verifyPassword(user,oldPassword))) return res.json({ok:false,error:'wrong_password'});
  if (newPassword.length<8) return res.json({ok:false,error:'password_short'});
  await setUserPassword(user,newPassword);user.passwordReset=false;
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
  if (ensureSecurityDefaults(db)) saveJson(USERS_FILE,db);
  res.json({ok:true,users:db.users.map(safeUser)});
});
app.post('/api/admin/reset-password',async (req,res)=>{
  const {adminId,targetId,newPassword}=req.body;
  const db=loadJson(USERS_FILE,{users:[]});
  const admin=requireAdminUser(db,adminId);
  if (!admin) return res.json({ok:false,error:'not_admin'});
  const target=db.users.find(u=>u.id===targetId);
  if (!target) return res.json({ok:false,error:'not_found'});
  if (newPassword.length<8) return res.json({ok:false,error:'password_short'});
  await setUserPassword(target,newPassword);target.passwordReset=true;
  saveJson(USERS_FILE,db);
  addLog('admin',`Password reset: @${targetId} by admin`);
  res.json({ok:true});
});
app.post('/api/admin/update-user',async (req,res)=>{
  const {adminId,targetId,name,username,email,jobTitle,role,color,password}=req.body;
  const db=loadJson(USERS_FILE,{users:[]});
  const admin=requireAdminUser(db,adminId);
  if (!admin) return res.json({ok:false,error:'not_admin'});
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
  if (req.body.approved!==undefined && user.id!=='admin') user.approved=!!req.body.approved;
  if (password!==undefined && String(password).trim()) {
    if (String(password).length<8) return res.json({ok:false,error:'password_short'});
    await setUserPassword(user,String(password));user.passwordReset=true;
  }
  user.avatar=user.avatar||user.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  saveJson(USERS_FILE,db);
  addLog('admin',`User updated: @${user.id} by @${adminId}`);
  broadcast({type:'user_updated',userId:user.id,bio:user.bio,status:user.status,jobTitle:user.jobTitle,name:user.name,color:user.color,role:user.role,approved:user.approved});
  res.json({ok:true,user:safeUser(user)});
});
app.post('/api/admin/remove-user',(req,res)=>{
  const {adminId,targetId}=req.body;
  const db=loadJson(USERS_FILE,{users:[]});
  const admin=requireAdminUser(db,adminId);
  if (!admin) return res.json({ok:false,error:'not_admin'});
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
  const admin=requireAdminUser(db,adminId);
  if (!admin) return res.json({ok:false,error:'not_admin'});
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


// -- APPROVAL / BACKUP / MEETINGS / TWO-PLAYER GAMES -----------------------
app.post('/api/admin/approve-user',(req,res)=>{
  const {adminId,targetId,approved=true}=req.body;
  const db=loadJson(USERS_FILE,{users:[]});
  const admin=requireAdminUser(db,adminId);
  if (!admin) return res.json({ok:false,error:'not_admin'});
  const user=db.users.find(u=>u.id===targetId);
  if (!user) return res.json({ok:false,error:'not_found'});
  if (user.id==='admin') return res.json({ok:false,error:'protected'});
  user.approved=!!approved;
  saveJson(USERS_FILE,db);
  addLog('admin',`${approved?'Approved':'Suspended'} user: @${user.username} by @${admin.username}`);
  broadcast({type:'user_updated',userId:user.id,approved:user.approved});
  res.json({ok:true,user:safeUser(user)});
});
app.get('/api/admin/backup',(req,res)=>{
  const adminId=req.query.adminId;
  const db=loadJson(USERS_FILE,{users:[]});
  const admin=requireAdminUser(db,adminId);
  if (!admin) return res.status(403).json({ok:false,error:'not_admin'});
  addLog('admin',`Backup exported by @${admin.username}`);
  res.setHeader('Content-Disposition', `attachment; filename="lermo-backup-${Date.now()}.json"`);
  res.json(backupPayload());
});
app.post('/api/admin/restore-backup',(req,res)=>{
  const {adminId,backup}=req.body;
  const db=loadJson(USERS_FILE,{users:[]});
  const admin=requireAdminUser(db,adminId);
  if (!admin) return res.status(403).json({ok:false,error:'not_admin'});
  if (!backup || !backup.users || !backup.rooms) return res.json({ok:false,error:'invalid_backup'});
  saveJson(USERS_FILE,backup.users); saveJson(ROOMS_FILE,backup.rooms);
  if (backup.messages) saveJson(MSGS_FILE,backup.messages);
  if (backup.meetings) saveJson(MEETINGS_FILE,backup.meetings);
  if (backup.games) saveJson(GAME_FILE,backup.games);
  addLog('admin',`Backup restored by @${admin.username}`);
  res.json({ok:true});
});
app.get('/api/meetings',(req,res)=>{
  const userId=req.query.userId;
  const db=loadJson(MEETINGS_FILE,{meetings:[]});
  const meetings=(db.meetings||[]).filter(m=>!userId || m.createdBy===userId || (m.participants||[]).includes(userId));
  res.json({ok:true,meetings});
});
app.post('/api/meetings',(req,res)=>{
  const {createdBy,title,start,end,participants=[],notes=''}=req.body;
  if (!createdBy || !title || !start) return res.json({ok:false,error:'missing_fields'});
  const users=loadJson(USERS_FILE,{users:[]}).users;
  const creator=users.find(u=>u.id===createdBy && u.approved!==false);
  if (!creator) return res.json({ok:false,error:'not_allowed'});
  const db=loadJson(MEETINGS_FILE,{meetings:[]});
  const m={id:'mtg_'+Date.now(),title:String(title).slice(0,120),start,end:end||'',participants:[...new Set([createdBy,...participants])],createdBy,notes:String(notes||'').slice(0,500),status:{},createdAt:new Date().toISOString()};
  m.participants.forEach(u=>{m.status[u]=u===createdBy?'accepted':'pending'});
  db.meetings.unshift(m); saveJson(MEETINGS_FILE,db);
  addLog('meeting',`Meeting booked: ${m.title} by @${creator.username}`);
  broadcast({type:'meeting_created',meeting:m});
  res.json({ok:true,meeting:m});
});
app.post('/api/meetings/respond',(req,res)=>{
  const {userId,meetingId,status}=req.body;
  const db=loadJson(MEETINGS_FILE,{meetings:[]});
  const m=(db.meetings||[]).find(x=>x.id===meetingId);
  if (!m || !(m.participants||[]).includes(userId)) return res.json({ok:false,error:'not_found'});
  if (!['accepted','declined','pending'].includes(status)) return res.json({ok:false,error:'bad_status'});
  m.status[userId]=status; saveJson(MEETINGS_FILE,db);
  broadcast({type:'meeting_updated',meeting:m});
  res.json({ok:true,meeting:m});
});
app.get('/api/games/sessions',(req,res)=>{
  const userId=req.query.userId;
  const db=loadJson(GAME_FILE,{games:[]});
  res.json({ok:true,games:(db.games||[]).filter(g=>!userId || (g.players||[]).includes(userId) || g.createdBy===userId)});
});
app.post('/api/games/invite',(req,res)=>{
  const {fromId,toId,gameType='ttt'}=req.body;
  const users=loadJson(USERS_FILE,{users:[]}).users;
  const from=users.find(u=>u.id===fromId), to=users.find(u=>u.id===toId);
  if (!from || !to) return res.json({ok:false,error:'user_not_found'});
  const db=loadJson(GAME_FILE,{games:[]});
  const game={id:'game_'+Date.now(),gameType,players:[fromId,toId],createdBy:fromId,status:'pending',turn:fromId,board:Array(9).fill(''),winner:null,moves:[],createdAt:new Date().toISOString()};
  db.games.unshift(game); saveJson(GAME_FILE,db);
  broadcast({type:'game_invite',game,from:safeUser(from),to:safeUser(to)});
  res.json({ok:true,game});
});
app.post('/api/games/move',(req,res)=>{
  const {gameId,userId,index}=req.body;
  const db=loadJson(GAME_FILE,{games:[]});
  const g=(db.games||[]).find(x=>x.id===gameId);
  if (!g || !g.players.includes(userId)) return res.json({ok:false,error:'not_found'});
  if (g.status==='pending') g.status='active';
  if (g.status!=='active' || g.turn!==userId || g.board[index]) return res.json({ok:false,error:'bad_move'});
  const mark=g.players[0]===userId?'X':'O';
  g.board[index]=mark; g.moves.push({userId,index,mark,at:new Date().toISOString()});
  const wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const won=wins.find(w=>w.every(i=>g.board[i]===mark));
  if (won) { g.status='finished'; g.winner=userId; }
  else if (g.board.every(Boolean)) { g.status='finished'; g.winner='draw'; }
  else g.turn=g.players.find(p=>p!==userId);
  saveJson(GAME_FILE,db);
  broadcast({type:'game_updated',game:g});
  res.json({ok:true,game:g});
});

// ── USERS ──────────────────────────────────────────────────
app.get('/api/users',(req,res)=>{
  const db=loadJson(USERS_FILE,{users:[]});
  if (ensureSecurityDefaults(db)) saveJson(USERS_FILE,db);
  res.json({ok:true,users:db.users.map(safeUser)});
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

const PORT = process.env.PORT || 8888;
function getLocalIP(){
  const nets=os.networkInterfaces();
  for (const n of Object.values(nets))
    for (const net of n)
      if (net.family==='IPv4'&&!net.internal) return net.address;
  return 'localhost';
}
ensureData();
await initPostgres();
{ const db=loadJson(USERS_FILE,{users:[]}); if (ensureSecurityDefaults(db)) saveJson(USERS_FILE,db); }
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
