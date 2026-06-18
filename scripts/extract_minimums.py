#!/usr/bin/env python3
"""
One-time ETL: extract the BAC-2025 minimum-averages table from the PDF into
clean JSON (institutions / specialties / offerings).

Approach: anchor on coordinates.
- Each FILIERE CODE (in the "Code Fil" x-band) is one offering row. Anchoring on
  it makes it impossible to merge two offerings (unlike grouping all words by y,
  which loses ~4% of rows when two rows are <4px apart).
- The institution is the nearest institution code at/above the filiere's y.
- Min scores are the numbers in the Min1/2/3 x-bands at the same y.
- Long institution names wrap to a following line; we collect name words up to
  the next anchor.

Run:  python scripts/extract_minimums.py
Out:  data/moyennes_minimales_2025.json
"""
import json
import re
import pdfplumber

PDF = r"Moyennes-minimales-BAC-2025.pdf"
OUT = r"data/moyennes_minimales_2025.json"
YEAR = 2025
YTOL = 4  # vertical tolerance for "same row"

ETB_RE = re.compile(r"^[A-Z]\d{2}$")
FIL_RE = re.compile(r"^[A-Z]\d{2}[A-Z]{3}\d{2}$")
NUM_RE = re.compile(r"^\d{1,2}\.\d{2}$")
NOISE_RE = re.compile(
    r"\d+/274|Pour les moyennes|minimales avec|R.?publique|Minist|Moyennes minimales|Etablissement|E\.S\.I"
)
HEADER_TOKENS = {"Etb", "Code", "Fil", "Filiere", "Min1", "Min2", "Min3"}
# Institution names are ALL-CAPS; footer/header prose is mixed-case French.
NAME_WORD_RE = re.compile(r"^[A-Z0-9.'()\-/&,]+$")


def classify(name: str) -> str:
    n = re.sub(r"[.\-]", " ", name.upper())
    n = re.sub(r"\s+", " ", n).strip()
    pad = f" {n} "
    if "ECOLE NORMALE SUPERIEURE" in n or n.startswith("ANNEXE") or " ENS " in pad:
        return "ecole_normale_superieure"
    if (
        "ECOLE NATIONALE SUPERIEURE" in n or "ECOLE SUPERIEURE" in n or "ECOLE SUP " in n
        or "ECOLE NATIONALE" in n or "ECOLE POLYTECHNIQUE" in n or "ECOLE DES HAUTES" in n
        or "ECOLE PREPARATOIRE" in n or n.startswith("E S ") or n.startswith("E N S")
    ):
        return "ecole_nationale_superieure"
    if "RECRUTEMENT NATIONAL" in n:
        return "recrutement_national"
    if "CENTRE DE FORMATION" in n:
        return "centre_formation"
    if "CENTRE UNIV" in n or n.startswith("C UNIV") or " C U " in pad:
        return "centre_universitaire"
    if (
        "UNIVERSITE" in n or n.startswith("UNIV") or "USTHB" in n or "USTO" in n
        or n.startswith("U S T") or "SCIENCES ET DE LA TECHNOLOGIE" in n
    ):
        return "universite"
    if "INSTITUT" in n or "INFS" in n or "ENST" in n:
        return "institut"
    return "autre"


def _min(a, b):
    vals = [v for v in (a, b) if v is not None]
    return min(vals) if vals else None


def num_in_band(words, lo, hi, top):
    """First number whose x0 is in [lo,hi) and y within YTOL of `top`."""
    for w in words:
        if lo <= w["x0"] < hi and abs(w["top"] - top) <= YTOL:
            if NUM_RE.match(w["text"]):
                return float(w["text"])
            if w["text"] == "--":
                return None
    return None


