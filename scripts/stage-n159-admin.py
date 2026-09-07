#!/usr/bin/env python3
"""Stage the supplied N159 China 2023 shapefiles for the admin directory.

This is an offline, repeatable preparation step.  It never writes to Supabase.
The output is newline-delimited JSON suitable for the companion uploader.  The
source package uses the Chinese national, province, prefecture and county
archives; pyshp is deliberately kept as an ingestion-only dependency and is
not part of the web runtime.

Example:
  python3 scripts/stage-n159-admin.py \
    "/path/to/N159...gis" \
    --output=.codex-tmp/n159-china.ndjson \
    --report=.codex-tmp/n159-china-report.json
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable
from zipfile import BadZipFile, ZipFile

try:
    import shapefile  # type: ignore[import-not-found]
except ImportError as error:  # pragma: no cover - exercised by the CLI
    print(
        "pyshp is required for N159 staging; install it with "
        "python3 -m pip install -r scripts/requirements-admin.txt",
        file=sys.stderr,
    )
    raise SystemExit(2) from error


DEFAULT_VERSION = "2023"
DEFAULT_SOURCE = "MNR-N159"
ARCHIVE_NAMES = {
    "ADM0": "国界.zip",
    "ADM1": "省级.zip",
    "ADM2": "地级.zip",
    "ADM3": "县级.zip",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Stage N159 Chinese ADM0-ADM3 data")
    parser.add_argument("source", type=Path, help="N159 bundle root directory")
    parser.add_argument("--output", type=Path, required=True, help="NDJSON output path")
    parser.add_argument("--report", type=Path, required=True, help="JSON validation report path")
    parser.add_argument("--source-url", default="", help="Official public-data page URL, if known")
    parser.add_argument("--source-version", default=DEFAULT_VERSION)
    parser.add_argument("--max-points", type=int, default=250, help="Maximum points per ring")
    return parser.parse_args()


def display_zip_name(name: str) -> str:
    """Recover common GBK filenames stored without the ZIP UTF-8 flag."""
    try:
        return name.encode("cp437").decode("gb18030")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return name


def find_archive(source: Path, expected_name: str) -> Path:
    matches: list[Path] = []
    for path in source.rglob("*.zip"):
        if path.name == expected_name:
            matches.append(path)
            continue
        try:
            with ZipFile(path) as archive:
                if any(Path(display_zip_name(name)).name == expected_name for name in archive.namelist()):
                    matches.append(path)
        except (BadZipFile, OSError):
            continue
    if not matches:
        raise FileNotFoundError(f"could not find {expected_name} under {source}")
    # Prefer the explicitly named China 2023 directory when multiple bundles
    # are present, while keeping the choice deterministic.
    matches.sort(key=lambda path: ("中国国界与省市县区划2023shp" not in str(path), str(path)))
    return matches[0]


def members_by_suffix(archive: ZipFile) -> dict[str, str]:
    result: dict[str, str] = {}
    for name in archive.namelist():
        display = display_zip_name(name)
        suffix = Path(display).suffix.lower()
        if suffix in {".shp", ".shx", ".dbf", ".prj", ".cpg"}:
            result[suffix[1:]] = name
    if "shp" not in result or "dbf" not in result:
        raise ValueError("archive does not contain both SHP and DBF members")
    return result


def extract_vector(archive_path: Path, temporary_root: Path, level: str) -> Path:
    destination = temporary_root / level
    destination.mkdir(parents=True, exist_ok=True)
    with ZipFile(archive_path) as archive:
        members = members_by_suffix(archive)
        for suffix, member in members.items():
            target = destination / f"layer.{suffix}"
            with archive.open(member) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output, length=1024 * 1024)
    return destination / "layer.shp"


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\x00", "").replace("\r", "").replace("\n", " ").strip()


def valid_code(value: Any) -> str | None:
    text = clean_text(value)
    if not text or text.upper() in {"NULL", "NONE", "不统计", "0"}:
        return None
    try:
        number = int(float(text))
    except ValueError:
        return None
    return str(number) if number > 0 else None


def simplify_ring(ring: list[list[float]], max_points: int) -> list[list[float]]:
    if len(ring) <= max_points:
        return ring
    # Preserve closure and sample evenly.  This is intentionally deterministic
    # so a rerun produces the same IDs and geometry payload.
    closed = ring[0] == ring[-1]
    body = ring[:-1] if closed else ring
    if len(body) <= max_points - 1:
        return ring
    stride = math.ceil(len(body) / max(1, max_points - 1))
    sampled = body[::stride][: max_points - 1]
    sampled.append(body[-1])
    if closed or sampled[0] != sampled[-1]:
        sampled.append(sampled[0])
    return sampled


def simplify_geometry(geometry: dict[str, Any], max_points: int) -> dict[str, Any]:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if geometry_type == "Polygon" and isinstance(coordinates, list):
        return {
            "type": "Polygon",
            "coordinates": [simplify_ring(ring, max_points) for ring in coordinates],
        }
    if geometry_type == "MultiPolygon" and isinstance(coordinates, list):
        return {
            "type": "MultiPolygon",
            "coordinates": [
                [simplify_ring(ring, max_points) for ring in polygon]
                for polygon in coordinates
            ],
        }
    raise ValueError(f"unsupported geometry type: {geometry_type}")


def geometry_bbox(geometry: dict[str, Any]) -> list[float] | None:
    values: list[tuple[float, float]] = []

    def walk(value: Any) -> None:
        # pyshp exposes ``__geo_interface__`` coordinate pairs as tuples,
        # while GeoJSON loaded from disk normally uses lists.  Treat both as
        # coordinate sequences; checking the first two values before recursing
        # avoids mistaking a coordinate pair for another nesting level.
        if isinstance(value, (list, tuple)) and len(value) >= 2 and all(
            isinstance(item, (int, float)) and math.isfinite(float(item)) for item in value[:2]
        ):
            values.append((float(value[0]), float(value[1])))
            return
        if isinstance(value, (list, tuple)):
            for child in value:
                walk(child)

    walk(geometry.get("coordinates"))
    if not values:
        return None
    lons, lats = zip(*values)
    return [min(lons), min(lats), max(lons), max(lats)]


def ring_centroid(ring: list[list[float]]) -> tuple[float, float, float] | None:
    if len(ring) < 4:
        return None
    area_twice = 0.0
    x_sum = 0.0
    y_sum = 0.0
    for index in range(len(ring) - 1):
        x0, y0 = ring[index]
        x1, y1 = ring[index + 1]
        cross = x0 * y1 - x1 * y0
        area_twice += cross
        x_sum += (x0 + x1) * cross
        y_sum += (y0 + y1) * cross
    if abs(area_twice) < 1e-12:
        return None
    return x_sum / (3.0 * area_twice), y_sum / (3.0 * area_twice), abs(area_twice)


def geometry_centroid(geometry: dict[str, Any], bbox: list[float]) -> list[float]:
    polygons: list[list[list[list[float]]]] = []
    if geometry.get("type") == "Polygon":
        polygons = [geometry.get("coordinates", [])]
    elif geometry.get("type") == "MultiPolygon":
        polygons = geometry.get("coordinates", [])
    candidates = []
    for polygon in polygons:
        if polygon and isinstance(polygon[0], list):
            candidate = ring_centroid(polygon[0])
            if candidate:
                candidates.append(candidate)
    if candidates:
        candidate = max(candidates, key=lambda value: value[2])
        return [candidate[0], candidate[1]]
    return [(bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0]


def read_records(path: Path) -> Iterable[tuple[dict[str, Any], dict[str, Any]]]:
    reader = shapefile.Reader(str(path), encoding="utf-8")
    fields = [field[0] for field in reader.fields[1:]]
    for shape_record in reader.iterShapeRecords():
        properties = dict(zip(fields, list(shape_record.record)))
        geometry = shape_record.shape.__geo_interface__
        yield properties, geometry


def base_record(
    *,
    level: int,
    code: str,
    name_en: str,
    name_zh: str,
    parent_id: str | None,
    geometry: dict[str, Any],
    version: str,
    source: str,
    source_url: str,
    max_points: int,
) -> dict[str, Any]:
    bbox = geometry_bbox(geometry)
    if bbox is None:
        raise ValueError(f"{name_zh or name_en} has no coordinates")
    simplified = simplify_geometry(geometry, max_points)
    normalized_name_en = name_en or name_zh
    normalized_name_zh = name_zh or normalized_name_en
    return {
        "id": f"{source}-CHN-ADM{level}-{code}",
        "source": source,
        "source_version": version,
        "source_license": "Public data (owner-attested)",
        "source_url": source_url or None,
        "country_iso2": "CN",
        "country_iso3": "CHN",
        "level": level,
        "parent_id": parent_id,
        "name_en": normalized_name_en,
        "name_local": {"zh-Hans": normalized_name_zh, "local": normalized_name_zh},
        "centroid_lon": geometry_centroid(simplified, bbox)[0],
        "centroid_lat": geometry_centroid(simplified, bbox)[1],
        "bbox": bbox,
        "geometry": simplified,
        "is_active": True,
    }


def stage(args: argparse.Namespace) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    source = args.source.expanduser().resolve()
    if not source.is_dir():
        raise FileNotFoundError(f"source directory not found: {source}")
    if args.max_points < 12:
        raise ValueError("--max-points must be at least 12")

    archives = {level: find_archive(source, filename) for level, filename in ARCHIVE_NAMES.items()}
    rows: list[dict[str, Any]] = []
    province_rows: dict[str, dict[str, Any]] = {}
    city_rows: dict[str, dict[str, Any]] = {}
    direct_county_rows: list[tuple[dict[str, Any], dict[str, Any]]] = []
    county_rows: list[tuple[dict[str, Any], dict[str, Any]]] = []

    with tempfile.TemporaryDirectory(prefix="starsyun-n159-") as temporary:
        temporary_root = Path(temporary)
        adm0_path = extract_vector(archives["ADM0"], temporary_root, "ADM0")
        adm0_records = list(read_records(adm0_path))
        if len(adm0_records) != 1:
            raise ValueError(f"expected one China ADM0 record, found {len(adm0_records)}")
        _, adm0_geometry = adm0_records[0]
        root = base_record(
            level=0,
            code="CN",
            name_en="China",
            name_zh="中国",
            parent_id=None,
            geometry=adm0_geometry,
            version=args.source_version,
            source=DEFAULT_SOURCE,
            source_url=args.source_url,
            max_points=args.max_points,
        )
        rows.append(root)

        adm1_path = extract_vector(archives["ADM1"], temporary_root, "ADM1")
        for properties, geometry in read_records(adm1_path):
            code = valid_code(properties.get("省级码"))
            name_zh = clean_text(properties.get("省"))
            name_en = clean_text(properties.get("ENG_NAME"))
            if not code or not name_zh:
                continue
            record = base_record(
                level=1,
                code=code,
                name_en=name_en,
                name_zh=name_zh,
                parent_id=root["id"],
                geometry=geometry,
                version=args.source_version,
                source=DEFAULT_SOURCE,
                source_url=args.source_url,
                max_points=args.max_points,
            )
            province_rows[code] = record

        adm2_path = extract_vector(archives["ADM2"], temporary_root, "ADM2")
        for properties, geometry in read_records(adm2_path):
            city_code = valid_code(properties.get("地级码"))
            province_code = valid_code(properties.get("省级码"))
            name_zh = clean_text(properties.get("地名"))
            name_en = clean_text(properties.get("ENG_NAME")) or clean_text(properties.get("NAME_2"))
            if not city_code or not province_code or not name_zh or province_code not in province_rows:
                continue
            record = base_record(
                level=2,
                code=city_code,
                name_en=name_en,
                name_zh=name_zh,
                parent_id=province_rows[province_code]["id"],
                geometry=geometry,
                version=args.source_version,
                source=DEFAULT_SOURCE,
                source_url=args.source_url,
                max_points=args.max_points,
            )
            city_rows[city_code] = record

        adm3_path = extract_vector(archives["ADM3"], temporary_root, "ADM3")
        for properties, geometry in read_records(adm3_path):
            county_code = valid_code(properties.get("县级码"))
            city_code = valid_code(properties.get("地级码"))
            province_code = valid_code(properties.get("省级码"))
            name_zh = clean_text(properties.get("县级")) or clean_text(properties.get("地名"))
            name_en = clean_text(properties.get("ENG_NAME")) or clean_text(properties.get("NAME_3"))
            if not county_code or not province_code or not name_zh or province_code not in province_rows:
                continue
            item = (properties, geometry)
            if city_code and city_code in city_rows:
                county_rows.append(item)
            else:
                # Beijing/Shanghai/Tianjin/Chongqing districts, Hainan
                # county-level cities and Xinjiang production corps are direct
                # provincial children in this source. Promote them to ADM2 so
                # the UI never mixes a county into a prefecture list.
                direct_county_rows.append(item)

        for properties, geometry in direct_county_rows:
            code = valid_code(properties.get("县级码"))
            province_code = valid_code(properties.get("省级码"))
            name_zh = clean_text(properties.get("县级")) or clean_text(properties.get("地名"))
            name_en = clean_text(properties.get("ENG_NAME")) or clean_text(properties.get("NAME_3"))
            if not code or not province_code or province_code not in province_rows:
                continue
            city_rows.setdefault(
                code,
                base_record(
                    level=2,
                    code=code,
                    name_en=name_en,
                    name_zh=name_zh,
                    parent_id=province_rows[province_code]["id"],
                    geometry=geometry,
                    version=args.source_version,
                    source=DEFAULT_SOURCE,
                    source_url=args.source_url,
                    max_points=args.max_points,
                ),
            )

        for properties, geometry in county_rows:
            county_code = valid_code(properties.get("县级码"))
            city_code = valid_code(properties.get("地级码"))
            name_zh = clean_text(properties.get("县级")) or clean_text(properties.get("地名"))
            name_en = clean_text(properties.get("ENG_NAME")) or clean_text(properties.get("NAME_3"))
            if not county_code or not city_code or city_code not in city_rows:
                continue
            rows.append(
                base_record(
                    level=3,
                    code=county_code,
                    name_en=name_en,
                    name_zh=name_zh,
                    parent_id=city_rows[city_code]["id"],
                    geometry=geometry,
                    version=args.source_version,
                    source=DEFAULT_SOURCE,
                    source_url=args.source_url,
                    max_points=args.max_points,
                ),
            )

    # Keep the root, then stable code order at each level.  This makes diffs
    # reviewable and allows the uploader to insert parents before children.
    rows.extend(sorted(province_rows.values(), key=lambda row: row["id"]))
    rows.extend(sorted(city_rows.values(), key=lambda row: row["id"]))

    counts = Counter(str(row["level"]) for row in rows)
    duplicate_siblings = []
    sibling_names: defaultdict[tuple[str | None, int, str], list[str]] = defaultdict(list)
    for row in rows:
        key = (row["parent_id"], int(row["level"]), row["name_local"]["zh-Hans"])
        sibling_names[key].append(row["id"])
    for key, ids in sibling_names.items():
        if len(ids) > 1:
            duplicate_siblings.append({"parent_id": key[0], "level": key[1], "name": key[2], "ids": ids})

    row_ids = {row["id"] for row in rows}
    parent_failures = [row["id"] for row in rows if row["level"] > 0 and row["parent_id"] not in row_ids]
    taiwan = [row for row in rows if row["level"] == 1 and row["name_local"]["zh-Hans"] == "台湾省"]
    report = {
        "source_root": str(source),
        "source": DEFAULT_SOURCE,
        "source_version": args.source_version,
        "source_url": args.source_url or None,
        "source_policy": "owner_attested_public",
        "archives": {level: str(path) for level, path in archives.items()},
        "counts": {f"ADM{level}": counts.get(str(level), 0) for level in range(4)},
        "direct_provincial_units_promoted_to_adm2": len(direct_county_rows),
        "parent_failures": parent_failures,
        "duplicate_sibling_names": duplicate_siblings,
        "taiwan_adm1": [{"id": row["id"], "parent_id": row["parent_id"]} for row in taiwan],
        "standalone_twn_rows": 0,
        "geometry_policy": f"ring stride simplification at max {args.max_points} points",
        "ready_for_uploader": not parent_failures and len(taiwan) == 1 and not duplicate_siblings,
    }
    return rows, report


def main() -> int:
    args = parse_args()
    try:
        rows, report = stage(args)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("w", encoding="utf-8") as output:
            for row in rows:
                output.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("N159 administrative staging complete")
        for level in range(4):
            print(f"ADM{level}: {report['counts'][f'ADM{level}']:,}")
        print(f"Promoted direct provincial units to ADM2: {report['direct_provincial_units_promoted_to_adm2']:,}")
        print(f"Taiwan ADM1 rows under CHN: {len(report['taiwan_adm1'])}")
        print(f"Parent failures: {len(report['parent_failures'])}")
        print(f"Duplicate sibling names: {len(report['duplicate_sibling_names'])}")
        print(f"Ready for uploader: {'yes' if report['ready_for_uploader'] else 'no'}")
        print(f"NDJSON: {args.output.resolve()}")
        print(f"Report: {args.report.resolve()}")
        return 0 if report["ready_for_uploader"] else 1
    except (BadZipFile, FileNotFoundError, OSError, ValueError) as error:
        print(f"N159 staging failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
