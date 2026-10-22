/* ---------- cloud: sign-in, end-to-end encrypted vault, AI service ---------- */
const CFG=window.LEDGERLINE_CONFIG||{};
const KDF_ITER=600000,REC_ITER=200000;
let sb=null,authUser=null,vault=null,DKkey=null,rawDK=null,pushTimer=null,pushing=false,dirty=false,syncState='idle',lockTimer=null,gateView='signin',gateMode='signin',pending=null,unlocked=false;
const te=new TextEncoder(),td=new TextDecoder();
const rnd=n=>crypto.getRandomValues(new Uint8Array(n));
function b64(u8){let s='';const C=0x8000;for(let i=0;i<u8.length;i+=C)s+=String.fromCharCode.apply(null,u8.subarray(i,i+C));return btoa(s)}
function unb64(s){const bin=atob(s),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u}
async function kdfKey(secret,salt,iter){
  const base=await crypto.subtle.importKey('raw',te.encode(String(secret).normalize('NFKC')),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:iter,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
const aad=()=>te.encode(authUser.id);
async function aesEnc(key,u8,ad){
  const iv=rnd(12),ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:ad},key,u8));
  const out=new Uint8Array(12+ct.length);out.set(iv);out.set(ct,12);return b64(out);
}
async function aesDec(key,s,ad){
  const u=unb64(s);
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:u.slice(0,12),additionalData:ad},key,u.slice(12)));
}
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function makeRecoveryKey(){
  const r=rnd(20);let bits=0,val=0,out='';
  for(const b of r){val=(val<<8)|b;bits+=8;while(bits>=5){out+=B32[(val>>>(bits-5))&31];bits-=5}}
  return out.match(/.{1,4}/g).join('-');
}
const recNorm=s=>String(s||'').toUpperCase().replace(/[^A-Z2-7]/g,'');
const blankState=()=>normState({v:1,settings:{currency:'PGK',view:'fortnight',profile:'family',household:1,needsPct:50,wantsPct:30,savePct:20},income:[],expenses:[],loans:[],goals:[]});

/* sync */
function save(){
  if(!unlocked)return;
  dirty=true;setSync('pending');clearTimeout(pushTimer);pushTimer=setTimeout(pushVault,1200);
}
function setSync(st){syncState=st;renderAcct()}
function renderAcct(){
  const el=document.getElementById('acct');if(!el)return;
  const lab={idle:'',saved:'✓ Saved and encrypted',saving:'Saving…',pending:'Unsaved changes',offline:'▲ Offline, will retry',conflict:'▲ Changed on another device'}[syncState]||'';
  el.innerHTML='<span class="small '+(syncState==='offline'||syncState==='conflict'?'warn':'muted')+'" role="status">'+lab+'</span>'
    +(syncState==='conflict'?'<button class="btn tiny" data-act="conf-load">Load latest</button><button class="btn tiny" data-act="conf-over">Keep mine</button>':'')
    +'<button class="btn tiny" data-act="lock">Lock</button><button class="btn tiny" data-act="signout">Sign out</button>';
}
async function updateVault(patch){
  const r=await sb.from('vaults').update(Object.assign({},patch,{rev:vault.rev+1,updated_at:new Date().toISOString()})).eq('user_id',authUser.id).eq('rev',vault.rev).select('rev');
  if(r.error)throw r.error;
  if(!r.data||!r.data.length){const e=new Error('conflict');e.conflict=true;throw e}
  vault.rev=r.data[0].rev;Object.assign(vault,patch);
}
async function pushVault(){
  if(!unlocked||pushing||!dirty||syncState==='conflict')return;
  pushing=true;dirty=false;setSync('saving');
  try{
    const ct=await aesEnc(DKkey,te.encode(JSON.stringify(S)),aad());
    await updateVault({ciphertext:ct});
    setSync(dirty?'pending':'saved');
  }catch(e){
    dirty=true;
    if(e&&e.conflict)setSync('conflict');else{setSync('offline');clearTimeout(pushTimer);pushTimer=setTimeout(pushVault,10000)}
  }
  pushing=false;
  if(dirty&&syncState==='pending'){clearTimeout(pushTimer);pushTimer=setTimeout(pushVault,300)}
}
async function loadRemote(){
  const r=await sb.from('vaults').select('*').eq('user_id',authUser.id).maybeSingle();
  if(r.error||!r.data)throw (r.error||new Error('Vault not found'));
  const plain=await aesDec(DKkey,r.data.ciphertext,aad());
  vault=r.data;S=normState(JSON.parse(td.decode(plain)));dirty=false;
}
async function checkRemote(){
  if(!unlocked||pushing)return;
  try{
    const r=await sb.from('vaults').select('rev').eq('user_id',authUser.id).maybeSingle();
    if(r.error||!r.data||r.data.rev<=vault.rev)return;
    if(dirty||syncState==='pending'||syncState==='saving'){setSync('conflict');return}
    await loadRemote();setSync('saved');render();
  }catch(e){}
}
async function lockApp(signOut){
  clearTimeout(lockTimer);
  if(unlocked&&dirty&&syncState!=='conflict'){clearTimeout(pushTimer);await pushVault()}
  unlocked=false;DKkey=null;rawDK=null;vault=signOut?null:vault;S=blankState();dirty=false;syncState='idle';
  UI.intake=null;UI.stmt=null;UI.inc=null;UI.chat=[];UI.agents={};UI.newRec=null;UI.secMsg='';UI.sel={};UI.trashMsg='';UI.eraseMsg='';
  if(signOut){try{await sb.auth.signOut()}catch(e){}authUser=null;gate('signin')}else gate('unlock');
}
function bumpLock(){
  clearTimeout(lockTimer);
  if(!unlocked)return;
  const m=num(S.settings.lockMin==null?15:S.settings.lockMin);
  if(m>0)lockTimer=setTimeout(()=>lockApp(false),m*60000);
}

