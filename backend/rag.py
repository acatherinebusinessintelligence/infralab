"""RAG liviano para el Tutor IA: recuperación BM25 en Python puro.

Fuentes indexadas:
  - backend/knowledge/*.md : fichas de ISO/IEC 27001:2022, ITIL 4, COBIT 2019, Tier, BMM y metodología.
    Cada ficha empieza con «## [ID] Título», una línea opcional «tags: ...» y el texto.
  - data/bmm_corpus_cXX.json : expediente de cada caso (solo se recupera el del caso consultado).

No usa embeddings ni dependencias externas, para funcionar en PythonAnywhere
(incluida la cuenta gratuita) con bajo consumo de CPU.
"""
import glob
import json
import math
import os
import re
import unicodedata
from collections import Counter

FRAMEWORK_NAMES = {
    "iso27001": "ISO/IEC 27001:2022",
    "itil4": "ITIL 4",
    "cobit2019": "COBIT 2019",
    "tier": "Tier (Uptime Institute)",
    "bmm": "Business Motivation Model",
    "metodologia": "Metodología del curso",
}

STOPWORDS = set("""a al algo algunas algunos ante antes como con contra cual cuales cuando de del desde donde dos el ella ellas ellos en entre era es esa esas ese eso esos esta estan estas este esto estos fue fueron ha han hasta hay la las le les lo los mas me mi mis muy no nos o os otra otras otro otros para pero poco por porque que quien se sea segun ser si sin sobre son su sus tambien te tiene tienen todo todos tu un una uno unos y ya the of and to in for is on with""".split())

# Sinónimos frecuentes para mejorar la recuperación entre el lenguaje del estudiante y el de los marcos.
SYNONYMS = {
    "backup": ["respaldo", "copia"], "respaldo": ["backup"], "copia": ["backup"],
    "caida": ["disponibilidad", "incidente"], "lentitud": ["capacidad", "rendimiento", "latencia"],
    "saturacion": ["capacidad"], "mfa": ["autenticacion", "multifactor"], "contraseña": ["autenticacion", "credenciales"],
    "cambio": ["cambios"], "rollback": ["reversa"], "proveedor": ["proveedores", "terceros"],
    "nube": ["cloud"], "cloud": ["nube"], "sla": ["niveles", "servicio"], "vlan": ["segmentacion"],
    "firewall": ["red", "perimetro"], "logs": ["registro", "monitoreo"], "alertas": ["monitoreo", "eventos"],
    "dofa": ["evaluacion", "fortalezas", "debilidades"], "foda": ["dofa"], "swot": ["dofa"],
    "redundancia": ["disponibilidad", "spof"], "spof": ["redundancia", "punto", "unico", "falla"],
}


def normalize(text):
    text = unicodedata.normalize("NFD", str(text).lower())
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


def stem(word):
    for suf in ("aciones", "iciones", "ciones", "mente", "idades", "idad", "es", "s"):
        if len(word) > len(suf) + 3 and word.endswith(suf):
            return word[: -len(suf)] + ("cion" if suf in ("aciones", "iciones", "ciones") else "")
    return word


def tokenize(text, expand=False):
    words = re.findall(r"[a-z0-9]+(?:\.[0-9]+)*", normalize(text))
    out = []
    for w in words:
        if w in STOPWORDS or len(w) < 2:
            continue
        out.append(stem(w))
        if expand:
            out += [stem(s) for s in SYNONYMS.get(w, [])]
    return out


