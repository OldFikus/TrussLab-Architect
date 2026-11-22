/* User-authored coastal overlays. Coordinates are WGS84, elevations are metres. */
(() => {
  const layers = {
    shoreline: ['Береговая линия', '#209dd2'],
    tidal: ['Приливная зона', '#55a9bb'],
    spit: ['Коса', '#d19b45'],
    island: ['Остров', '#65a45c']
  };
  const key = 'trusslab-coastal-overlays-v1';
  const empty = () => ({type: 'FeatureCollection', features: []});
  let current = empty();
  function parse(text) {
    if (text.length > 500000) throw Error('Предел слоя — 500 000 символов');
    const data = JSON.parse(text);
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length > 300)
      throw Error('Нужна коллекция GeoJSON до 300 объектов');
    for (const f of data.features) {
      const p = f?.properties, g = f?.geometry;
      if (f?.type !== 'Feature' || !Object.hasOwn(layers, p?.kind) || typeof p.source !== 'string' || !p.source.trim())
        throw Error('Для каждого объекта нужны kind и source');
      const line = p.kind === 'shoreline';
      if (g?.type !== (line ? 'LineString' : 'Polygon') || !Array.isArray(g.coordinates) || !g.coordinates.length)
        throw Error('Для берега нужна линия, для остальных слоёв — полигон');
      for (const path of line ? [g.coordinates] : g.coordinates) {
        if (!Array.isArray(path) || path.length < (line ? 2 : 4) || path.length > 2000)
          throw Error('Недопустимое число вершин');
        for (const pt of path) {
          if (!Array.isArray(pt) || ![2,3].includes(pt.length) || !pt.every(Number.isFinite) || Math.abs(pt[0]) > 180 || Math.abs(pt[1]) > 85)
            throw Error('Нужны долгота, широта в пределах карты и необязательная высота');
        }
        if (!line && JSON.stringify(path[0]) !== JSON.stringify(path.at(-1))) throw Error('Замкните кольцо полигона');
      }
    }
    return data;
  }
  try { current = parse(localStorage.getItem(key) || JSON.stringify(empty())); } catch (_) {}
  const hidden = new Set();
  atlas.coastalOverlay = ctx => {
    ctx.save();
    for (const f of current.features) {
      const kind = f.properties.kind;
      if (hidden.has(kind)) continue;
      const color = layers[kind][1];
      ctx.fillStyle = color + '60'; ctx.strokeStyle = color; ctx.lineWidth = 2;
      atlas._drawGeometry(ctx, f.geometry, kind === 'shoreline' ? 'road' : 'area');
    }
    ctx.restore();
  };
  const button = document.createElement('button');
  button.id = 'coastal-editor'; button.textContent = 'Береговые слои';
  document.getElementById('atlas-demo').after(button);
  const dlg = document.createElement('dialog');
  dlg.setAttribute('aria-label', 'Редактор береговых слоёв');
  dlg.innerHTML = '<h2>Береговые слои</h2><p>Локальная правка поверх карты. Вершины GeoJSON задаются долготой, широтой и необязательной высотой в метрах. Укажите источник в source.</p><fieldset><legend>Видимые слои</legend></fieldset><label>Коллекция GeoJSON<br><textarea rows="10" cols="55" style="max-width:70vw"></textarea></label><p><button data-example>Пример</button> <button data-save>Применить</button> <button data-close>Закрыть</button></p><output role="status"></output>';
  document.body.append(dlg);
  const field = dlg.querySelector('textarea'), status = dlg.querySelector('output');
  for (const [kind, [name]] of Object.entries(layers)) {
    const label = document.createElement('label'), input = document.createElement('input');
    input.type = 'checkbox'; input.checked = true;
    input.onchange = () => { if (input.checked) hidden.delete(kind); else hidden.add(kind); atlas.schedule(); };
    label.append(input, name); dlg.querySelector('fieldset').append(label);
  }
  function describe() {
    let metres = 0, steepest = null;
    for (const f of current.features.filter(f => f.properties.kind === 'shoreline')) {
      const pts = f.geometry.coordinates;
      for (let i = 1; i < pts.length; i++) {
        const [lon, lat, h] = pts[i-1], [lon2, lat2, h2] = pts[i];
        const enu = geoToENU(lat2, lon2, 0, {lat,lon,height:0}), d = Math.hypot(enu.east, enu.north);
        metres += d;
        if (d > 0 && Number.isFinite(h) && Number.isFinite(h2)) steepest = Math.max(steepest ?? 0,100*Math.abs(h2-h)/d);
      }
    }
    return 'Объектов: '+current.features.length+' · длина проекций береговых отрезков: '+metres.toFixed(1)+' м · максимальный уклон: '+(steepest === null ? 'нет высот' : steepest.toFixed(2)+'%');
  }
  const coverage = document.createElement('p');
  dlg.querySelector('fieldset').before(coverage);
  button.onclick = () => {
    const dem = atlas.geoPack?.dem;
    coverage.textContent = dem ? 'Покрытие сетки высот: '+dem.validCount+' из '+dem.values.length+' ячеек ('+(100*dem.validCount/dem.values.length).toFixed(1)+'%).' : 'Сетка высот отсутствует.';
    field.value = JSON.stringify(current,null,2); status.textContent = describe(); dlg.showModal(); };
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  dlg.querySelector('[data-example]').onclick = () => {
    const {lon,lat} = mercatorUnproject(atlas.center.x,atlas.center.y);
    const x = Math.min(lon,179.99), y = Math.min(lat,84.99);
    field.value = JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{kind:'shoreline',source:'Учебный пример'},geometry:{type:'LineString',coordinates:[[x,y,0],[x+.001,y+.001,1]]}}]},null,2);
  };
  dlg.querySelector('[data-save]').onclick = () => {
    try {
      const data = parse(field.value);
      localStorage.setItem(key,JSON.stringify(data)); current = data;
      status.textContent = describe(); atlas.schedule();
    } catch (error) { status.textContent = error.message; }
  };
})();
