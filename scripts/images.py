#!/usr/bin/env python3
"""
Merge several Excel stock files into ONE table, then find & remove duplicates.

Usage:
    python merge_and_dedupe.py FILE1 FILE2 ... [--mode MODE] [--keep first|last] [--out merged_deduped.xlsx]

Modes (what counts as a duplicate in the merged table):
    exact      : every column identical, ignoring Source File / sl no.   (safest)
    code_loc   : same Item Code in the same Location Name              (default)
    code       : same Item Code anywhere (keeps ONE row per Item Code across all locations)

Output workbook sheets:
    Merged_Cleaned : the single de-duplicated table
    Removed_Rows   : every row that was dropped (with Source File, so you can audit)
    Summary        : rows per source file, rows removed, rows kept
"""
import argparse, os
import pandas as pd

HSR_RENAME = {"hsr pur price": "Purchase Rate"}


def load(path, idx, default_location):
    d = pd.read_excel(path, dtype=object)
    # drop "Total" footer rows
    d = d[d.iloc[:, 0].astype(str).str.strip().str.lower() != "total"].copy()
    # files with a repeated "Item Code" column (pandas names it "Item Code.1") -> drop the copy
    d = d.drop(columns=[c for c in d.columns if str(c).startswith("Item Code.")])
    d = d.rename(columns=HSR_RENAME)
    if "Location Name" not in d.columns:                  # e.g. the HSR opening file
        d.insert(0, "Location Name", default_location)
    d["Source File"] = os.path.basename(path)
    d["Source Row"] = range(2, len(d) + 2)                # approx. original Excel row number
    return d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--mode", choices=["exact", "code_loc", "code"], default="code_loc")
    ap.add_argument("--keep", choices=["first", "last"], default="first")
    ap.add_argument("--hsr-name", default="HSR", help="Location name for files that have no Location Name column")
    ap.add_argument("--out", default="merged_deduped.xlsx")
    a = ap.parse_args()

    merged = pd.concat([load(f, i, a.hsr_name) for i, f in enumerate(a.files)], ignore_index=True)
    merged["Item Code"] = merged["Item Code"].astype(str).str.strip()
    merged["Location Name"] = merged["Location Name"].astype(str).str.strip()

    # put the key columns first
    front = ["Location Name", "Item Code", "Source File", "Source Row"]
    merged = merged[front + [c for c in merged.columns if c not in front]]

    if a.mode == "exact":
        ignore = {"Source File", "Source Row", "sl no."}
        key = [c for c in merged.columns if c not in ignore]
    elif a.mode == "code_loc":
        key = ["Location Name", "Item Code"]
    else:
        key = ["Item Code"]

    dup = merged.duplicated(subset=key, keep=a.keep)
    cleaned, removed = merged[~dup], merged[dup]

    summary = (merged.groupby("Source File").size().rename("Rows in").to_frame()
               .join(removed.groupby("Source File").size().rename("Rows removed"))
               .join(cleaned.groupby("Source File").size().rename("Rows kept")).fillna(0).astype(int))
    summary.loc["TOTAL"] = summary.sum()

    try:                                   # xlsxwriter is much faster for ~100k rows
        import xlsxwriter  # noqa: F401
        engine = "xlsxwriter"
    except ImportError:
        engine = "openpyxl"
    with pd.ExcelWriter(a.out, engine=engine) as xw:
        cleaned.to_excel(xw, sheet_name="Merged_Cleaned", index=False)
        removed.to_excel(xw, sheet_name="Removed_Rows", index=False)
        summary.to_excel(xw, sheet_name="Summary")
        for ws in xw.sheets.values():
            if engine == "xlsxwriter":
                ws.freeze_panes(1, 0)
            else:
                ws.freeze_panes = "A2"
    print(summary.to_string())
    print(f"\nMode: {a.mode} | keep: {a.keep}\nSaved -> {a.out}")


if __name__ == "__main__":
    main()