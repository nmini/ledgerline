import re
src=open('src/base.html').read()
cloud=open('src/cloud.js').read()
cloud=re.sub(r'\bpending\b','pendV',cloud)
def rep(a,b,count=1,must=True):
    global src
    if a not in src:
        if must: raise SystemExit('missing: '+a[:60])
        return
    src=src.replace(a,b) if count==0 else src.replace(a,b,count)
# head
rep('<meta name="claude:viewport-fit-sides" content="cover">','<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'unsafe-inline\' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src \'self\' data: blob:; connect-src \'self\' https://*.supabase.co wss://*.supabase.co https://cdnjs.cloudflare.com; worker-src \'self\' blob: https://cdnjs.cloudflare.com; frame-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">')
rep('</style>','''.gate{min-height:100vh;display:grid;place-items:center;padding:16px}
.gate[hidden],#appwrap[hidden]{display:none}
.gate-card{width:100%;max-width:420px;background:var(--card,#fff);border:1px solid var(--line,#ddd);border-radius:12px;padding:24px;display:grid;gap:12px}
.gate-card form{display:grid;gap:12px}
.gate-card .brand{margin-bottom:4px}
.reckey{font-family:'IBM Plex Mono',monospace;font-size:1.05rem;letter-spacing:.04em;word-break:break-all;padding:10px;border:1px dashed var(--line,#999);border-radius:8px;user-select:all}
.chk{display:flex;gap:8px;align-items:flex-start}
#acct{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.top{gap:12px;flex-wrap:wrap}
</style>''')
rep('<div class="app">','<div id="gate" class="gate" hidden></div>\n<div id="appwrap" hidden>\n<div class="app">')
rep('<div class="seg" id="viewseg" role="group" aria-label="Budget period"></div>','<div class="seg" id="viewseg" role="group" aria-label="Budget period"></div>\n    <div id="acct"></div>')
rep('Data stays in this browser; use Setup to back it up. Contract reading and the AI advisers send only what you choose to Claude, on your own account, when you press a button; contract images and text are not kept.</footer>\n</div>','Your data is encrypted on your device before it is saved. Contract reading and the AI advisers send only what you choose to an AI service, through this app\'s server, when you press a button; contract images and text are not kept.</footer>\n</div>\n</div>\n<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>\n<script src="config.js"></script>')
# persistence
src=re.sub(r"function load\(\)\{try\{const s=localStorage.*?\nlet S=load\(\);\nfunction save\(\)\{[^\n]*\n","let S=normState({v:1,settings:{currency:'PGK',view:'fortnight',profile:'family',household:1,needsPct:50,wantsPct:30,savePct:20},income:[],expenses:[],loans:[],goals:[]});\n",src,flags=re.S)
assert "localStorage.getItem(KEY)" not in src
# tail
i=src.index("render();\n(async()=>{\n  const cl=window.claude;")
src=src[:i]+"renderAcct&&0;\n"+cloud+"\nboot();\n</script>\n"
src=src.replace("renderAcct&&0;\n","")
# security card
rep("  h+='<section class=\"card\"><h2>Reset</h2>","  h+=renderSecurity();\n  h+='<section class=\"card\"><h2>Reset</h2>")
# click cases
rep("    case 'dsec':dashSec=arg;break;","""    case 'dsec':dashSec=arg;break;
    case 'lock':lockApp(false);return;
    case 'signout':lockApp(true);return;
    case 'conf-load':loadRemote().then(()=>{syncState='saved';dirty=false;render();renderAcct()}).catch(()=>{});return;
    case 'conf-over':vault.rev=vault.rev;sb.from('vaults').select('rev').eq('user_id',authUser.id).maybeSingle().then(r=>{if(r.data){vault.rev=r.data.rev;syncState='pending';dirty=true;pushVault()}});return;
    case 'dismiss-rec':UI.newRec=null;break;
    case 'chg-pass':changePass();return;
    case 'new-rec':if(armed==='newrec'){armed=null;newRecoveryKey();return}armed='newrec';break;
    case 'del-vault':armed='delvault';UI.eraseMsg='';break;
    case 'del-vault-confirm':deleteVaultConfirmed();return;
    case 'clear-all':armed='all';UI.eraseMsg='';break;
    case 'clear-all-confirm':eraseAll();return;
    case 'erase-cancel':armed=null;UI.eraseMsg='';break;""")
rep("'del-goal','convert-all'","'del-goal','convert-all','new-rec','del-vault','clear-all'")
rep("<button class=\"btn danger'+(armed==='all'?' armed':'')+'\" data-act=\"clear-all\">'+(armed==='all'?'Confirm: erase everything':'Erase everything')+'</button></div></section>';","<button class=\"btn danger\" data-act=\"clear-all\">Erase everything</button></div>'+(armed==='all'?eraseBox('clear-all-confirm','This permanently erases all your income, spending, loans and savings goals. It cannot be undone. Use Setup backup first if you may need them.','Erase everything'):'')+'</section>';")
# strings
src=re.sub(r"Advisers run on your own Claude account.*?without them\.","Advisers use a daily AI allowance and send only what you choose. Everything else works without them.",src,flags=re.S)
src=src.replace('inside Claude','in this app').replace('Claude allowance','daily AI allowance')
src=src.replace("'Claude was not allowed to read the contract. Allow it when asked, or use \"Type terms in\".'","'AI reading is not available right now. Try again later or use \"Type terms in\".'")
src=src.replace("'Claude was not allowed to run. Allow it when asked to use the advisers.'","'The advisers are not available right now. Try again later.'")
src=src.replace("Your data lives only in this browser. Copy the backup text into a note or email to yourself, and paste it below on any device to restore.","Your data is saved encrypted to your account and opens on any device you sign in on. You can also keep a backup text here.")
src=src.replace("Sign in to Claude again, then","Sign in again, then")
src=re.sub(r"(?<=[.>'\"] )Claude ",'The AI ',src)
src=re.sub(r"(?<=[.>'\"])Claude ",'The AI ',src)
src=src.replace('Claude','the AI')
src=src.replace('. the AI','. The AI')
open('index.html','w').write(src)
print(len(src),'Claude' in src, [m.start() for m in re.finditer('Claude',src)][:5])