/* vault creation, unlock, recovery */
async function prepareVault(pass){
  const raw=rnd(32),salt=rnd(16),recSalt=rnd(16),recKey=makeRecoveryKey();
  const dk=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
  const pk=await kdfKey(pass,salt,KDF_ITER),rk=await kdfKey(recNorm(recKey),recSalt,REC_ITER),ad=aad();
  const st=normState(sample());
  return {raw,dk,recKey,state:st,row:{user_id:authUser.id,rev:1,kdf:{alg:'PBKDF2-SHA256',iter:KDF_ITER,salt:b64(salt)},wrap_pass:await aesEnc(pk,raw,ad),rec_salt:b64(recSalt),wrap_rec:await aesEnc(rk,raw,ad),ciphertext:await aesEnc(dk,te.encode(JSON.stringify(st)),ad)}};
}
async function openWith(raw){
  DKkey=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);rawDK=raw;
  const plain=await aesDec(DKkey,vault.ciphertext,aad());
  S=normState(JSON.parse(td.decode(plain)));purgeTrash();unlocked=true;dirty=false;syncState='saved';
  enterApp();
}
async function unlockWith(pass){
  const k=vault.kdf,pk=await kdfKey(pass,unb64(k.salt),k.iter);let raw;
  try{raw=await aesDec(pk,vault.wrap_pass,aad())}catch(e){throw new Error('Wrong passphrase.')}
  await openWith(raw);
}
async function recoverWith(recKey,newPass){
  const rk=await kdfKey(recNorm(recKey),unb64(vault.rec_salt),REC_ITER);let raw;
  try{raw=await aesDec(rk,vault.wrap_rec,aad())}catch(e){throw new Error('That recovery key is not right.')}
  const salt=rnd(16),pk=await kdfKey(newPass,salt,KDF_ITER);
  await updateVault({kdf:{alg:'PBKDF2-SHA256',iter:KDF_ITER,salt:b64(salt)},wrap_pass:await aesEnc(pk,raw,aad())});
  await openWith(raw);
}
function enterApp(){
  CAPS_DONE=true;SAMPLE=AI;LIM=AI_LIMITS;DL=FILES;
  document.getElementById('gate').hidden=true;document.getElementById('appwrap').hidden=false;
  renderAcct();render();bumpLock();
}

