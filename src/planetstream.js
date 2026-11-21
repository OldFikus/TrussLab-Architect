/* PlanetStream regional package v1. Bounds and centre use WGS84 longitude, latitude. */
function unpackPlanetRegion(raw) {
  if (raw?.type !== 'TrussLabPlanetRegion') return raw;
  if (raw.version !== 1) throw Error('Версия пакета PlanetStream не поддерживается');
  const {id, name, bounds, center, source} = raw;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))
    throw Error('Некорректный идентификатор региона');
  if (typeof name !== 'string' || !name.trim() || name.length > 160)
    throw Error('Требуется название региона');
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite))
    throw Error('Неверные границы региона');
  const [west,south,east,north] = bounds;
  if (west < -180 || east > 180 || west >= east || south < -85.05112878 ||
      north > 85.05112878 || south >= north) throw Error('Границы вне области проекции');
  if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite) ||
      center[0] < west || center[0] > east || center[1] < south || center[1] > north)
    throw Error('Центр вне границ региона');
  if (!source || !['attribution','license'].every(key =>
      typeof source[key] === 'string' && source[key].trim() && source[key].length <= 512) ||
      !['confirmed','approximate','demo','missing'].includes(source.quality))
    throw Error('Укажите источник, права и достоверность');
  if (raw.index?.type !== 'TrussLabRegionIndex') throw Error('Отсутствует индекс тайлов');
  return {...raw.index, metadata:{...raw.index.metadata, region:{id,name,bounds,center,source},
    sources:[source.attribution + ' · ' + source.license]}};
}
if (typeof module !== 'undefined' && module.exports) module.exports = {unpackPlanetRegion};
