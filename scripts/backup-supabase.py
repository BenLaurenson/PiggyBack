#!/usr/bin/env python3
"""
Back up every public-schema table from a Supabase project to JSONL via the
Mgmt API SQL endpoint. No DB password needed — just the management token.

Pages 1000 rows at a time using OFFSET so it works for tables of any size
within a single function-call budget.
"""

import json
import os
import sys
import time
import urllib.request
from pathlib import Path

REF = sys.argv[1]
OUT_DIR = Path(sys.argv[2])
TOKEN = os.environ["SUPABASE_MANAGEMENT_TOKEN"]
PAGE = 1000

OUT_DIR.mkdir(parents=True, exist_ok=True)

import subprocess

def query(sql: str) -> list:
    # Use curl so we inherit the same network behavior that worked above.
    # The Supabase Mgmt API gated urllib's User-Agent with 403 Cloudflare.
    body = json.dumps({"query": sql})
    out = subprocess.run(
        [
            "curl", "-sS", "-X", "POST",
            "-H", f"Authorization: Bearer {TOKEN}",
            "-H", "Content-Type: application/json",
            "-H", "User-Agent: piggyback-backup/1.0",
            f"https://api.supabase.com/v1/projects/{REF}/database/query",
            "--data-binary", body,
            "--max-time", "120",
        ],
        capture_output=True, check=True,
    )
    return json.loads(out.stdout)

# Discover tables
tables = [r["tablename"] for r in query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
)]
print(f"[{REF}] {len(tables)} tables", flush=True)

# Track totals + manifest for sanity
manifest = {"project_ref": REF, "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "tables": {}}
total_rows = 0

for t in tables:
    # Quote identifier safely
    quoted = '"' + t.replace('"', '""') + '"'
    count_rows = query(f"SELECT count(*) AS n FROM public.{quoted};")
    n = count_rows[0]["n"]
    out_path = OUT_DIR / f"{t}.jsonl"
    written = 0
    with out_path.open("w") as f:
        offset = 0
        while True:
            rows = query(
                f"SELECT row_to_json(r) AS row FROM public.{quoted} r "
                f"ORDER BY r.ctid LIMIT {PAGE} OFFSET {offset};"
            )
            if not isinstance(rows, list):
                # Treat error responses as fatal — Supabase Mgmt API returns
                # `{"message": "..."}` on SQL errors.
                raise RuntimeError(f"Query for {t} returned non-list: {str(rows)[:300]}")
            if not rows:
                break
            for r in rows:
                f.write(json.dumps(r["row"]) + "\n")
                written += 1
            offset += PAGE
            if len(rows) < PAGE:
                break
    manifest["tables"][t] = {"expected": n, "written": written}
    total_rows += written
    print(f"  {t:40} {written:>7} rows", flush=True)

manifest["total_rows"] = total_rows
manifest["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
(OUT_DIR / "_manifest.json").write_text(json.dumps(manifest, indent=2))
print(f"[{REF}] DONE — {total_rows} rows total → {OUT_DIR}", flush=True)