/* AI through the Edge Function (stateless; counts calls, stores nothing) */
const AI_LIMITS={maxPromptBytes:262144,images:{maxCount:6,maxInputBytes:20000000,mediaTypes:['image/jpeg','image/png','image/webp','image/gif']},tools:{maxCount:8}};
function blobB64(b){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=()=>rej(r.error);r.readAsDataURL(b)})}
async function toApiImage(f){
  if(typeof createImageBitmap==='function'){
    try{
      const bm=await createImageBitmap(f),sc=Math.min(1,1568/Math.max(bm.width,bm.height)),cv=document.createElement('canvas');
      cv.width=Math.max(1,Math.round(bm.width*sc));cv.height=Math.max(1,Math.round(bm.height*sc));
      cv.getContext('2d').drawImage(bm,0,0,cv.width,cv.height);
      const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.82));
      if(blob)return {media_type:'image/jpeg',data:await blobB64(blob)};
    }catch(e){}
  }
  return {media_type:f.type||'image/jpeg',data:await blobB64(f)};
}
async function aiRound(body,signal){
  const ses=(await sb.auth.getSession()).data.session;
  if(!ses)throw {code:'session_expired',message:'signed out'};
  let r;
  try{r=await fetch(CFG.SUPABASE_URL+'/functions/v1/ai',{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+ses.access_token,apikey:CFG.SUPABASE_ANON_KEY},body:JSON.stringify(body)})}
  catch(e){throw {code:(e&&e.name==='AbortError')?'cancelled':'upstream_error',message:String(e&&e.message||e)}}
  if(!r.ok){
    const code=r.status===401?'session_expired':r.status===429?'rate_limited':r.status===403?'not_granted':r.status===413?'prompt_too_large':r.status===400?'invalid_request':'upstream_error';
    throw {code,message:'HTTP '+r.status};
  }
  try{return await r.json()}catch(e){throw {code:'upstream_error',message:'bad response'}}
}
function parseLoose(t){
  const s=String(t||'').trim();
  try{return JSON.parse(s)}catch(e){}
  const f=s.match(/```(?:json)?\s*([\s\S]*?)```/);if(f){try{return JSON.parse(f[1])}catch(e){}}
  const a=s.search(/[\[{]/),z=Math.max(s.lastIndexOf('}'),s.lastIndexOf(']'));
  if(a>=0&&z>a){try{return JSON.parse(s.slice(a,z+1))}catch(e){}}
  throw {code:'invalid_json',message:'no JSON',text:s};
}
async function aiCall(input,opts,wantJson){
  opts=opts||{};
  const turns=(typeof input==='string'?[{role:'user',content:input}]:input).map(t=>({role:t.role,content:String(t.content)}));
  let imgs=[];
  if(opts.images){const arr=Array.isArray(opts.images)?opts.images:[opts.images];imgs=await Promise.all(arr.map(toApiImage))}
  const msgs=turns.map((t,i)=>({role:t.role,content:(i===turns.length-1&&imgs.length)?imgs.map(im=>({type:'image',source:{type:'base64',media_type:im.media_type,data:im.data}})).concat([{type:'text',text:t.content}]):t.content}));
  const tools=(opts.tools||[]).map(t=>({name:t.name,description:t.description,input_schema:t.inputSchema||{type:'object',properties:{}}}));
  const texts=[];
  for(let round=0;round<6;round++){
    const body={messages:msgs,max_tokens:wantJson?8192:4096};
    if(wantJson)body.system='Your final message must contain only the JSON value that was requested, with no commentary. Any narration before tool calls is ignored.';
    if(tools.length&&round<5)body.tools=tools;
    const res=await aiRound(body,opts.signal),blocks=Array.isArray(res.content)?res.content:[];
    const t=blocks.filter(b=>b.type==='text').map(b=>b.text).join('');
    if(t)texts.push(t);
    const uses=blocks.filter(b=>b.type==='tool_use');
    if(res.stop_reason==='tool_use'&&uses.length&&tools.length&&round<5){
      msgs.push({role:'assistant',content:blocks});
      const results=[];
      for(const u of uses){
        const tool=(opts.tools||[]).find(x=>x.name===u.name);let out,err=false;
        try{if(!tool)throw new Error('Unknown tool');out=JSON.stringify(await tool.execute(u.input||{},{signal:opts.signal}))}catch(e){out='Error: '+(e&&e.message||e);err=true}
        results.push({type:'tool_result',tool_use_id:u.id,content:String(out).slice(0,32000),is_error:err});
      }
      msgs.push({role:'user',content:results});continue;
    }
    break;
  }
  const full=(wantJson?texts[texts.length-1]:texts.join('\n\n'))||'';
  if(!full.trim())throw {code:'empty_completion',message:'empty'};
  if(opts.onText){try{opts.onText({text:full,delta:full})}catch(e){}}
  return {text:full,truncated:false};
}
const AI=async(input,opts)=>aiCall(input,opts,false);
AI.json=async(input,opts)=>{const r=await aiCall(input,opts,true);return parseLoose(r.text)};
AI.limits=async()=>AI_LIMITS;
const FILES={save:async({filename,data})=>{
  const blob=data instanceof Blob?data:new Blob([data],{type:/\.html$/.test(filename)?'text/html':/\.csv$/.test(filename)?'text/csv':'text/plain'});
  const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  return {status:'saved'};
}};

/* gate screens */
const gateEl=document.getElementById('gate'),appEl=document.getElementById('appwrap');
const gcard=(title,body)=>'<div class="gate-card"><div class="brand"><svg viewBox="0 0 26 26" aria-hidden="true"><rect x="2" y="2" width="22" height="22" rx="4" fill="none" stroke="var(--ink)" stroke-width="2"/><path d="M7 9h12M7 13h12M7 17h7" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/></svg>Ledgerline</div><h2>'+title+'</h2>'+body+'</div>';
const gnote=m=>m?'<div class="note bad" role="alert">'+esc(m)+'</div>':'';
const gfield=(label,name,type,ac)=>`<label class="fld"><span>${label}</span><input name="${name}" type="${type}" autocomplete="${ac||'off'}" required></label>`;
const GATE={
  config:()=>gcard('Setup needed','<p>This app needs a Supabase project. Open <b>config.js</b>, add your project URL and anon key, then reload. See README.md.</p>'),
  loading:()=>gcard('Loading…','<p class="muted">One moment.</p>'),
  error:m=>gcard('Something went wrong',gnote(m)+'<div class="chips"><button class="btn" data-g="retry">Try again</button><button class="btn" data-g="signout">Sign out</button></div>'),
  signin:m=>gcard(gateMode==='signup'?'Create your account':'Sign in',
    '<p class="small muted">Your financial data is encrypted on your device with a passphrase only you know. The service stores scrambled data and cannot read it.</p>'+gnote(m)
    +`<form data-g="auth">${gfield('Email','email','email','email')}${gfield('Password','password','password',gateMode==='signup'?'new-password':'current-password')}<button class="btn primary" type="submit">${gateMode==='signup'?'Create account':'Sign in'}</button></form>`
    +'<p class="small"><button class="chip" data-g="mode">'+(gateMode==='signup'?'I already have an account':'Create an account')+'</button></p>'),
  create:m=>gcard('Choose your passphrase',
    '<p class="small muted">This passphrase locks your data. It is never sent to the server. <b>If you forget it and lose your recovery key, nobody can recover your data.</b> Use at least 10 characters, such as a few random words.</p>'+gnote(m)
    +`<form data-g="create">${gfield('Passphrase','p1','password','new-password')}${gfield('Repeat passphrase','p2','password','new-password')}<button class="btn primary" type="submit">Continue</button></form><p class="small"><button class="chip" data-g="signout">Sign out</button></p>`),
  reckey:m=>gcard('Save your recovery key',
    '<p class="small muted">This key is the only way back in if you forget your passphrase. Store it somewhere safe and private, apart from this device. It is shown once.</p>'+gnote(m)
    +`<p class="reckey num">${esc(pending&&pending.recKey)}</p><div class="chips"><button class="btn" data-g="copy-rec">Copy</button><button class="btn" data-g="save-rec">Save as a file</button></div><form data-g="reckey"><label class="chk"><input name="ok" type="checkbox" required><span>I have stored my recovery key safely</span></label><button class="btn primary" type="submit">Create my vault</button></form>`),
  unlock:m=>gcard('Unlock your data','<p class="small muted">Signed in as '+esc(authUser&&authUser.email||'')+'. Enter your passphrase to decrypt your data on this device.</p>'+gnote(m)
    +`<form data-g="unlock">${gfield('Passphrase','p1','password','current-password')}<button class="btn primary" type="submit">Unlock</button></form><div class="chips"><button class="chip" data-g="to-recover">Forgot passphrase? Use recovery key</button><button class="chip" data-g="signout">Sign out</button></div>`),
  restore:m=>{const d=new Date(vault.deleted_at),end=new Date(d.getTime()+30*864e5);return gcard('Your data was deleted','<p class="small muted">You deleted your cloud data on '+esc(d.toLocaleDateString())+'. It is kept until '+esc(end.toLocaleDateString())+', then permanently removed. You can restore it now.</p>'+gnote(m)+'<div class="chips"><button class="btn primary" data-g="restore-vault">Restore my data</button><button class="btn danger" data-g="purge-vault">Delete it now and start fresh</button><button class="chip" data-g="signout">Sign out</button></div>')},
  recover:m=>gcard('Use your recovery key','<p class="small muted">Enter the recovery key and choose a new passphrase.</p>'+gnote(m)
    +`<form data-g="recover">${gfield('Recovery key','rk','text','off')}${gfield('New passphrase','p1','password','new-password')}${gfield('Repeat new passphrase','p2','password','new-password')}<button class="btn primary" type="submit">Reset passphrase and unlock</button></form><p class="small"><button class="chip" data-g="to-unlock">Back</button></p>`)
};
function gate(view,msg){
  gateView=view;appEl.hidden=true;gateEl.hidden=false;gateEl.innerHTML=GATE[view](msg||'');
  const f=gateEl.querySelector('input');if(f&&view!=='reckey')f.focus();
}
async function afterAuth(){
  gate('loading');
  const r=await sb.from('vaults').select('*').eq('user_id',authUser.id).maybeSingle();
  if(r.error){gate('error',r.error.message||'Could not reach your vault.');return}
  vault=r.data;gate(vault?(vault.deleted_at?'restore':'unlock'):'create');
}
gateEl.addEventListener('submit',async e=>{
  e.preventDefault();
  const f=e.target,g=f.dataset.g,v={};new FormData(f).forEach((val,k)=>{v[k]=val});
  const btn=f.querySelector('button[type=submit]');if(btn){btn.disabled=true;btn.textContent='Working…'}
  try{
    if(g==='auth'){
      if(String(v.password).length<8)throw new Error('Use a password of at least 8 characters.');
      if(gateMode==='signup'){
        const r=await sb.auth.signUp({email:v.email,password:v.password});
        if(r.error)throw r.error;
        if(!r.data.session){gateMode='signin';gate('signin','Check your email to confirm your account, then sign in.');return}
        authUser=r.data.user;await afterAuth();
      }else{
        const r=await sb.auth.signInWithPassword({email:v.email,password:v.password});
        if(r.error)throw r.error;
        authUser=r.data.user;await afterAuth();
      }
    }else if(g==='create'){
      if(v.p1!==v.p2)throw new Error('The passphrases do not match.');
      if(String(v.p1).length<10)throw new Error('Use at least 10 characters.');
      pending=await prepareVault(v.p1);gate('reckey');
    }else if(g==='reckey'){
      const r=await sb.from('vaults').insert(pending.row);
      if(r.error)throw r.error;
      const raw=pending.raw;vault=Object.assign({},pending.row);pending=null;
      await openWith(raw);
    }else if(g==='unlock'){await unlockWith(v.p1)}
    else if(g==='recover'){
      if(v.p1!==v.p2)throw new Error('The passphrases do not match.');
      if(String(v.p1).length<10)throw new Error('Use at least 10 characters.');
      await recoverWith(v.rk,v.p1);
    }
  }catch(err){
    gate(g==='auth'?'signin':g==='reckey'?'reckey':g,(err&&err.message)||'Something went wrong.');
  }
});
gateEl.addEventListener('click',async e=>{
  const b=e.target.closest('[data-g]');if(!b||b.tagName==='FORM')return;
  const a=b.dataset.g;
  if(a==='mode'){gateMode=gateMode==='signup'?'signin':'signup';gate('signin')}
  else if(a==='signout'){try{await sb.auth.signOut()}catch(_){}authUser=null;pending=null;gate('signin')}
  else if(a==='restore-vault'){try{await updateVault({deleted_at:null});gate('unlock')}catch(err){gate('restore','Could not restore. Check your connection.')}}
  else if(a==='purge-vault'){try{const r=await sb.from('vaults').delete().eq('user_id',authUser.id);if(r.error)throw r.error;vault=null;gate('create')}catch(err){gate('restore','Could not delete. Check your connection.')}}
  else if(a==='to-recover')gate('recover');
  else if(a==='to-unlock')gate('unlock');
  else if(a==='retry'){if(authUser)afterAuth();else gate('signin')}
  else if(a==='copy-rec'){try{await navigator.clipboard.writeText(pending.recKey);b.textContent='Copied'}catch(_){b.textContent='Select and copy the key above'}}
  else if(a==='save-rec'){FILES.save({filename:'ledgerline-recovery-key.txt',data:'Ledgerline recovery key\n\n'+pending.recKey+'\n\nKeep this private. Anyone with this key and your account can unlock your data.\n'})}
});

/* boot */
async function boot(){
  CAPS_DONE=true;
  if(!CFG.SUPABASE_URL||!CFG.SUPABASE_ANON_KEY||!window.supabase){gate('config');return}
  sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  sb.auth.onAuthStateChange(ev=>{if(ev==='SIGNED_OUT'&&unlocked){lockApp(true)}});
  gate('loading');
  try{
    const s=(await sb.auth.getSession()).data.session;
    if(s){authUser=s.user;await afterAuth()}else gate('signin');
  }catch(e){gate('error',(e&&e.message)||'Could not start.')}
}
['click','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,bumpLock,{passive:true,capture:true}));
window.addEventListener('focus',checkRemote);
window.addEventListener('beforeunload',e=>{if(dirty&&unlocked){e.preventDefault();e.returnValue=''}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&dirty&&unlocked){clearTimeout(pushTimer);pushVault()}});

/* security card (Setup) */
function renderSecurity(){
  const st=S.settings;
  let h='<section class="card"><h2>Security and your account</h2><p class="small muted">Signed in as '+esc(authUser&&authUser.email||'')+'. Your data is encrypted on this device before it is saved, so the service and its administrator see only scrambled data. Reading documents and the advisers send the content you choose to an AI service through this app\'s server when you press a button. It is not stored.</p><div class="fields">'
    +fld('Lock after (minutes idle)','settings','x','lockMin',st.lockMin==null?15:st.lockMin,{opts:[['5','5'],['15','15'],['30','30'],['60','60'],['0','Never']]})+'</div>';
  if(UI.newRec)h+='<div class="note"><b>Your new recovery key. It replaces the old one and is shown once:</b><p class="reckey num">'+esc(UI.newRec)+'</p><button class="btn tiny" data-act="dismiss-rec">I have saved it</button></div>';
  h+='<h3>Change passphrase</h3><div class="fields"><label class="fld"><span>Current passphrase</span><input id="sec-cur" type="password" autocomplete="current-password"></label><label class="fld"><span>New passphrase</span><input id="sec-new" type="password" autocomplete="new-password"></label><label class="fld"><span>Repeat new passphrase</span><input id="sec-new2" type="password" autocomplete="new-password"></label><div class="fld"><span>&nbsp;</span><button class="btn" data-act="chg-pass">Change passphrase</button></div></div>';
  h+=UI.secMsg?'<div class="note'+(UI.secBad?' bad':'')+'">'+esc(UI.secMsg)+'</div>':'';
  h+='<div class="chips"><button class="btn'+(armed==='newrec'?' armed':'')+'" data-act="new-rec">'+(armed==='newrec'?'Confirm: replace my recovery key':'Make a new recovery key')+'</button><button class="btn danger" data-act="del-vault">Delete my cloud data</button></div>'+(armed==='delvault'?eraseBox('del-vault-confirm','Your encrypted cloud data is removed and you are signed out. It is kept for 30 days, so you can sign in and restore it. After 30 days it is permanently deleted.','Delete my cloud data'):'')+'</section>';
  return h;
}
async function changePass(){
  const cur=document.getElementById('sec-cur').value,n1=document.getElementById('sec-new').value,n2=document.getElementById('sec-new2').value;
  const say=(m,bad)=>{UI.secMsg=m;UI.secBad=!!bad;render()};
  if(n1!==n2)return say('The new passphrases do not match.',1);
  if(n1.length<10)return say('Use at least 10 characters.',1);
  try{
    const k=vault.kdf;
    try{await aesDec(await kdfKey(cur,unb64(k.salt),k.iter),vault.wrap_pass,aad())}catch(e){return say('The current passphrase is not right.',1)}
    const salt=rnd(16),pk=await kdfKey(n1,salt,KDF_ITER);
    await updateVault({kdf:{alg:'PBKDF2-SHA256',iter:KDF_ITER,salt:b64(salt)},wrap_pass:await aesEnc(pk,rawDK,aad())});
    logEvent('security','Passphrase changed','','');save();
    say('Passphrase changed. Use the new one next time you unlock.');
  }catch(e){say(e&&e.conflict?'Your data changed on another device. Reload and try again.':'Could not change the passphrase. Check your connection.',1)}
}
async function newRecoveryKey(){
  try{
    const recKey=makeRecoveryKey(),salt=rnd(16),rk=await kdfKey(recNorm(recKey),salt,REC_ITER);
    await updateVault({rec_salt:b64(salt),wrap_rec:await aesEnc(rk,rawDK,aad())});
    UI.newRec=recKey;logEvent('security','Recovery key replaced','','');save();
  }catch(e){UI.secMsg='Could not replace the recovery key.';UI.secBad=true}
  render();
}
async function deleteVault(){
  try{await updateVault({deleted_at:new Date().toISOString()})}
  catch(e){UI.secMsg='Could not delete. Check your connection.';UI.secBad=true;render();return}
  dirty=false;await lockApp(true);
}

function eraseBox(act,warn,label){
  return '<div class="note bad" role="alertdialog"><b>Warning</b><p>'+esc(warn)+'</p><label class="fld"><span>Enter your passphrase to confirm</span><input id="erase-pass" type="password" autocomplete="current-password"></label>'+(UI.eraseMsg?'<p>'+esc(UI.eraseMsg)+'</p>':'')+'<div class="chips"><button class="btn danger" data-act="'+act+'">'+esc(label)+'</button><button class="btn" data-act="erase-cancel">Cancel</button></div></div>';
}
async function checkPass(){
  const el=document.getElementById('erase-pass'),p=el&&el.value;
  if(!p){UI.eraseMsg='Enter your passphrase.';render();return false}
  try{const k=vault.kdf;await aesDec(await kdfKey(p,unb64(k.salt),k.iter),vault.wrap_pass,aad())}
  catch(e){UI.eraseMsg='That passphrase is not right. Nothing was erased.';render();return false}
  UI.eraseMsg='';armed=null;return true;
}
async function eraseAll(){
  if(!(await checkPass()))return;
  logEvent('erase','All data erased by the user (kept 30 days in Recently deleted)','','');
  trashPut('all',{income:S.income,expenses:S.expenses,loans:S.loans,goals:S.goals},'Everything erased');
  S.ai={};S.income=[];S.expenses=[];S.loans=[];S.goals=[];S.example=false;loanSel=null;save();render();
}
async function deleteVaultConfirmed(){if(await checkPass())deleteVault()}

/* ---------- 30-day recycle bin and selected deletion ---------- */
const TRASH_DAYS=30,TRASH_COLLS={income:'Income',expenses:'Spending',loans:'Loan',goals:'Savings goal'};
const trashName=(coll,it)=>(it&&(it.name||it.lender||it.title))||'Untitled';
function purgeTrash(){const lim=Date.now()-TRASH_DAYS*864e5;S.trash=(S.trash||[]).filter(t=>{const d=Date.parse(t.at);return d&&d>=lim})}
function trashPut(coll,item,label,parent){S.trash=S.trash||[];S.trash.push({id:uid(),coll,item:JSON.parse(JSON.stringify(item)),label,parent:parent||null,at:new Date().toISOString()})}
function trashOne(coll,id){
  const arr=S[coll]||[],i=arr.findIndex(x=>x.id===id);if(i<0)return;
  const it=arr[i];trashPut(coll,it,TRASH_COLLS[coll]+': '+trashName(coll,it));
  logEvent('delete',TRASH_COLLS[coll]+' '+trashName(coll,it)+' moved to Recently deleted','','');arr.splice(i,1);
}
function trashRec(inc,rid){
  const i=(inc.records||[]).findIndex(x=>x.id===rid);if(i<0)return;
  const r=inc.records[i];trashPut('record',r,'Pay record: '+inc.name+' '+(r.date||''),inc.id);
  logEvent('delete',inc.name+': pay record '+(r.date||'')+' moved to Recently deleted',r.net,'');inc.records.splice(i,1);
}
function restoreTrash(id){
  const t=(S.trash||[]).find(x=>x.id===id);if(!t)return;
  UI.trashMsg='';
  const fresh=(arr,it)=>{if(arr.some(x=>x.id===it.id))it.id=uid();arr.push(it)};
  if(t.coll==='all'){for(const k of Object.keys(TRASH_COLLS))(t.item[k]||[]).forEach(it=>fresh(S[k]=S[k]||[],it))}
  else if(t.coll==='record'){const inc=S.income.find(x=>x.id===t.parent);if(!inc){UI.trashMsg='Restore the income source first, then restore this record.';return}fresh(inc.records=inc.records||[],t.item)}
  else fresh(S[t.coll]=S[t.coll]||[],t.item);
  logEvent('restore',t.label+' restored','','');
  S.trash=S.trash.filter(x=>x.id!==id);
}
function trashDaysLeft(t){return Math.max(0,Math.ceil((Date.parse(t.at)+TRASH_DAYS*864e5-Date.now())/864e5))}
function renderDataManager(){
  UI.sel=UI.sel||{};const n=Object.keys(UI.sel).length;
  let h='<section class="card"><h2>Delete selected data</h2><p class="small muted">Tick the items to remove. Deleted items are kept for '+TRASH_DAYS+' days in Recently deleted, where you can restore them.</p>';
  let any=false;
  for(const k of Object.keys(TRASH_COLLS)){
    const arr=S[k]||[];if(!arr.length)continue;any=true;
    h+='<h3>'+TRASH_COLLS[k]+'</h3><div class="chips">'+arr.map(it=>'<label class="chk"><input type="checkbox" data-act="sel:'+k+':'+it.id+'"'+(UI.sel[k+':'+it.id]?' checked':'')+'><span>'+esc(trashName(k,it))+'</span></label>').join('')+'</div>';
  }
  if(!any)h+='<p class="muted">Nothing to delete.</p>';
  h+='<div class="chips"><button class="btn danger" data-act="sel-delete"'+(n?'':' disabled')+'>Delete selected ('+n+')</button></div>';
  if(armed==='sel'&&n)h+=eraseBox('sel-confirm','You are about to delete '+n+' selected item'+(n===1?'':'s')+'. They move to Recently deleted for '+TRASH_DAYS+' days.','Delete selected');
  h+='</section>';
  const tr=S.trash||[];
  h+='<section class="card"><h2>Recently deleted</h2><p class="small muted">Kept for '+TRASH_DAYS+' days, then removed for good.</p>'+(UI.trashMsg?'<div class="note bad">'+esc(UI.trashMsg)+'</div>':'');
  if(!tr.length)h+='<p class="muted">Nothing here.</p>';
  else h+='<div class="scroll"><table><thead><tr><th>Item</th><th>Deleted</th><th>Days left</th><th></th></tr></thead><tbody>'+tr.slice().reverse().map(t=>'<tr><td>'+esc(t.label)+'</td><td>'+esc(String(t.at).slice(0,10))+'</td><td class="num">'+trashDaysLeft(t)+'</td><td><button class="btn tiny" data-act="trash-restore:'+t.id+'">Restore</button> <button class="btn tiny danger'+(armed==='tp:'+t.id?' armed':'')+'" data-act="trash-purge:'+t.id+'">'+(armed==='tp:'+t.id?'Confirm: delete for good':'Delete for good')+'</button></td></tr>').join('')+'</tbody></table></div>';
  return h+'</section>';
}
async function deleteSelected(){
  if(!(await checkPass()))return;
  const keys=Object.keys(UI.sel||{});
  for(const k of keys){const [coll,id]=k.split(':');trashOne(coll,id)}
  UI.sel={};save();render();
}

/* ---------- payslip reader without AI (rules; used when the AI is unavailable) ---------- */
const LP_MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const lp2=n=>String(n).padStart(2,'0');
const LP_DATE_G=/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}(?:st|nd|rd|th)?[ \-][A-Za-z]{3}[a-z]*[ \-,]+\d{4}\b/g;
function lpDate(s){
  let m;
  if((m=s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)))return m[0];
  if((m=s.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/))){let d=+m[1],mo=+m[2],y=+m[3];if(y<100)y+=2000;if(mo>12&&d<=12){const t=d;d=mo;mo=t}if(mo<1||mo>12||d<1||d>31)return '';return y+'-'+lp2(mo)+'-'+lp2(d)}
  if((m=s.match(/\b(\d{1,2})(?:st|nd|rd|th)?[ \-]([A-Za-z]{3})[a-z]*[ \-,]+(\d{4})\b/))){const mo=LP_MON[m[2].toLowerCase()];if(mo)return m[3]+'-'+lp2(mo)+'-'+lp2(+m[1])}
  return '';
}
function lpAmounts(s){
  s=s.replace(LP_DATE_G,' ');const out=[];const re=/\(?-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\)?/g;let m;
  while((m=re.exec(s))){const v=Math.abs(parseFloat(m[0].replace(/[(),]/g,'')));if(Number.isFinite(v))out.push({v,dec:/\.\d{1,2}\)?$/.test(m[0]),idx:m.index})}
  return out;
}
function lpFirst(s,from){const a=lpAmounts(s.slice(from||0)).filter(x=>x.v>0);return a.length?(a.find(x=>x.dec)||a[0]).v:null}
const LP_YTD=/\bytd\b|year[\s-]*to[\s-]*date|cumulative/i;
const LP_GROSS=/gross\s*(pay|salary|earnings|wages|income|amount)?|total\s*(earnings|gross|income|pay)\b/i;
const LP_NET=/\b(net|nett)\s*(pay|salary|wages|amount|income|paid)?\b|take[\s-]*home|amount\s*(paid|payable)/i;
const LP_TOTDED=/total\s*deductions?|deductions?\s*total/i;
const LP_DEDW=/tax|paye|wht|withhold|super|nasfund|nambawan|pension|retire|provident|loan|advance|repay|insurance|medical|health|union|levy|fund|savings|credit union|sacrifice|garnish|child support|uniform|deduction/i;
const LP_NOTDED=/taxable|before tax|pre-?tax|tax[\s-]*free|tax code|tax file|total|gross|net\b|nett|ytd|balance|outstanding|remaining|limit|\brate\b|employer contribution|entitle/i;
const LP_EARN=/allowance|bonus|overtime|salary|wage|earning|commission|reimburs|leave|entitle|basic|pay\b/i;
function lpLabel(line){const m=line.match(/[-\d(]/);const t=(m&&line.search(/\(?-?\d/)>0?line.slice(0,line.search(/\(?-?\d/)):line).replace(/[:.\-_\s]+$/,'').replace(/\s{2,}/g,' ').replace(/\s+(K|PGK|AUD|USD|NZD|\$)$/i,'').trim();return t.slice(0,60)}
function localPayslip(text){
  const lines=String(text).split(/\n/).map(x=>x.replace(/\t/g,'  ').trim()).filter(Boolean);
  let gross=null,net=null,totDed=null,inDed=false,pay='',anyDate='',freq=null,source='';
  const deds=[],seen=new Set();
  for(let i=0;i<lines.length;i++){
    const ln=lines[i],low=ln.toLowerCase(),ytd=LP_YTD.test(ln);
    if(!anyDate){const d=lpDate(ln);if(d)anyDate=d}
    if(!pay&&/pay\s*date|date\s*paid|payment\s*date|paid\s*on|period\s*end|pay\s*period|period\s*ending|pay\s*day/i.test(ln)){const ds=ln.match(LP_DATE_G)||[];if(ds.length){const d=lpDate(ds[ds.length-1]);if(d)pay=d}}
    if(!freq){if(/fortnight|bi-?weekly|every two weeks/i.test(ln))freq='fortnight';else if(/\bweekly\b|per week/i.test(ln))freq='week';else if(/monthly|per month/i.test(ln))freq='month'}
    if(!source){const m=ln.match(/(?:employer|company|organi[sz]ation|department|payer)\s*(?:name)?\s*[:\-]\s*(.+)/i);if(m)source=m[1].replace(/\s{2,}.*/,'').trim().slice(0,60)}
    if(ytd)continue;
    if(LP_TOTDED.test(ln)){const v=lpFirst(ln);if(v!=null&&totDed==null)totDed=v;inDed=false;continue}
    if(/^\W*(statutory |other |voluntary |employee )?deductions?\W*$/i.test(ln.replace(/\s{2,}/g,' '))){inDed=true;continue}
    if(/^\W*(earnings|income|payments|allowances|entitlements|leave|employer contributions?)\W*$/i.test(ln)){inDed=false;continue}
    const netM=LP_NET.test(ln)&&!/tax/i.test(ln);
    if(netM){const v=lpFirst(ln,ln.search(LP_NET));if(v!=null&&net==null)net=v;inDed=false;continue}
    if(LP_GROSS.test(ln)&&!/tax/i.test(ln)){const v=lpFirst(ln,ln.search(LP_GROSS));if(v!=null&&gross==null)gross=v;continue}
    const amt=lpFirst(ln,Math.max(0,ln.search(/\(?-?\d/)));
    if(amt==null)continue;
    const label=lpLabel(ln);if(!label||!/[A-Za-z]{3}/.test(label))continue;
    if(LP_NOTDED.test(label))continue;
    if(inDed||(LP_DEDW.test(label)&&!LP_EARN.test(label))){const k=label.toLowerCase()+'|'+amt;if(!seen.has(k)){seen.add(k);deds.push({label,amount:amt})}}
  }
  if(gross==null&&net!=null&&totDed!=null)gross=Math.round((net+totDed)*100)/100;
  if(gross==null&&net==null)return null;
  if(!source){const f=lines.find(l=>/[A-Za-z]{3}/.test(l)&&!/\d/.test(l)&&!/pay\s*slip|payslip|statement|remuneration|advice/i.test(l)&&l.length<=60);source=f||'Salary'}
  const flags=[],sum=deds.reduce((a,d)=>a+d.amount,0);
  if(totDed!=null&&Math.abs(sum-totDed)>1)flags.push({severity:'medium',text:'The deduction lines found add to '+sum.toFixed(2)+' but the payslip says total deductions are '+totDed.toFixed(2)+'. Some lines may be missing or extra.'});
  else if(gross!=null&&net!=null&&Math.abs(gross-sum-net)>1)flags.push({severity:'medium',text:'Gross pay minus the deductions found does not equal net pay. Some deduction lines may be missing or extra.'});
  return {source,type:'salary',payDate:pay||anyDate||'',frequency:freq,gross:gross!=null?gross:net,net:net,deductions:deds,disbursements:[],_flags:flags};
}
function localPayslips(texts){
  const payslips=[],flags=[];
  for(const t of texts){const p=localPayslip(t);if(p){(p._flags||[]).forEach(f=>flags.push(f));delete p._flags;payslips.push(p)}}
  return {payslips,flags};
}
