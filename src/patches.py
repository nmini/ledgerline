rep(r'''const imgs=[],texts=[];let pages=0,capped=false;''', r'''const imgs=[],texts=[],lines=[];let pages=0,capped=false;''')
rep("        if(t.length>=80)texts.push('[Page '+pages+' of '+f.name+']\\n'+t);",
r'''        if(t.length>=80){texts.push('[Page '+pages+' of '+f.name+']\n'+t);const bk=new Map();for(const it of tc.items){if(!it.str||!it.str.trim())continue;const y=Math.round((it.transform?it.transform[5]:0)/3);(bk.get(y)||bk.set(y,[]).get(y)).push(it)}lines.push([...bk.keys()].sort((a,b)=>b-a).map(y=>bk.get(y).sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str.trim()).join('  ')).join('\n'))}''')
rep(r'''return {imgs,texts,pages,capped};''', r'''return {imgs,texts,lines,pages,capped};''')
rep(r'''      outs.push(await SAMPLE.json(prompt,o2));
      if(UI.inc!==st||ctl.signal.aborted)return;''', r'''      try{outs.push(await SAMPLE.json(prompt,o2))}
      catch(err){
        if(err&&err.code==='cancelled')throw err;
        const lt=prep.lines.concat(text?[text]:[]);
        if(kind==='payslip'&&!imgs.length&&lt.length){
          const lo=localPayslips(lt);
          if(lo.payslips.length){lo.flags.unshift({severity:'high',text:'Read by simple rules, not AI ('+((err&&err.code)||'AI unavailable')+'). Check every figure against the payslip before saving. Bank payments are not read this way.'});outs.push(lo);continue}
        }
        throw err;
      }
      if(UI.inc!==st||ctl.signal.aborted)return;''')
rep(r'''Reading the contract failed. Try again, or use "Type terms in".''', r'''Reading failed. Try again, or enter the details by hand.''')
rep(r'''const UI={intake:null,''', r'''const UI={ver:{},intake:null,''')
rep("  if(st.status==='review'){\n    const R=st.result,opts=[['new','Add as new income']]", "  if(st.status==='review')return h+renderIncReview(st);\n  if(false){\n    const R=st.result,opts=[['new','Add as new income']]")
rep("  st.result.groups.filter(g=>g.on).forEach(g=>{\n    const rows=g.deds.map(", "  st.result.groups.filter(g=>g.on).forEach(g=>{\n    deriveGroup(g);\n    const rows=g.deds.map(")
rep("    case 'inc-apply':applyIncome();break;","    case 'inc-apply':if(!verGate(incRecIds(),'every payslip or deposit'))break;applyIncome();break;")
rep("    case 'stmt-apply':applyStatement();break;","    case 'stmt-apply':if(!verGate(['stmt'],'the statement figures'))break;applyStatement();break;")
rep("    case 'confirm-intake':{const I=UI.intake;if(!I||!I.loan)break;","    case 'confirm-intake':{const I=UI.intake;if(!I||!I.loan)break;if(!verGate(['intake'],'the contract figures'))break;")
rep("return h+'<div class=\"chips\"><button class=\"btn primary\" data-act=\"confirm-intake\"'","return h+verBox('intake','Checked: I have compared every figure above with the original contract')+verMsgHtml()+'<div class=\"chips\"><button class=\"btn primary\" data-act=\"confirm-intake\"'")
rep("return h+'<p class=\"small muted\">Applying replaces any logged payments inside the statement dates","return h+verBox('stmt','Checked: I have compared every figure above with the lender statement')+verMsgHtml()+'<p class=\"small muted\">Applying replaces any logged payments inside the statement dates")
rep("  if(d.coll==='recn'){const nw=UI.recNew","""  if(d.coll==='incr'||d.coll==='incrd'||d.coll==='incrb'){const rec=findIncRec(d.id);if(!rec)return;delete UI.ver[rec.id];UI.verMsg='';
    if(d.coll==='incr')rec[d.f]=v;
    else{const arr=d.coll==='incrd'?rec.deds:rec.disb,e=arr&&arr[+d.did];if(!e)return;e[d.f]=v}
    later();return}
  if(d.coll==='intake'){delete UI.ver.intake;UI.verMsg=''}
  if(d.coll==='stmt'){delete UI.ver.stmt;UI.verMsg=''}
  if(d.coll==='recn'){const nw=UI.recNew""")
rep("    case 'dsec':dashSec=arg;break;","""    case 'dsec':dashSec=arg;break;
    case 'ver':UI.ver[arg]=!UI.ver[arg];UI.verMsg='';break;
    case 'incr-addd':{const r=findIncRec(arg);if(r){(r.deds=r.deds||[]).push({label:'',amount:0});delete UI.ver[r.id]}break}
    case 'incr-deld':{const r=findIncRec(arg);if(r&&r.deds){r.deds.splice(+arg2,1);delete UI.ver[r.id]}break}
    case 'incr-addb':{const r=findIncRec(arg);if(r){(r.disb=r.disb||[]).push({payee:'',amount:0,purpose:''});delete UI.ver[r.id]}break}
    case 'incr-delb':{const r=findIncRec(arg);if(r&&r.disb){r.disb.splice(+arg2,1);delete UI.ver[r.id]}break}
    case 'incr-delrec':{for(const g of ((UI.inc&&UI.inc.result&&UI.inc.result.groups)||[])){const i=g.records.findIndex(x=>x.id===arg);if(i>=0){g.records.splice(i,1);break}}break}""")
