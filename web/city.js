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

  function ensure(city) {
    if (map) { map.jumpTo({center:[city.lon, city.lat], zoom:city.zoom}); return; }
    map = new maplibregl.Map({
      container:'map',
      style:'https://tiles.openfreemap.org/styles/dark',
      center:[city.lon, city.lat], zoom:city.zoom,
      attributionControl:{compact:true},
    });
    // If the vector style fails, fall back to Carto raster.
    map.on('error', e => {
      if (e && e.error && /style/i.test(e.error.message||'')) useRasterFallback(city);
    });
    map.on('click', e => {
      const feats = map.queryRenderedFeatures(e.point, {layers:['3d-buildings']});
      void feats;
    });
  }

  function useRasterFallback(city){
    try {
      map.setStyle({version:8, sources:{carto:{type:'raster',
        tiles:['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
        tileSize:256, attribution:'© OpenStreetMap © CARTO'}},
        layers:[{id:'carto',type:'raster',source:'carto'}]});
    } catch(_){/* keep whatever rendered */}
  }

  function setVehicles(city, vehicles) {
    ensure(city);
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
  }

  function clear(){ for(const [,m] of markers) m.remove(); markers.clear(); }

  return { setVehicles, clear,
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
