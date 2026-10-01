"""Genera assets/js/corpus.js a partir de los JSON de /data.

Uso:  python tools/build_corpus.py

El sitio embebe los datos en un .js (en lugar de usar fetch) para que
funcione tanto en GitHub Pages como abriendo index.html directamente
desde el disco (file://).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "assets" / "js" / "corpus.js"


def main() -> None:
    cases = json.loads((DATA / "bmm_cases.json").read_text(encoding="utf-8"))
    corpus = {}
    for case in cases:
        path = DATA / case["corpus_file"]
        corpus[case["case_id"]] = json.loads(path.read_text(encoding="utf-8"))

    js = (
        "/* Archivo generado por tools/build_corpus.py — no editar a mano. */\n"
        f"window.BMM_CASES = {json.dumps(cases, ensure_ascii=False, indent=1)};\n"
        f"window.BMM_CORPUS = {json.dumps(corpus, ensure_ascii=False, indent=1)};\n"
    )
    OUT.write_text(js, encoding="utf-8")
    chunks = sum(len(v) for v in corpus.values())
    print(f"OK -> {OUT.relative_to(ROOT)} ({len(cases)} casos, {chunks} fragmentos)")


if __name__ == "__main__":
    main()
