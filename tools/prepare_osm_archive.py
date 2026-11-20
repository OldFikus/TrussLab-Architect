#!/usr/bin/env python3
"""Add an OSM-derived sea/land coastline mask to a TrussLab GeoPack WITHOUT Overpass/WFS.

Upstream: @geo-maps/earth-seas-10m v0.6.0 (derived from OpenStreetMap coastlines,
2017-era static snapshot, ODbL); from npm's public tarball.  Deliberately NOT
advertised as current OSM or survey-quality data.

This script only edits the 'coast' layer. Existing 'dem' is preserved byte-for-byte.
No new Python dependencies beyond TrussLab's already installed GIS requirements.
"""
from __future__ import annotations
import argparse
import base64
import datetime as dt
import json
import sys
import tarfile
import time
import urllib.request
from pathlib import Path

import numpy as np
from rasterio.features import rasterize
from affine import Affine

from prepare_geodata import (
    N, SCENE, existing_geopack, geo_to_scene, write_preview,
)

PACKAGE = '@geo-maps/earth-seas-10m'
VERSION = '0.6.0'
TARBALL_URL = 'https://registry.npmjs.org/@geo-maps/earth-seas-10m/-/earth-seas-10m-0.6.0.tgz'
MAX_ARCHIVE = 180 * 1024 * 1024
MAX_GEOJSON = 360 * 1024 * 1024


def archive_contains_geojson(path: Path) -> bool:
    try:
        with tarfile.open(path, 'r:gz') as archive:
            entry = next((x for x in archive.getmembers() if x.name.endswith('/map.geo.json') and x.isfile()), None)
            return entry is not None and 0 < entry.size < MAX_GEOJSON
    except (tarfile.TarError, OSError):
        return False


def get_archive(cache: Path, timeout: int = 85) -> Path:
    """Download from npm once. No Overpass/EMODnet calls."""
    cache.mkdir(parents=True, exist_ok=True)
    dest = cache / f'earth-seas-10m-{VERSION}.tgz'
    if dest.exists() and archive_contains_geojson(dest):
        print('Используем кэш OSM-архива:', dest, flush=True)
        return dest
    if dest.exists():
        dest.unlink()
    for attempt in range(2):
        tmp = dest.with_suffix('.tgz.part')
        total = 0
        try:
            print('Скачиваем OSM-производный архив из npm:', TARBALL_URL, flush=True)
            req = urllib.request.Request(TARBALL_URL, headers={'User-Agent': 'TrussLabGIS/9.3.4 contact via OpenStreetMap attribution'})
            with urllib.request.urlopen(req, timeout=timeout) as src, tmp.open('wb') as out:
                while True:
                    block = src.read(1024*1024)
                    if not block: break
                    total += len(block)
                    if total > MAX_ARCHIVE: raise ValueError('Архив превышает лимит 180 МБ')
                    out.write(block)
            if not archive_contains_geojson(tmp):
                raise ValueError('Некорректный пакет npm (нет map.geo.json); кеш не сохраняем')
            tmp.replace(dest)
            print('Скачано:', round(total/1024/1024, 1), 'МБ', flush=True)
            return dest
        except Exception as exc:
            tmp.unlink(missing_ok=True)
            print(f'  npm, попытка {attempt+1}/2: {exc}', file=sys.stderr)
            if attempt == 0: time.sleep(2)
    raise RuntimeError('Не удалось получить OSM-пакет из npm. Существующий Copernicus DEM не затронут. ' +
                       'Можно передать архив вручную через --archive или GeoJSON через --geojson.')


def read_geojson_from_archive(archive_path: Path) -> dict:
    with tarfile.open(archive_path, 'r:gz') as archive:
        entry = next((x for x in archive.getmembers() if x.name.endswith('/map.geo.json') and x.isfile()), None)
        if not entry or entry.size > MAX_GEOJSON:
            raise ValueError('Не найден подходящий map.geo.json внутри архива')
        stream = archive.extractfile(entry)
        if stream is None: raise ValueError('GeoJSON не удалось прочитать')
        raw = stream.read(MAX_GEOJSON + 1)
        if len(raw) > MAX_GEOJSON:
            raise ValueError('GeoJSON слишком большой (> 360 МБ)')
    obj = json.loads(raw)
    if not isinstance(obj, dict) or 'type' not in obj:
        raise ValueError('GeoJSON имеет некорректный формат')
    return obj


def _geometries(doc):
    if not isinstance(doc, dict): return
    kind = doc.get('type')
    if kind == 'FeatureCollection':
        for item in doc.get('features', []):
            yield from _geometries(item)
    elif kind == 'Feature':
        yield from _geometries(doc.get('geometry'))
    elif kind == 'GeometryCollection':
        for geom in doc.get('geometries', []):
            yield from _geometries(geom)
    elif kind == 'Polygon':
        yield doc['coordinates']
    elif kind == 'MultiPolygon':
        for polygon in doc['coordinates']:
            yield polygon


