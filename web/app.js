// CityPulse app: data loading, KPIs, globe <-> city view switching, refresh.
import {createGlobe} from './globe.js';
import {createCityView, vehicleCardHTML} from './city.js';
import {createCopilot} from './copilot.js';

const REFRESH_MS = 15000;
let cities=[], snapshots=[], globeApi=null, cityApi=null, currentCity=null;
// Data lives at repo-root /data; resolve relative to this module so the app
// works served from repo root, web/, or a GitHub Pages subpath.
const dataURL = p => new URL('../data/'+p, import.meta.url).href;

async function loadCitySnapshot(c){
  try{ const r=await fetch(dataURL(`live/${c.id}.json`));
    if(r.ok) return await r.json();
  }catch(_){/* fall through to sharded form */}
  // Large cities are sharded: data/live/<city>/part-0.json, part-1.json, ...
  // (see etl/fetch_feeds.py SHARD_BYTES). Merge parts in filename order.
  const parts=[];
  for(let i=0;i<32;i++){
    try{ const r=await fetch(dataURL(`live/${c.id}/part-${i}.json`));
      if(!r.ok) break; parts.push(await r.json());
    }catch(_){ break; }
  }
  if(!parts.length) return null;
  return {...parts[0], vehicles:parts.flatMap(p=>p.vehicles)};
}

async function load(){
  cities=(await (await fetch(dataURL('cities.json'))).json()).cities;
  const results=await Promise.all(cities.map(c=>loadCitySnapshot(c)));
  snapshots=results.filter(Boolean).map(s=>{
    const c=cities.find(c=>c.id===s.city);
    return {...s, name:c?c.name:s.city};
  });
}

function ago(ts){
  const s=Math.max(0,(Date.now()-new Date(ts).getTime())/1000);
  if(s<60) return `${Math.floor(s)}s ago`;
  if(s<3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

function renderKPIs(){
  const all=snapshots.flatMap(s=>s.vehicles);
  const pcts=all.map(v=>v.occupancy_pct).filter(x=>x!=null);
  const avg=pcts.length?Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length):null;
  set('kpi-vehicles', all.length.toLocaleString());
  set('kpi-routes', snapshots.reduce((a,s)=>a+s.stats.routes_active,0));
  set('kpi-crowd', avg!=null?avg+'%':'—');
  set('kpi-full', all.filter(v=>(v.occupancy_pct||0)>=80).length);
  const newest=snapshots.map(s=>s.fetched_at).sort().pop();
  document.getElementById('updated-ago').textContent=newest?ago(newest):'—';
  const mins=newest?(Date.now()-new Date(newest).getTime())/60000:999;
  const mode=document.getElementById('data-mode');
  mode.textContent=mins<30?'LIVE':'SNAPSHOT';
  mode.className=mins<30?'mode-live':'mode-snap';
}
function set(id,v){document.getElementById(id).textContent=v;}

function renderChips(){
  const wrap=document.getElementById('city-chips'); wrap.innerHTML='';
  cities.forEach(c=>{
    const s=snapshots.find(s=>s.city===c.id);
    const b=document.createElement('button');
    b.innerHTML=`${c.name} <b>${s?s.stats.vehicles:0}</b>`;
    b.onclick=()=>dive(c.id); wrap.appendChild(b);
  });
}

function dive(id){
  currentCity=cities.find(c=>c.id===id);
  document.getElementById('globe-view').classList.add('hidden');
  document.getElementById('city-view').classList.remove('hidden');
  const snap=snapshots.find(s=>s.city===id);
  if(snap) cityApi.setVehicles({...currentCity, agency:snap.agency},
    snap.vehicles.map(v=>({...v, agency:snap.agency, _city:currentCity.name})));
  cityApi.flyTo(currentCity);
}
function back(){
  currentCity=null; cityApi.clear();
  document.getElementById('vehicle-card').classList.add('hidden');
  document.getElementById('city-view').classList.add('hidden');
  document.getElementById('globe-view').classList.remove('hidden');
}

function onSelectVehicle(v){
  const card=document.getElementById('vehicle-card');
  card.innerHTML=vehicleCardHTML(v); card.classList.remove('hidden');
  cityApi.track(v);  // lock on: dive to street level and chase it
}

async function boot(){
  await load();
  const canvas=document.getElementById('globe');
  globeApi=createGlobe(canvas, cities, dive);
  cityApi=createCityView(onSelectVehicle);
  document.getElementById('back-globe').onclick=back;
  renderKPIs(); renderChips();
  createCopilot(()=>snapshots);
  setInterval(async ()=>{
    const before=JSON.stringify(snapshots.map(s=>s.fetched_at));
    await load();
    renderKPIs(); renderChips();
    if(currentCity){
      const snap=snapshots.find(s=>s.city===currentCity.id);
      if(snap) cityApi.setVehicles({...currentCity, agency:snap.agency},
        snap.vehicles.map(v=>({...v, agency:snap.agency, _city:currentCity.name})));
    }
    void before;
  }, REFRESH_MS);
}
boot();
