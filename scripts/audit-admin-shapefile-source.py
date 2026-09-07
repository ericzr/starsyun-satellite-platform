#!/usr/bin/env python3
"""Read-only audit for the N159-style ADM0-ADM3 shapefile bundle.

The script intentionally uses only Python's standard library. It reads ZIP,
DBF and SHP/SHX headers but never extracts or executes files from the bundle.
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from collections import Counter
from pathlib import Path
from zipfile import BadZipFile, ZipFile


LICENSE_MARKERS = ("license", "licence", "readme", "许可", "授权", "来源", "协议")


def display_zip_name(name: str) -> str:
    """Recover common GBK filenames stored without the ZIP UTF-8 flag."""
    try:
        return name.encode("cp437").decode("gb18030")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return name


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit a local ADM0-ADM3 shapefile source bundle")
    parser.add_argument("source", type=Path, help="Root directory that contains the supplied ZIP files")
    parser.add_argument("--json", type=Path, help="Optional path for the complete JSON report")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero when production blockers are found")
    parser.add_argument(
        "--owner-attested-public",
        action="store_true",
        help="Record the owner's assertion that the bundle is public data; does not bypass geometry or coverage blockers",
    )
    return parser.parse_args()


def decode_text(raw: bytes) -> str:
    for encoding in ("utf-8", "gb18030", "latin1"):
        try:
            return raw.decode(encoding).strip().strip("\x00")
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace").strip().strip("\x00")


def dbf_rows(archive: ZipFile, name: str):
    with archive.open(name) as stream:
        header = stream.read(32)
        if len(header) != 32:
            raise ValueError(f"invalid DBF header: {name}")
        record_count = struct.unpack("<I", header[4:8])[0]
        header_length = struct.unpack("<H", header[8:10])[0]
        record_length = struct.unpack("<H", header[10:12])[0]
        descriptors = stream.read(header_length - 32)[:-1]
        fields = []
        for offset in range(0, len(descriptors), 32):
            descriptor = descriptors[offset : offset + 32]
            if len(descriptor) < 32 or descriptor[0] == 13:
                break
            field_name = decode_text(descriptor[:11].split(b"\0", 1)[0])
            fields.append((field_name, descriptor[16]))
        for _ in range(record_count):
            record = stream.read(record_length)
            if len(record) != record_length:
                break
            if record[:1] == b"*":
                continue
            row = {}
            cursor = 1
            for field_name, field_length in fields:
                row[field_name] = decode_text(record[cursor : cursor + field_length])
                cursor += field_length
            yield row


def dbf_count(archive: ZipFile, name: str) -> int:
    with archive.open(name) as stream:
        header = stream.read(8)
    return struct.unpack("<I", header[4:8])[0]


def shapefile_metadata(archive: ZipFile, name: str) -> dict:
    with archive.open(name) as stream:
        header = stream.read(100)
    if len(header) != 100:
        raise ValueError(f"invalid SHP header: {name}")
    shape_type = struct.unpack("<I", header[32:36])[0]
    bbox = [round(value, 7) for value in struct.unpack("<4d", header[36:68])]
    shx_name = f"{name[:-4]}.shx"
    records = None
    if shx_name in archive.namelist():
        records = max(0, (archive.getinfo(shx_name).file_size - 100) // 8)
    return {"shape_type": shape_type, "feature_count": records, "bbox": bbox}


def find_global_archive(source: Path) -> Path:
    candidates = []
    for path in source.rglob("*.zip"):
        try:
            with ZipFile(path) as archive:
                names = [(name, display_zip_name(name)) for name in archive.namelist()]
                score = sum(
                    any(f"全球{level}" in display_name and name.endswith(".dbf") for name, display_name in names)
                    for level in ("国家", "一级区划", "二级区划", "三级区划")
                )
                if score:
                    candidates.append((score, path.stat().st_size, path))
        except (BadZipFile, OSError):
            continue
    if not candidates:
        raise FileNotFoundError("no ZIP containing the expected global ADM DBF layers was found")
    return max(candidates)[2]


def global_layer_names(archive: ZipFile) -> dict[int, dict[str, str]]:
    tokens = {0: "全球国家", 1: "全球一级区划", 2: "全球二级区划", 3: "全球三级区划"}
    result = {}
    for level, token in tokens.items():
        result[level] = {}
        for name in archive.namelist():
            if token not in display_zip_name(name):
                continue
            suffix = Path(name).suffix.lower().removeprefix(".")
            if suffix in {"dbf", "shp", "shx", "prj", "cpg"}:
                result[level][suffix] = name
        if "dbf" not in result[level] or "shp" not in result[level]:
            raise ValueError(f"missing DBF/SHP for {token}")
    return result


def audit_global(archive: ZipFile, layers: dict[int, dict[str, str]]) -> tuple[dict, list[str]]:
    report = {"levels": {}, "china_policy": {}, "source_fingerprint": {}}
    blockers = []
    ids_by_level: dict[int, set[str]] = {}
    china_adm0 = []
    taiwan_adm1 = []
    known_stale = []

    for level in range(4):
        id_field = f"GID_{level}"
        parent_field = f"GID_{level - 1}" if level else None
        country_counts = Counter()
        ids = set()
        duplicate_ids = 0
        orphan_count = 0
        orphans = []
        local_name_missing = 0
        rows_count = 0
        for row in dbf_rows(archive, layers[level]["dbf"]):
            rows_count += 1
            identifier = row.get(id_field, "")
            if identifier in ids:
                duplicate_ids += 1
            ids.add(identifier)
            country_code = row.get("GID_0", "")
            if country_code:
                country_counts[country_code] += 1
            if parent_field and row.get(parent_field, "") not in ids_by_level[level - 1]:
                orphan_count += 1
                if len(orphans) < 20:
                    orphans.append({"id": identifier, "parent": row.get(parent_field, "")})
            if level and country_code == "CHN" and row.get(f"NL_NAME_{level}") in {"", "NA"}:
                local_name_missing += 1
            if level == 0 and (row.get("COUNTRY") in {"China", "Taiwan"} or country_code in {"CHN", "TWN", "Z02", "Z03", "Z08"}):
                china_adm0.append(row)
            if level == 1 and country_code == "TWN":
                taiwan_adm1.append(row)
            if level == 2 and country_code == "CHN" and row.get("NAME_2") in {"Chaohu", "Laicheng"}:
                known_stale.append({key: row.get(key) for key in ("GID_1", "GID_2", "NAME_2", "NL_NAME_2")})
        ids_by_level[level] = ids
        shp = shapefile_metadata(archive, layers[level]["shp"])
        report["levels"][f"ADM{level}"] = {
            "dbf_records": rows_count,
            "unique_ids": len(ids),
            "duplicate_ids": duplicate_ids,
            "country_code_coverage": len(country_counts),
            "orphan_count": orphan_count,
            "orphan_examples": orphans[:8],
            "china_missing_local_names": local_name_missing,
            "geometry": shp,
        }

    report["china_policy"] = {
        "global_adm0_china_family": china_adm0,
        "standalone_taiwan_adm0": any(row.get("GID_0") == "TWN" for row in china_adm0),
        "taiwan_adm1_rows_under_twn": len(taiwan_adm1),
        "known_stale_china_adm2_examples": known_stale,
    }
    report["source_fingerprint"] = {
        "gadm_compatible_schema": all(report["levels"][f"ADM{level}"]["unique_ids"] > 0 for level in range(4)),
        "gid_suffix_pattern": "*_1",
        "note": "GID/NAME/VARNAME/HASC fields and *_1 IDs are consistent with an older GADM-style export; provenance must be proven separately.",
    }

    if report["levels"]["ADM3"]["country_code_coverage"] < report["levels"]["ADM0"]["country_code_coverage"]:
        blockers.append("ADM3 is not global: only a subset of ADM0 country codes has third-level records")
    if report["china_policy"]["standalone_taiwan_adm0"]:
        blockers.append("the global layer exposes Taiwan as standalone ADM0 and must be normalized under CHN")
    if len(china_adm0) > 1:
        blockers.append("the global layer contains multiple China ADM0 aliases (CHN/Z02/Z03/Z08)")
    if known_stale:
        blockers.append("the global China layer contains known stale ADM2 names such as Chaohu")
    if any(report["levels"][f"ADM{level}"]["orphan_count"] for level in range(1, 4)):
        blockers.append("one or more parent IDs are absent from the immediately preceding ADM level")
    return report, blockers


def audit_china_archives(source: Path) -> dict:
    expected = {"国界": 0, "省级": 1, "地级": 2, "县级": 3}
    result = {}
    for path in source.rglob("*.zip"):
        if path.stem not in expected:
            continue
        with ZipFile(path) as archive:
            dbf_names = [name for name in archive.namelist() if name.lower().endswith(".dbf")]
            shp_names = [name for name in archive.namelist() if name.lower().endswith(".shp")]
            if not dbf_names or not shp_names:
                continue
            has_taiwan = False
            for row in dbf_rows(archive, dbf_names[0]):
                if "台湾省" in json.dumps(row, ensure_ascii=False) or "710000" in row.values():
                    has_taiwan = True
                    break
            result[f"ADM{expected[path.stem]}"] = {
                "archive": str(path),
                "dbf_records": dbf_count(archive, dbf_names[0]),
                "geometry": shapefile_metadata(archive, shp_names[0]),
                "contains_taiwan_province_or_code_710000": has_taiwan,
            }
    return result


def license_evidence(source: Path) -> list[str]:
    evidence = []
    for path in source.rglob("*"):
        if path.is_file() and any(marker in path.name.lower() for marker in LICENSE_MARKERS):
            evidence.append(str(path))
        if path.is_file() and path.suffix.lower() == ".zip":
            try:
                with ZipFile(path) as archive:
                    for name in archive.namelist():
                        display_name = display_zip_name(name)
                        if any(marker in Path(display_name).name.lower() for marker in LICENSE_MARKERS):
                            evidence.append(f"{path}!/{display_name}")
            except (BadZipFile, OSError):
                pass
    return evidence


def main() -> int:
    args = parse_args()
    source = args.source.expanduser().resolve()
    if not source.is_dir():
        print(f"source directory not found: {source}", file=sys.stderr)
        return 2

    global_path = find_global_archive(source)
    with ZipFile(global_path) as archive:
        layers = global_layer_names(archive)
        global_report, blockers = audit_global(archive, layers)
    licenses = license_evidence(source)
    source_attestation = {
        "kind": "owner_attested_public" if args.owner_attested_public else "not_provided",
        "note": "Owner states this is public data from China's Ministry of Natural Resources; retain provenance/version evidence before import."
        if args.owner_attested_public
        else None,
    }
    if not licenses and not args.owner_attested_public:
        blockers.insert(0, "no licence, source URL, seller authorization or redistribution grant was found in the supplied bundle")

    report = {
        "source_root": str(source),
        "global_archive": str(global_path),
        "global": global_report,
        "china_2023_archives": audit_china_archives(source),
        "license_evidence": licenses,
        "source_attestation": source_attestation,
        "production_blockers": blockers,
        "production_decision": "STAGING_ONLY" if blockers else "ELIGIBLE_FOR_IMPORT_REVIEW",
    }

    print("Administrative boundary source audit")
    print(f"Global archive: {global_path}")
    for level in range(4):
        item = report["global"]["levels"][f"ADM{level}"]
        print(f"ADM{level}: {item['dbf_records']:,} rows; {item['country_code_coverage']} country codes; {item['orphan_count']} orphans")
    print(f"China 2023 archives: {', '.join(sorted(report['china_2023_archives'])) or 'none'}")
    print(f"Licence evidence files: {len(licenses)}")
    print(f"Owner public-data attestation: {'yes' if args.owner_attested_public else 'no'}")
    print(f"Decision: {report['production_decision']}")
    for blocker in blockers:
        print(f"BLOCKER: {blocker}")

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"JSON report: {args.json.resolve()}")
    return 1 if args.strict and blockers else 0


if __name__ == "__main__":
    raise SystemExit(main())