def main():
    institutions = {}   # code -> best (longest) name
    spec_names = {}      # filiere_code -> {name: count}
    offerings = {}       # (inst_code, fil_code) -> {min1,min2,min3}

    last_inst = None  # carries across page boundaries

    with pdfplumber.open(PDF) as pdf:
        for page in pdf.pages:
            words = [w for w in page.extract_words() if not NOISE_RE.search(w["text"])]

            etb_anchors = sorted(
                [(w["top"], w["text"]) for w in words if w["x0"] < 90 and ETB_RE.match(w["text"])]
            )
            fil_anchors = sorted(
                [(w["top"], w["text"]) for w in words if 295 <= w["x0"] < 352 and FIL_RE.match(w["text"])]
            )
            anchor_tops = sorted(t for t, _ in etb_anchors + fil_anchors)

            def next_boundary(T):
                above = [t for t in anchor_tops if t > T + YTOL]
                return min(above) if above else 1e9

            # 1) Institution names (etb anchors), with wrapped-name continuation.
            for T, code in etb_anchors:
                bound = min(next_boundary(T), T + 40)  # at most ~2 wrapped lines
                parts = [
                    w["text"] for w in words
                    if w["x0"] < 295 and (T - 2) <= w["top"] < bound
                    and not ETB_RE.match(w["text"]) and w["text"] not in HEADER_TOKENS
                    and NAME_WORD_RE.match(w["text"])  # all-caps only (drops footer prose)
                ]
                nm = " ".join(parts).strip()
                if nm and len(nm) > len(institutions.get(code, "")):
                    institutions[code] = nm

            # 2) Offerings (fil anchors). Institution = nearest etb at/above.
            for T, fil in fil_anchors:
                above = [(t, c) for t, c in etb_anchors if t <= T + YTOL]
                if above:
                    last_inst = max(above, key=lambda tc: tc[0])[1]
                if last_inst is None:
                    continue
                rec = {
                    "min1": num_in_band(words, 628, 662, T),
                    "min2": num_in_band(words, 662, 694, T),
                    "min3": num_in_band(words, 694, 9999, T),
                }
                key = (last_inst, fil)
                if key in offerings:
                    p = offerings[key]
                    rec = {
                        "min1": _min(p["min1"], rec["min1"]),
                        "min2": _min(p["min2"], rec["min2"]),
                        "min3": _min(p["min3"], rec["min3"]),
                    }
                offerings[key] = rec

                # Candidate specialty name (filiere band, same row; skip école
                # name-overflow rows and leading flag tokens).
                fname_words = [
                    w["text"] for w in words
                    if 352 <= w["x0"] < 628 and abs(w["top"] - T) <= YTOL
                ]
                fname = " ".join(fname_words).strip()
                if fname and "ECOLE" not in fname.upper():
                    toks = fname.split()
                    while toks and re.fullmatch(r"[A-Z]{2,4}", toks[0]):
                        toks.pop(0)
                    fname = " ".join(toks).strip()
                    if fname:
                        spec_names.setdefault(fil, {})
                        spec_names[fil][fname] = spec_names[fil].get(fname, 0) + 1

    inst_list = [{"code": c, "name": n, "type": classify(n)} for c, n in sorted(institutions.items())]
    spec_list, seen = [], set()
    for code, names in sorted(spec_names.items()):
        spec_list.append({"filiere_code": code, "filiere_name": max(names.items(), key=lambda kv: kv[1])[0]})
        seen.add(code)
    off_list = []
    for (inst, fil), m in sorted(offerings.items()):
        off_list.append({"institution_code": inst, "filiere_code": fil, **m, "year": YEAR})
        if fil not in seen:
            spec_list.append({"filiere_code": fil, "filiere_name": fil})
            seen.add(fil)

    json.dump({"institutions": inst_list, "specialties": spec_list, "offerings": off_list},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"institutions: {len(inst_list)}  specialties: {len(spec_list)}  offerings: {len(off_list)}")
    byc = {i["code"]: i for i in inst_list}
    for code in ("P04", "P07"):
        i = byc.get(code); offs = [o for o in off_list if o["institution_code"] == code]
        print(f"  {code}: {i['name'] if i else '??'} [{i['type'] if i else '?'}] {offs[:1]}")
    med = [o for o in off_list if o["institution_code"] == "C99" and o["filiere_code"].startswith("P01")]
    print(f"  MEDECINE(C99/P01*): {med[:1]}")
    print(f"  INFORMATIQUE (C01*): {sum(1 for o in off_list if o['filiere_code'].startswith('C01'))}")
    t = {}
    for i in inst_list:
        t[i["type"]] = t.get(i["type"], 0) + 1
    print("  types:", t)


if __name__ == "__main__":
    main()
