// CityPulse copilot: deterministic analytical agent over live snapshots.
//
// Why deterministic-first: every answer is computed from the actual vehicle data
// in the browser — no key, no hallucination, reproducible. An optional
// LLM key (localStorage) upgrades open-ended questions only.
export function createCopilot(getData) {
  const chat = document.getElementById('chat');
  const keyInput = document.getElementById('llm-key');
  keyInput.value = localStorage.getItem('citypulse_llm_key') || '';
  document.getElementById('llm-save').onclick = () => {
    localStorage.setItem('citypulse_llm_key', keyInput.value.trim());
    say('Key saved in this browser only. Open-ended questions now use the LLM; analytics still run on live data.');
    document.getElementById('agent-mode').textContent =
      keyInput.value.trim() ? 'analyst + llm' : 'analyst';
  };
  if (keyInput.value.trim()) document.getElementById('agent-mode').textContent = 'analyst + llm';

  function say(html, cls='bot'){ const d=document.createElement('div'); d.className='msg '+cls; d.innerHTML=html; chat.appendChild(d); chat.scrollTop=chat.scrollHeight; }
  const esc = s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const rows = v => v.flatMap(c=>c.vehicles.map(x=>({...x, _city:c.name})));

  async function ask(q){
    say(esc(q),'user');
    const data = getData();
    if(!data.length){ say('No data loaded yet — the feed snapshot is still arriving. Try again in a few seconds.'); return; }
    const ql=q.toLowerCase();
    try{
      if(/brief/.test(ql)) return brief(data);
      if(/crowd|full|pack|busiest/.test(ql)) return crowded(data);
      if(/how many|count|running|active/.test(ql)) return counts(data);
      const m=ql.match(/route\s+([a-z0-9\-]+)/);
      if(m) return routeStatus(data,m[1]);
      if(/delay|late|on time|ontime/.test(ql)) return delays(data);
      if(/help|what can you/.test(ql)) return help();
      const key=localStorage.getItem('citypulse_llm_key');
      if(key) return llmAnswer(key,q,data);
      return say(`I can answer from live data — try:<br>• "Which routes are most crowded?"<br>• "How many vehicles are running?"<br>• "Route 87 status"<br>• "Generate a rush-hour brief"<br><br>Add an LLM key below for open-ended questions.`);
    }catch(e){ say('Hmm, that query hit a snag: '+esc(e.message)); }
  }

  function counts(data){
    const all=rows(data);
    const byCity=data.map(c=>`${c.name}: <b>${c.stats.vehicles}</b>`).join(' · ');
    say(`<b>${all.length}</b> vehicles reporting live right now.<br>${byCity}`);
  }

  function crowded(data){
    const byRoute={};
    for(const v of rows(data)){
      if(v.occupancy_pct==null) continue;
      const k=`${v._city} · ${v.route_label||'?'}`;
      (byRoute[k]=byRoute[k]||{n:0,sum:0,full:0});
      byRoute[k].n++; byRoute[k].sum+=v.occupancy_pct;
      if(v.occupancy_pct>=80) byRoute[k].full++;
    }
    const top=Object.entries(byRoute).filter(([,r])=>r.n>=3)
      .sort((a,b)=>b[1].sum/b[1].n-a[1].sum/a[1].n).slice(0,8);
    if(!top.length) return say('Not enough occupancy data right now.');
    let h='<b>Most crowded routes</b> (avg fill, vehicles sampled):<table><tr><th>Route</th><th>Avg fill</th><th>Packed</th></tr>';
    for(const [k,r] of top) h+=`<tr><td>${esc(k)}</td><td>${Math.round(r.sum/r.n)}%</td><td>${r.full}/${r.n}</td></tr>`;
    say(h+'</table>');
  }

  function routeStatus(data,rid){
    const all=rows(data).filter(v=>(v.route_label||'').toLowerCase()===rid);
    if(!all.length){
      const near=[...new Set(rows(data).map(v=>v.route_label).filter(Boolean))].slice(0,12).join(', ');
      return say(`No live vehicles on route "<b>${esc(rid)}</b>" right now. Active routes include: ${esc(near)}…`);
    }
    const pcts=all.map(v=>v.occupancy_pct).filter(x=>x!=null);
    const avg=pcts.length?Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length):null;
    const full=all.filter(v=>(v.occupancy_pct||0)>=80).length;
    say(`<b>Route ${esc(rid)}</b>: ${all.length} vehicles live${avg!=null?`, avg fill ${avg}%`:''}, ${full} packed. `+
      (full>all.length/2?'⚠️ over half the fleet is packed — consider added frequency.':'Load looks manageable.'));
  }

  function delays(){
    say('Delays vs schedule aren\'t published in these agencies\' GTFS-realtime feeds — showing them would be guessing, so I don\'t. Vehicle positions, occupancy and speed are live.');
  }
  function help(){ say('Ask me things like:<br>• "How many vehicles are running?"<br>• "Which routes are most crowded?"<br>• "Route 15 status"<br>• "Generate a rush-hour brief"'); }

  function brief(data){
    const all=rows(data);
    const ts=new Date().toISOString();
    const byRoute={};
    for(const v of all){ if(v.occupancy_pct==null) continue;
      const k=`${v._city} — ${v.route_label||'?'}`;
      (byRoute[k]=byRoute[k]||{n:0,sum:0,full:0}); byRoute[k].n++; byRoute[k].sum+=v.occupancy_pct;
      if(v.occupancy_pct>=80) byRoute[k].full++; }
    const ranked=Object.entries(byRoute).filter(([,r])=>r.n>=3)
      .sort((a,b)=>b[1].sum/b[1].n-a[1].sum/a[1].n);
    const hot=ranked.slice(0,5), calm=ranked.slice(-3).reverse();
    const md=
`# CityPulse Network Brief — ${ts}
_Snapshot of live GTFS-realtime vehicle positions._

## Headline KPIs
- **${all.length}** vehicles live across **${data.length}** cities
- **${data.reduce((a,c)=>a+c.stats.routes_active,0)}** routes active
- **${all.filter(v=>(v.occupancy_pct||0)>=80).length}** vehicles packed (≥80% full)

## Crowding hotspots
${hot.map(([k,r])=>`- **${k}**: ${Math.round(r.sum/r.n)}% avg fill (${r.full}/${r.n} packed)`).join('\n')||'- n/a'}

## Running smooth
${calm.map(([k,r])=>`- **${k}**: ${Math.round(r.sum/r.n)}% avg fill`).join('\n')||'- n/a'}

## Takeaways
- Add frequency first where packed share is highest — riders feel crowding before schedules.
- Delays vs schedule are not published by these feeds; crowding is the honest real-time signal.
`;
    const blob=new Blob([md],{type:'text/markdown'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download='citypulse-brief.md'; a.click();
    let h=`<b>Rush-hour brief generated</b> — downloaded as markdown.<br><br><b>Hotspots:</b><br>${hot.map(([k,r])=>`• ${esc(k)} — ${Math.round(r.sum/r.n)}% avg`).join('<br>')||'n/a'}`;
    say(h);
  }

  async function llmAnswer(key,q,data){
    say('Consulting the LLM with live context…');
    const ctx=data.map(c=>`${c.name}: ${c.stats.vehicles} vehicles, ${c.stats.routes_active} routes`).join('; ');
    try{
      const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
        body:JSON.stringify({model:'gpt-4o-mini',messages:[
          {role:'system',content:`You are CityPulse, a transit analyst. Live context: ${ctx}. Fetched ${data[0]?.fetched_at||'unknown'}. Be concise, cite numbers.`},
          {role:'user',content:q}]})});
      const j=await r.json();
      say(esc(j.choices?.[0]?.message?.content||'The LLM returned nothing usable.'));
    }catch(e){ say('LLM call failed ('+esc(e.message)+'). The built-in analyst still works — ask about crowding, counts, or a brief.'); }
  }

  document.getElementById('chat-form').addEventListener('submit',e=>{e.preventDefault();
    const inp=document.getElementById('chat-input'); const q=inp.value.trim(); inp.value=''; if(q) ask(q);});
  document.querySelectorAll('.quick button').forEach(b=>b.onclick=()=>ask(b.dataset.q));
  setTimeout(()=>say('👋 I\'m watching <b>live buses</b> in Boston and Denver. Ask me which routes are crowded, or hit <b>rush-hour brief</b>.'),600);
  return {ask};
}
