from pathlib import Path
p=Path(__file__).resolve().parents[1]
f=p/'js/region3d.js';s=f.read_text()
s=s.replace("import {RegionAssetStream} from './region_assets.js';","import {RegionAssetStream,regionAssetRaycast} from './region_assets.js';")
s=s.replace('this.assets=new RegionAssetStream(geoPack);this.showAssets=true;',"this.assets=new RegionAssetStream(geoPack);this.showAssets=true;this.assetEditMode=false;")
s=s.replace("c.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY};", "c.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,moved:0};")
s=s.replace("const dx=e.clientX-this.pointer.x,dy=e.clientY-this.pointer.y;this.pointer.x=e.clientX;this.pointer.y=e.clientY;", "const dx=e.clientX-this.pointer.x,dy=e.clientY-this.pointer.y;this.pointer.moved+=Math.hypot(dx,dy);this.pointer.x=e.clientX;this.pointer.y=e.clientY;")
s=s.replace("c.addEventListener('pointerup',e=>{if(this.pointer?.id===e.pointerId)this.pointer=null});", "c.addEventListener('pointerup',e=>{if(this.pointer?.id===e.pointerId){if(this.active&&this.assetEditMode&&this.pointer.moved<7)this._placeAtPointer(e);this.pointer=null}});")
needle="  document.getElementById('region3d-model-import')?.addEventListener('click',()=>document.getElementById('region3d-model-file')?.click());"
insert="""  document.getElementById('region3d-asset-place')?.addEventListener('click',()=>{this.assetEditMode=!this.assetEditMode;
   document.getElementById('region3d-asset-place').textContent=this.assetEditMode?'✓ Клик по суше':'＋ Ставить';
   this.statusMessage(this.assetEditMode?'Режим строительства: выберите модель и щёлкните по видимой суше. Перетаскивание по-прежнему вращает камеру.':'Размещение отключено.');
  });
  document.getElementById('region3d-asset-remove')?.addEventListener('click',()=>{const last=this.assets.instances.at(-1);if(!last){this.statusMessage('Нет объектов для удаления');return;}
   this.assets.remove(last.id);this._clearAssetBuffers();this._saveAssetScene();this.statusMessage('Удалено: '+last.id+' · объектов осталось '+this.assets.instances.length);
  });
  document.getElementById('region3d-asset-save')?.addEventListener('click',()=>this._downloadAssetScene());
  document.getElementById('region3d-asset-load')?.addEventListener('click',()=>document.getElementById('region3d-asset-file')?.click());
  document.getElementById('region3d-asset-file')?.addEventListener('change',async e=>{
   try{const file=e.target.files?.[0];if(!file)return;if(file.size>12_000_000)throw Error('Файл сцены слишком большой');
    const count=this.assets.importPlacements(JSON.parse(await file.text()));this._clearAssetBuffers();this._refreshAssetChoices();this._saveAssetScene();
    this.statusMessage('Сцена восстановлена: '+count+' объектов. Сохранены исходные координаты WGS84.');
   }catch(err){this.statusMessage('Импорт сцены: '+String(err?.message||err));}e.target.value='';
  });
"""
assert needle in s;s=s.replace(needle,insert+needle)
s=s.replace('this.modelCache.clear();this.showAssets=true;', 'this._clearAssetBuffers();this._refreshAssetChoices();this._saveAssetScene();this.showAssets=true;')
needle=' _effectiveQuality(){return this.quality'
insert=''' _clearAssetBuffers(){for(const entry of this.modelCache.values()){if(this.gl&&entry.buffer)this.gl.deleteBuffer(entry.buffer);this.webgpu?.release(entry)}this.modelCache.clear();this.visibleModels=[];}
 _refreshAssetChoices(){const select=document.getElementById('region3d-asset-choice');if(!select)return;const old=select.value;select.replaceChildren();
  for(const asset of this.assets.catalog.values()){const option=document.createElement('option');option.value=asset.id;option.textContent=asset.label;select.appendChild(option)}
  if(this.assets.catalog.has(old))select.value=old;
 }
 _placeAtPointer(e){const rect=this.canvas.getBoundingClientRect();const hit=regionAssetRaycast(this.geoPack,this.cam,this.forward(),{screenX:(e.clientX-rect.left)/rect.width,screenY:(e.clientY-rect.top)/rect.height,aspect:rect.width/rect.height});
  if(!hit){this.statusMessage('Модель не установлена: нет пересечения луча с известной сушей. Опустите взгляд или сместите камеру.');return;}
  const id=document.getElementById('region3d-asset-choice')?.value||'warehouse';
  try{this.assets.add({assetId:id,lat:hit.lat,lon:hit.lon,source:'manual WGS84 asset placement',estimated:false});this._clearAssetBuffers();this._saveAssetScene();this.showAssets=true;
   this.statusMessage('Поставлен объект «'+this.assets.catalog.get(id)?.label+'» · GPS '+hit.lat.toFixed(5)+', '+hit.lon.toFixed(5)+' · расстояние '+Math.round(hit.distance)+' м');
  }catch(err){this.statusMessage('Размещение: '+String(err?.message||err));}
 }
 _saveAssetScene(){try{const s=JSON.stringify(this.assets.exportPlacements());if(s.length<3_500_000)localStorage.setItem('trusslab_asset_scene_109',s);}catch(_){} }
 _restoreAssetScene(){try{const s=localStorage.getItem('trusslab_asset_scene_109');if(s){const count=this.assets.importPlacements(JSON.parse(s));if(count)this.statusMessage('Восстановлено '+count+' моделей из локального сохранения');}}catch(_){}this._refreshAssetChoices();}
 _downloadAssetScene(){try{const scene=this.assets.exportPlacements();const text=JSON.stringify(scene,null,2),blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='trusslab_asset_scene_10_9.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);this._saveAssetScene();
  this.statusMessage('Сцена экспортирована: '+scene.assets.length+' экземпляров, '+scene.models.length+' пользовательских GLB (дополнительные файлы не нужны).');
 }catch(err){this.statusMessage('Экспорт: '+String(err?.message||err));}}
'''
assert needle in s;s=s.replace(needle,insert+needle)
open_old="this.modelCache.clear();this.assets=new RegionAssetStream(this.geoPack);}if(Number.isFinite(lat)"
open_new="this.modelCache.clear();this.assets=new RegionAssetStream(this.geoPack);this._restoreAssetScene();}this._refreshAssetChoices();if(Number.isFinite(lat)"
assert open_old in s;s=s.replace(open_old,open_new)
# update on import user custom and autosave success already in previous patch
f.write_text(s)
idx=p/'index_dev.html';h=idx.read_text().replace('REGIONWORLD 10.8','REGIONWORLD 10.9').replace('<title>TrussLab Architect 10.8 — AssetStream</title>','<title>TrussLab Architect 10.9 — AssetStudio</title>')
needle='<button id="region3d-gpu-probe"'
assert needle in h
h=h.replace(needle,'''<select id="region3d-asset-choice" title="Выберите GLB-модель для размещения"></select><button id="region3d-asset-place" title="Режим размещения: нажмите на сушу в региональном 3D">＋ Ставить</button><button id="region3d-asset-remove" title="Удалить последний добавленный объект">↶ Удалить</button><button id="region3d-asset-save" title="Сохранить модели, геокоординаты и импортированные GLB в одном JSON">⇩ Сцена</button><button id="region3d-asset-load" title="Загрузить ранее сохранённую сцену JSON">⇧ Сцена</button><input type="file" id="region3d-asset-file" accept=".json,application/json" hidden>\n  <button id="region3d-gpu-probe"''')
idx.write_text(h)
css=p/'style.css';css.write_text(css.read_text()+'''\n/* AssetStudio: readable catalogue control in regional 3D toolbar. */\n.region3d-controls select{background:#213b46;color:#eaf6f5;border:1px solid #486574;border-radius:7px;padding:7px 9px;min-width:105px;font:inherit;cursor:pointer}.region3d-controls select:focus-visible{outline:2px solid #edc578}\n''')
build=p/'build.py';s=build.read_text().replace('10_8_Standalone.html','10_9_Standalone.html');build.write_text(s)
pkg=p/'package.json';s=pkg.read_text().replace('"version": "10.8.0"','"version": "10.9.0"');pkg.write_text(s)