class KnowledgeBase:
    def __init__(self, knowledge_dir, data_dir=None, k1=1.4, b=0.75):
        self.k1, self.b = k1, b
        self.chunks = []
        self._load_markdown(knowledge_dir)
        if data_dir and os.path.isdir(data_dir):
            self._load_cases(data_dir)
        self._index()

    # ------------------------------------------------------------ carga
    def _load_markdown(self, folder):
        for path in sorted(glob.glob(os.path.join(folder, "*.md"))):
            key = os.path.splitext(os.path.basename(path))[0]
            framework = FRAMEWORK_NAMES.get(key, key)
            current = None
            for line in open(path, encoding="utf-8"):
                line = line.rstrip("\n")
                m = re.match(r"^## \[([^\]]+)\]\s*(.+)$", line)
                if m:
                    if current:
                        self.chunks.append(current)
                    current = {"id": m.group(1), "title": m.group(2).strip(), "framework": framework, "tags": "", "text": "", "case_id": None}
                elif current is not None:
                    if line.startswith("tags:"):
                        current["tags"] = line[5:].strip()
                    elif line.strip() and not line.startswith("#"):
                        current["text"] += (" " if current["text"] else "") + line.strip()
            if current:
                self.chunks.append(current)

    def _load_cases(self, folder):
        for path in sorted(glob.glob(os.path.join(folder, "bmm_corpus_c*.json"))):
            try:
                items = json.load(open(path, encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            for it in items:
                self.chunks.append({
                    "id": it.get("chunk_id"), "title": it.get("section", ""), "framework": f"Caso {it.get('case_id')}",
                    "tags": " ".join(it.get("tags", [])), "text": it.get("text", ""), "case_id": it.get("case_id"),
                })

    # ------------------------------------------------------------ índice BM25
    def _index(self):
        self.docs = []
        for c in self.chunks:
            toks = tokenize(f"{c['title']} {c['title']} {c['tags']} {c['tags']} {c['id']} {c['text']}")
            self.docs.append(Counter(toks))
        self.lengths = [sum(d.values()) for d in self.docs]
        self.avgdl = (sum(self.lengths) / len(self.lengths)) if self.lengths else 1
        df = Counter()
        for d in self.docs:
            df.update(d.keys())
        n = len(self.docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        self.by_id = {c["id"]: c for c in self.chunks}

    def _score(self, q_tokens, i):
        d, dl, s = self.docs[i], self.lengths[i], 0.0
        for t, qf in q_tokens.items():
            f = d.get(t)
            if f:
                s += self.idf[t] * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * dl / self.avgdl)) * (1 + math.log(qf))
        return s

    def search(self, query, k=6, framework=None, case_id=None, include_cases=False, exclude=()):
        q = Counter(tokenize(query, expand=True))
        if not q:
            return []
        scored = []
        for i, c in enumerate(self.chunks):
            if c["id"] in exclude:
                continue
            if c["case_id"]:
                if not include_cases or (case_id and c["case_id"] != case_id):
                    continue
            elif include_cases == "only":
                continue
            if framework and c["framework"] != framework:
                continue
            s = self._score(q, i)
            if s > 0:
                scored.append((s, c))
        scored.sort(key=lambda x: -x[0])
        return [c for _, c in scored[:k]]

    def stats(self):
        return dict(Counter(c["framework"] for c in self.chunks if not c["case_id"]))

    # ------------------------------------------------------------ recuperación para el tutor
    SECTION_NEEDS = {
        "bmm": [("Business Motivation Model", 3)],
        "itil": [("ITIL 4", 2), ("COBIT 2019", 1), ("ISO/IEC 27001:2022", 2)],
        "tier": [("Tier (Uptime Institute)", 2)],
        "calculos": [("Metodología del curso", 1)],
        "laboratorio": [("Metodología del curso", 2), ("Tier (Uptime Institute)", 1)],
        "matriz": [("Metodología del curso", 2)],
    }
    PINNED = {"calculos": ["MET-DISP"], "laboratorio": ["MET-SERIE", "MET-SPOF"], "matriz": ["MET-SUST"], "tier": ["TIER-USO"], "bmm": ["BMM-REL", "BMM-INFRA"]}

    def retrieve(self, case_id, sections, content, context, max_chunks=14, case_chunks=3):
        query = " ".join([
            " ".join(sections),
            str(context.get("reto", "")), str(context.get("pregunta_central", "")),
            json.dumps(content, ensure_ascii=False)[:6000],
        ])
        picked, seen = [], set()

        def add(items):
            for c in items:
                if c and c["id"] not in seen and len(picked) < max_chunks:
                    picked.append(c)
                    seen.add(c["id"])

        # El expediente del caso siempre tiene cupo reservado.
        case_hits = self.search(query, k=case_chunks, case_id=case_id, include_cases="only")
        max_chunks -= len(case_hits)
        for s in sections:
            add([self.by_id.get(i) for i in self.PINNED.get(s, [])])
            for fw, n in self.SECTION_NEEDS.get(s, []):
                add(self.search(query, k=n, framework=fw, exclude=seen))
        add(self.search(query, k=6, exclude=seen))
        max_chunks += len(case_hits)
        add(case_hits)
        return picked


def format_sources(chunks, max_chars=900):
    lines = []
    for c in chunks:
        text = c["text"] if len(c["text"]) <= max_chars else c["text"][: max_chars - 1] + "…"
        lines.append(f"[{c['id']}] ({c['framework']}) {c['title']}: {text}")
    return "\n".join(lines)