rep("d.coll==='incl'||d.coll==='recf'){later();return}","d.coll==='incl'||d.coll==='recf'||d.coll==='incr'){later();return}",must=False)
rep("      h+='<div class=\"row\">'+fld('What is taken off','ded',i.id,'kind',d.kind,{t:'text',opts:opts.map(k=>[k,k]),did:d.id})","      h+='<div class=\"row\">'+fld('What is taken off','ded',i.id,'kind',d.kind,{t:'text',opts:opts.map(k=>[k,k]),did:d.id})\n        +fld('Description (e.g. NBC Home Loan)','ded',i.id,'label',d.label||'',{t:'text',did:d.id,ph:d.kind==='Other deduction'?'Type a name':'Optional name'})")
rep("dk[d.kind]=(dk[d.kind]||0)+a}));","dk[dedName(d)]=(dk[dedName(d)]||0)+a}));")
rep("(i.deductions||[]).map(d=>esc(d.kind)+' '+(d.mode==='pct'","(i.deductions||[]).map(d=>esc(dedName(d))+' '+(d.mode==='pct'")
rep("out.push(line([i.name,d.kind,d.mode==='pct'","out.push(line([i.name,dedName(d),d.mode==='pct'")
rep(":(i.deductions||[]).map(d=>d.kind)})),",":(i.deductions||[]).map(d=>dedName(d))})),")
rep("mode:'amt',value:d.amount,freq:g.freq,_k:'d:'+normKey(d.label)}","mode:'amt',value:d.amount,freq:g.freq,label:d.label,_k:'d:'+normKey(d.label)}")
rep("const median=a=>","const dedName=d=>(d.kind==='Other deduction'&&String(d.label||'').trim())?String(d.label).trim():(String(d.label||'').trim()&&String(d.label).trim()!==d.kind?d.kind+': '+String(d.label).trim():d.kind);\nconst median=a=>")
_s=src.index("    h+='<div class=\"deds\">")
_e=src.index("+recordsHtml(i)+'</div>';",_s)+len("+recordsHtml(i)+'</div>';")
src=src[:_s]+"    h+=renderDeds(i,kinds,per,net,ded)+recordsHtml(i)+'</div>';"+src[_e:]
rep("</style>",".subtable{margin-top:12px;border-top:1px solid var(--line,#ddd);padding-top:8px}.subt{min-width:720px}.subt td,.subt th{padding:4px 6px;vertical-align:middle}.subt .fld{margin:0}.subt .fld>span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.subt input,.subt select{width:100%;min-width:90px}.subt tfoot th{text-align:left}\n</style>")
rep("if(['salary','property','business','other'].indexOf(i.type)<0)i.type='salary';","if(['salary','allowance','property','business','investment','other'].indexOf(i.type)<0)i.type='salary';")
rep("const INCOME_TYPES=[['salary','Salary or wages'],['property','Property or rental income'],['business','Business or self-employment'],['other','Other (allowance, support, investments)']];","const INCOME_TYPES=[['salary','Salary or wages'],['allowance','Allowances and benefits'],['property','Property or rental income'],['business','Business or self-employment'],['investment','Interest, dividends or royalties'],['other','Other (support, gifts, other)']];")
rep("  salary:['Income tax (PAYE)','Pension or superannuation','Health insurance','Union or professional fees','Salary-deducted loan repayment','Other deduction'],","  salary:['Income tax (PAYE)','Pension or superannuation','Health insurance','Union or professional fees','Salary-deducted loan repayment','Staff savings or credit union','Housing or rent recovery','Other deduction'],\n  allowance:['Income tax (PAYE)','Other deduction'],\n  investment:['Withholding tax (interest or dividends)','Bank or management fees','Other deduction'],")
rep("const DED_HINT={salary:","const DED_HINT={allowance:'Cash allowances are usually taxed with your pay. Enter any tax taken off.',investment:'Interest and dividends often have tax withheld before you receive them. Enter what is taken off.',salary:")
rep("  const types=['salary','property','business','other'];","  const types=['salary','allowance','property','business','investment','other'];")
rep("  if(/pension|super|nasfund","  if(/credit union|co-?op|savings (club|scheme|society)/.test(l))return pick('Staff savings or credit union')||String(label).slice(0,60);\n  if(/housing|rent recovery|quarters/.test(l))return pick('Housing or rent recovery')||String(label).slice(0,60);\n  if(/withholding|dividend|interest/.test(l)&&pick('Withholding tax (interest or dividends)'))return 'Withholding tax (interest or dividends)';\n  if(/pension|super|nasfund")
rep("    case 'dsec':dashSec=arg;break;","    case 'dsec':dashSec=arg;break;\n    case 'add-png':addPngStd(arg);break;")
rep("  return h+'<div class=\"chips\">'+kinds.map","  return h+'<div class=\"chips\">'+kinds.map",must=False)
