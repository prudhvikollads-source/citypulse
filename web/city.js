// City view: MapLibre dark map + live vehicle markers with smooth motion.
/* global maplibregl */

const OCC_COLOR = occ => {
  if (occ == null || occ === 7) return '#8b98b3';   // unknown -> grey
  if (occ >= 4) return '#f87171';                   // packed -> red
  if (occ >= 2) return '#fbbf24';                   // filling -> amber
  return '#34d399';                                 // roomy -> green
};

// GTFS-RT occupancy_status -> plain language. Kept client-side so the wire
// format only carries the code (see etl/fetch_feeds.py OCCUPANCY).
const OCC_LABEL = {
  0:'Empty', 1:'Many seats available', 2:'Few seats available',
  3:'Standing room only', 4:'Crushed standing room only',
  5:'Full', 6:'Not accepting passengers', 8:'Not boardable',
};
export const occupancyLabel = occ =>
  (occ != null && OCC_LABEL[occ]) || 'Unknown';

export function createCityView(onSelect) {
  let map = null, markers = new Map(), current = null;
  let trackedId = null, trailPts = [];

  function ensure(city) {
    if (map) { map.jumpTo({center:[city.lon, city.lat], zoom:city.zoom}); return; }
    map = new maplibregl.Map({
      container:'map',
      style:'https://tiles.openfreemap.org/styles/dark',
      center:[city.lon, city.lat], zoom:city.zoom,
      attributionControl:{compact:true},
    });
    // If the vector style itself fails to load, fall back once to OSM raster
    // (darkened via CSS to match the theme). Carto now requires an API key,
    // so it is not used. Guarded: tile errors after a good load never trigger it.
    let fellBack = false;
    map.on('error', e => {
      if (fellBack) return;
      const msg = (e && e.error && e.error.message) || '';
      if (/style|sprite|glyph/i.test(msg) && !map.isStyleLoaded()) {
        fellBack = true;
        useRasterFallback(city);
      }
    });
    // Grabbing the map hands control back to the user.
    map.on('dragstart', ()=>{ if(trackedId) untrack(); });
  }

  // Fading trail behind the tracked vehicle (re-added if a style swap wipes it).
  function ensureTrail(){
    if(!map.getSource('trail-src')){
      map.addSource('trail-src',{type:'geojson',
        data:{type:'Feature',geometry:{type:'LineString',coordinates:[]}}});
      map.addLayer({id:'trail-line',type:'line',source:'trail-src',
        paint:{'line-color':'#22d3ee','line-width':3,'line-opacity':0.75}});
    }
  }
  function pushTrail(lon,lat){
    const last=trailPts[trailPts.length-1];
    if(!last || Math.hypot(lon-last[0],lat-last[1])>0.0004){
      trailPts.push([lon,lat]);
      if(trailPts.length>40) trailPts.shift();
      ensureTrail();
      map.getSource('trail-src').setData({type:'Feature',
        geometry:{type:'LineString',coordinates:trailPts}});
    }
  }

  // Lock onto a vehicle: dive to street level, pitch into a 3D chase view,
  // and follow it as positions refresh.
  function track(v){
    trackedId=v.id; trailPts=[[v.lon,v.lat]];
    document.getElementById('track-hud').classList.remove('hidden');
    updateHUD(v);
    map.easeTo({center:[v.lon,v.lat], zoom:16.2, pitch:60, duration:1600});
  }
  function untrack(){
    trackedId=null; trailPts=[];
    document.getElementById('track-hud').classList.add('hidden');
    try{ if(map.getLayer('trail-line')) map.removeLayer('trail-line');
         if(map.getSource('trail-src')) map.removeSource('trail-src'); }catch(_){}
    if(current) map.easeTo({pitch:0, zoom:current.zoom, duration:1200});
  }
  function updateHUD(v){
    const hud=document.getElementById('track-hud');
    const spd=v.speed!=null?Math.round(v.speed)+' mph':'—';
    const brg=v.bearing!=null?String(Math.round(v.bearing)).padStart(3,'0')+'°':'—';
    hud.innerHTML=
      '<span class="rec"></span><b>TRACKING</b>'+
      `<span class="t-route">🚌 ${esc(v.route_label||'?')} · #${esc(v.id)}</span>`+
      `<span class="t-tele">${spd} · ${brg} · ${esc(occupancyLabel(v.occupancy))}</span>`+
      `<span class="t-pos">${v.lat.toFixed(4)}, ${v.lon.toFixed(4)}</span>`+
      '<button id="untrack" title="release camera">✕</button>';
    document.getElementById('untrack').onclick=e=>{e.stopPropagation();untrack();};
  }

  function useRasterFallback(city){
    try {
      // Darken the light OSM tiles with CSS; vehicle markers are HTML and unaffected.
      document.getElementById('map').classList.add('raster-dark');
      map.setStyle({version:8, sources:{osm:{type:'raster',
        tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize:256, attribution:'© OpenStreetMap contributors'}},
        layers:[{id:'osm',type:'raster',source:'osm'}]});
    } catch(_){/* keep whatever rendered */}
  }

  function setVehicles(city, vehicles) {
    ensure(city);
    current = city;
    const seen = new Set();
    for (const v of vehicles) {
      seen.add(v.id);
      let m = markers.get(v.id);
      if (!m) {
        const el = document.createElement('div');
        el.className='vdot'; el.title=`${v.route_label||'—'} · ${v.id}`;
        el.addEventListener('click', ev=>{ev.stopPropagation(); onSelect(v);});
        m = new maplibregl.Marker({element:el}).setLngLat([v.lon,v.lat]).addTo(map);
        markers.set(v.id, m);
      } else {
        m.setLngLat([v.lon, v.lat]);
      }
      m.getElement().style.background = OCC_COLOR(v.occupancy);
      m.getElement().style.color = OCC_COLOR(v.occupancy);
      m._veh = v;
    }
    for (const [id,m] of markers) if(!seen.has(id)){ m.remove(); markers.delete(id); }
    // Chase-cam: keep the camera glued to the tracked vehicle.
    if(trackedId){
      const t=markers.get(trackedId);
      if(t && seen.has(trackedId)){
        const v=t._veh;
        pushTrail(v.lon,v.lat);
        updateHUD(v);
        map.easeTo({center:[v.lon,v.lat], duration:900});
      } else untrack();  // vehicle left the feed — release the camera
    }
  }

  function clear(){ untrack(); for(const [,m] of markers) m.remove(); markers.clear(); }

  return { setVehicles, clear, track, untrack,
    flyTo(city){ if(map) map.flyTo({center:[city.lon,city.lat], zoom:city.zoom, duration:1800}); } };
}

export function vehicleCardHTML(v){
  const pct = v.occupancy_pct;
  const color = pct==null?'#8b98b3':pct>=80?'#f87171':pct>=45?'#fbbf24':'#34d399';
  return `
    <button class="close" onclick="document.getElementById('vehicle-card').classList.add('hidden')">✕</button>
    <h3>🚌 ${esc(v.route_label||'No route')}</h3>
    <div class="sub">${esc(v.route_type||'Vehicle')} · #${esc(v.id)} · ${esc(v.agency||'')}</div>
    <div class="row"><span>How full</span><b>${esc(occupancyLabel(v.occupancy))}</b></div>
    ${pct!=null?`<div class="meter"><i style="width:${pct}%;background:${color}"></i></div>`:''}
    <div class="row"><span>Speed</span><b>${v.speed!=null?v.speed+' mph':'—'}</b></div>
    <div class="row"><span>Bearing</span><b>${v.bearing!=null?Math.round(v.bearing)+'°':'—'}</b></div>
    <div class="row"><span>Position</span><b>${v.lat.toFixed(4)}, ${v.lon.toFixed(4)}</b></div>`;
}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
