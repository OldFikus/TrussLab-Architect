const FIDELITY_KINDS=Object.freeze({gis:'GIS',photo:'Фотография',scan:'Скан',model:'Модель',fiction:'Вымысел',unknown:'Нет данных'});
function fidelityRecord(feature,region) {
  const p=feature?.properties||{},source=region?.layers?.vector||region?.source;
  const evidence=p.fidelity||{};
  const kind=Object.hasOwn(FIDELITY_KINDS,evidence.kind)?evidence.kind:source?.quality==='demo'?'fiction':'unknown';
  return {name:String(p.name||p.building||p.highway||p.railway||'Объект'),
    kind,quality:evidence.quality||source?.quality||'missing',author:evidence.attribution||source?.attribution||'Нет данных',
    license:evidence.license||source?.license||'Нет данных',reference:evidence.reference||'',date:evidence.date||''};
}
if(typeof module!=='undefined'&&module.exports)module.exports={fidelityRecord,FIDELITY_KINDS};