def rasterize_water_polygons(doc) -> tuple[np.ndarray, dict]:
    """Rasterize OSM sea polygons into game scene; invert to a uint8 LAND mask.

    Rasterio preserves polygon holes and doesn't depend on coastline line
    orientation/nearest-segment guesses used by older importer.
    """
    extent = SCENE / 2
    shapes = []
    checked = 0
    for polygon in _geometries(doc):
        checked += 1
        if not polygon or len(polygon[0]) < 3:
            continue
        outer = np.asarray(polygon[0], dtype=np.float64)
        if outer.ndim != 2 or outer.shape[1] < 2:
            continue
        xs, zs = geo_to_scene(outer[:, 1], outer[:, 0])
        if xs.min() > extent or xs.max() < -extent or zs.min() > extent or zs.max() < -extent:
            continue
        rings = [list(zip(xs.tolist(), zs.tolist()))]
        for hole in polygon[1:]:
            h = np.asarray(hole, dtype=np.float64)
            if h.ndim != 2 or h.shape[0] < 3 or h.shape[1] < 2:
                continue
            hx, hz = geo_to_scene(h[:, 1], h[:, 0])
            if hx.min() > extent or hx.max() < -extent or hz.min() > extent or hz.max() < -extent:
                continue
            rings.append(list(zip(hx.tolist(), hz.tolist())))
        shapes.append(({'type': 'Polygon', 'coordinates': rings}, 1))
    if not shapes:
        raise ValueError('В архиве не найдено морских полигонов в пределах карты. DEM сохранён.')
    transform = Affine(SCENE/N, 0, -SCENE/2, 0, SCENE/N, -SCENE/2)
    water = rasterize(shapes, out_shape=(N, N), transform=transform,
                      fill=0, dtype='uint8', all_touched=False)
    land = np.where(water != 0, 0, 255).astype('uint8')
    fraction = float(np.mean(land > 0))
    if fraction < .01 or fraction > .99:
        raise ValueError(f'Подозрительная маска (суша {fraction:.1%}). GeoPack не изменён.')
    return land, {'rasterization': 'area polygons with holes; sea inverted to land',
                  'regionSeaPolygons': len(shapes), 'allPolygonsChecked': checked,
                  'landFraction': round(fraction, 4),
                  'datasetSnapshot': '2017-era; NOT live OpenStreetMap',
                  'accuracyLimit': 'source coastline nominal ~10 m; scene anchor is approximate'}


def update_geopack(output: Path, land: np.ndarray, detail: dict) -> dict:
    old = existing_geopack(output)
    if not old:
        raise FileNotFoundError('Требуется ранее созданный GeoPack с DEM: ' + str(output))
    if not old.get('dem'):
        raise ValueError('В существующем GeoPack отсутствует DEM. Импорт отменён.')
    data = dict(old)
    metadata = dict(data.get('metadata', {}))
    sources = [s for s in metadata.get('sources', [])
               if not ('OpenStreetMap' in s.get('dataset', '') or 'earth-seas-10m' in s.get('dataset', ''))]
    sources.append({'dataset': '@geo-maps/earth-seas-10m 0.6.0 (OSM-derived sea polygons)',
                    'credit': '© OpenStreetMap contributors; geo-maps / Simone Primarosa',
                    'license': 'ODbL 1.0',
                    'url': 'https://www.openstreetmap.org/copyright',
                    'details': detail})
    metadata['sources'] = sources
    metadata['preparedUTC'] = dt.datetime.now(dt.timezone.utc).isoformat()
    data['metadata'] = metadata
    data['coast'] = {'encoding': 'uint8/base64', 'data': base64.b64encode(land.tobytes()).decode('ascii')}
    # The previous Copernicus DEM payload is intentionally left unchanged.
    original_dem = old['dem']['data']    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_suffix(output.suffix + '.part')
    temp.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    # Verify the generated package before replacing the original.
    reread = json.loads(temp.read_text(encoding='utf-8'))
    assert reread['dem']['data'] == original_dem
    assert len(base64.b64decode(reread['coast']['data'])) == N * N
    temp.replace(output)
    heights = np.frombuffer(base64.b64decode(old['dem']['data']), dtype='<i2').reshape((N, N))
    try: write_preview(land, heights, output.with_suffix('.preview.png'))
    except Exception as exc: print('Не удалось сохранить превью:', exc, file=sys.stderr)
    return data


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description='OSM archive coastlines -> existing TrussLab GeoPack without Overpass/EMODnet')
    p.add_argument('--archive', type=Path, help='локальный .tgz файл npm-пакета (без скачивания)')
    p.add_argument('--geojson', type=Path, help='локальный GeoJSON МОРСКИХ ПОЛИГОНОВ, не линий берегов')
    p.add_argument('--output', type=Path, default=Path('data/kerch_geopack.json'))
    args = p.parse_args(argv)
    try:
        if not existing_geopack(args.output) or not existing_geopack(args.output).get('dem'):
            raise ValueError('Сначала нужен GeoPack с сохранённым Copernicus DEM: ' + str(args.output))
        if args.geojson:
            doc = json.loads(args.geojson.read_text(encoding='utf8'))
            source = str(args.geojson)
        else:
            archive = args.archive or get_archive(args.output.parent/'source_downloads')
            doc = read_geojson_from_archive(archive)
            source = str(archive)
        mask, info = rasterize_water_polygons(doc)
        print('Источник:', source)
        print('Полигонов в районе карты:', info['regionSeaPolygons'])
        print('Доля суши:', f"{info['landFraction']:.1%}")
        update_geopack(args.output, mask, info)
        print('УСПЕШНО: OSM-производная береговая линия добавлена; Copernicus DEM не изменён.')
        print('Файл:', args.output)
        print('Проверьте:', args.output.with_suffix('.preview.png'))
        print('Повторно импортируйте JSON через кнопку 📦 OSM + DEM в TrussLab.')
        return 0
    except Exception as exc:
        print('Ошибка:', exc, file=sys.stderr)
        print('Исходный GeoPack с DEM остаётся без изменений.', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
