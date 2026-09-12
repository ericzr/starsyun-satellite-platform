#!/usr/bin/env python3
"""Stage Taiwan ADM2 records from the supplied global N159 shapefile.

The global bundle stores Taiwan as ``TWN``. StarSyun deliberately exposes it
under the existing ``CHN -> 台湾省`` ADM1, so this script only emits the 22
ADM2 children and never creates a standalone country record.

Example:
  python3 scripts/stage-taiwan-adm2.py \
    "/path/to/全球二级区划.shp" \
    --output=.codex-tmp/taiwan-adm2.ndjson
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import shapefile  # type: ignore[import-not-found]


PARENT_ID = "MNR-N159-CHN-ADM1-710000"
SOURCE = "MNR-N159-GLOBAL"
SOURCE_VERSION = "2024-05"
SOURCE_LICENSE = "Public data (owner-attested)"
SOURCE_URL = ""
TRADITIONAL_TO_SIMPLIFIED = {
    "金門縣": "金门县", "馬祖列島": "马祖列岛", "高雄市": "高雄市", "新北市": "新北市",
    "台中市": "台中市", "台中": "台中市", "台南市": "台南市", "台南": "台南市", "台北市": "台北市", "彰化縣": "彰化县",
    "嘉義市": "嘉义市", "嘉義縣": "嘉义县", "新竹市": "新竹市", "新竹縣": "新竹县",
    "花蓮縣": "花莲县", "基隆市": "基隆市", "苗栗縣": "苗栗县", "南投縣": "南投县",
    "澎湖縣": "澎湖县", "屏東縣": "屏东县", "台東縣": "台东县", "桃園市": "桃园市",
    "宜蘭縣": "宜兰县", "雲林縣": "云林县",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Stage Taiwan ADM2 records")
    parser.add_argument("shapefile", type=Path, help="Global second-level SHP file")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-url", default=SOURCE_URL)
    parser.add_argument("--source-version", default=SOURCE_VERSION)
    parser.add_argument("--max-points", type=int, default=250)
    return parser.parse_args()


def clean(value: Any) -> str:
    return str(value or "").replace("\x00", "").replace("\r", "").replace("\n", " ").strip()


def simplify_ring(ring: list[list[float]], max_points: int) -> list[list[float]]:
    if len(ring) <= max_points:
        return ring
    closed = ring[0] == ring[-1]
    body = ring[:-1] if closed else ring
    stride = math.ceil(len(body) / max(1, max_points - 1))
    sampled = body[::stride][: max_points - 1]
    sampled.append(body[-1])
    if closed and sampled[-1] != sampled[0]:
        sampled.append(sampled[0])
    return sampled


def simplify_geometry(geometry: dict[str, Any], max_points: int) -> dict[str, Any]:
    if geometry.get("type") == "Polygon":
        return {"type": "Polygon", "coordinates": [simplify_ring(r, max_points) for r in geometry["coordinates"]]}
    if geometry.get("type") == "MultiPolygon":
        return {
            "type": "MultiPolygon",
            "coordinates": [[simplify_ring(r, max_points) for r in polygon] for polygon in geometry["coordinates"]],
        }
    raise ValueError(f"unsupported geometry type: {geometry.get('type')}")


def bbox(geometry: dict[str, Any]) -> list[float]:
    points: list[tuple[float, float]] = []

    def walk(value: Any) -> None:
        if isinstance(value, (list, tuple)) and len(value) >= 2 and all(isinstance(v, (int, float)) for v in value[:2]):
            points.append((float(value[0]), float(value[1])))
            return
        if isinstance(value, (list, tuple)):
            for child in value:
                walk(child)

    walk(geometry.get("coordinates"))
    if not points:
        raise ValueError("geometry has no coordinates")
    lons, lats = zip(*points)
    return [min(lons), min(lats), max(lons), max(lats)]


def centroid(geometry: dict[str, Any], extent: list[float]) -> list[float]:
    # A bbox center is stable for small administrative units and avoids
    # introducing a geometry library into the staging-only tool.
    return [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2]


def main() -> None:
    args = parse_args()
    reader = shapefile.Reader(str(args.shapefile), encoding="utf-8")
    fields = [field[0] for field in reader.fields[1:]]
    rows: list[dict[str, Any]] = []
    for index, record in enumerate(reader.iterRecords()):
        values = dict(zip(fields, record))
        if clean(values.get("GID_0")).upper() != "TWN":
            continue
        shape = reader.shape(index)
        geometry = shape.__geo_interface__
        extent = bbox(geometry)
        name_en = clean(values.get("NAME_2"))
        name_zh = TRADITIONAL_TO_SIMPLIFIED.get(clean(values.get("NL_NAME_2")), clean(values.get("NL_NAME_2")))
        if not name_en or not name_zh:
            raise ValueError(f"record {index} is missing bilingual name")
        shape_id = clean(values.get("GID_2")).replace(".", "-").replace("_", "-")
        rows.append({
            "id": f"MNR-N159-CHN-ADM2-TW-{shape_id}",
            "source": SOURCE,
            "source_version": args.source_version,
            "source_license": SOURCE_LICENSE,
            "source_url": args.source_url or None,
            "country_iso2": "CN",
            "country_iso3": "CHN",
            "level": 2,
            "parent_id": PARENT_ID,
            "name_en": name_en,
            "name_local": {"local": name_zh, "zh-Hans": name_zh},
            "centroid_lon": centroid(geometry, extent)[0],
            "centroid_lat": centroid(geometry, extent)[1],
            "bbox": extent,
            "geometry": simplify_geometry(geometry, args.max_points),
        })
    rows.sort(key=lambda row: row["id"])
    if len(rows) != 22:
        raise ValueError(f"expected 22 Taiwan ADM2 records, found {len(rows)}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows) + "\n", encoding="utf-8")
    print(f"staged Taiwan ADM2: {len(rows)} rows -> {args.output}")


if __name__ == "__main__":
    main()
