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
