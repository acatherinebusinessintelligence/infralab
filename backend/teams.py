"""Equipos, códigos de acceso, seguimiento y panel administrativo.

- Los equipos se cargan desde la exportación CSV de «Auto-selección de grupo» de Moodle (un archivo por NRC).
- Cada equipo recibe un código; el estudiante ingresa con ese código y su correo institucional.
- El docente administra periodos, NRC, equipos e integrantes desde /admin.
"""
import csv
import hmac
import io
import json
import os
import re
import secrets
from datetime import datetime, timezone
from functools import wraps

from flask import Blueprint, Response, current_app, jsonify, request, send_from_directory, session
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from storage import get_db

bp = Blueprint("teams", __name__)
ADMIN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "admin")
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # sin 0/O, 1/I/L
TOKEN_MAX_AGE = 60 * 60 * 24 * 30  # 30 días


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def clip(v, n=200):
    return str(v or "").strip()[:n]


# ------------------------------------------------------------------ lectura del CSV de Moodle
MEMBER_RE = re.compile(r"^(?:member|miembro|integrante)\s*(\d+)\s+(.+)$", re.I)
FIELD_ALIASES = {
    "username": ("username", "nombre de usuario", "usuario"),
    "firstname": ("firstname", "first name", "nombre"),
    "lastname": ("lastname", "last name", "apellido", "apellidos"),
    "email": ("email", "correo", "correo electrónico", "dirección de correo"),
}


def _field(label):
    label = label.strip().lower()
    for key, aliases in FIELD_ALIASES.items():
        if label in aliases:
            return key
    return None  # p. ej. «ID Number»: no se guarda


def nrc_from_filename(name):
    m = re.search(r"(?:^|[-_ ])(\d{5})(?=[_\-. ]|$)", name or "")
    return m.group(1) if m else ""


def case_from_text(text):
    m = re.search(r"caso\s*0?(\d{1,2})\b", text or "", re.I)
    return f"C{int(m.group(1)):02d}" if m and 1 <= int(m.group(1)) <= 15 else None


def parse_moodle_csv(raw: bytes, filename=""):
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    lines = text.splitlines()
    delim = ","
    if lines and lines[0].lower().startswith("sep="):
        delim = lines[0][4:5] or ","
        lines = lines[1:]
    elif lines and lines[0].count(";") > lines[0].count(","):
        delim = ";"
    rows = list(csv.reader(io.StringIO("\n".join(lines)), delimiter=delim))
    if not rows:
        raise ValueError("El archivo está vacío.")
    header = [h.strip() for h in rows[0]]
    low = [h.lower() for h in header]

    def col(*names):
        for n in names:
            if n in low:
                return low.index(n)
        return None

    c_id = col("group id", "id de grupo", "id del grupo")
    c_name = col("group name", "nombre del grupo", "grupo")
    c_desc = col("group description", "descripción del grupo", "descripción")
    if c_name is None:
        raise ValueError("No se encontró la columna «Group Name» / «Nombre del grupo». ¿Es la exportación de Auto-selección de grupo?")
    member_cols = {}
    for i, h in enumerate(header):
        m = MEMBER_RE.match(h)
        if m:
            key = _field(m.group(2))
            if key:
                member_cols.setdefault(int(m.group(1)), {})[key] = i
    teams = []
    for r in rows[1:]:
        if not any(c.strip() for c in r):
            continue
        get = lambda i: r[i].strip() if i is not None and i < len(r) else ""
        members = []
        for _, cols in sorted(member_cols.items()):
            email = get(cols.get("email")).lower()
            username = get(cols.get("username")).lower()
            if not email and not username:
                continue
            members.append({"username": username, "email": email or username, "firstname": get(cols.get("firstname")), "lastname": get(cols.get("lastname"))})
        desc = get(c_desc)
        teams.append({"ext_id": get(c_id) or get(c_name), "name": get(c_name), "case_id": case_from_text(desc) or case_from_text(get(c_name)), "members": members})
    return {"nrc": nrc_from_filename(filename), "filename": filename, "teams": teams}


def new_code(db, nrc, team_name):
    num = re.search(r"(\d+)", team_name or "")
    num = f"{int(num.group(1)):02d}" if num else "00"
    while True:
        code = f"{nrc}-{num}-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(5))
        if not db.execute("SELECT 1 FROM teams WHERE code=?", (code,)).fetchone():
            return code


# ------------------------------------------------------------------ autenticación
def serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="infralab-team")


def admin_ok():
    if session.get("admin"):
        return True
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    expected = current_app.config.get("TEACHER_TOKEN") or ""
    return bool(expected) and bool(token) and hmac.compare_digest(token, expected)


def admin_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        if not admin_ok():
            return jsonify(error="No autorizado"), 401
        if request.method not in ("GET", "HEAD") and session.get("admin") and request.headers.get("X-Requested-With") != "InfraLab":
            return jsonify(error="Solicitud rechazada"), 400  # protección CSRF para la sesión del panel
        return fn(*a, **kw)
    return wrapper


def current_student():
    """Devuelve (team, member) si el token es válido y ambos siguen activos; si no, None."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        data = serializer().loads(auth[7:], max_age=TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    db = get_db()
    row = db.execute(
        """SELECT t.*, m.id AS m_id, m.firstname AS m_first, m.lastname AS m_last, m.email AS m_email
           FROM teams t JOIN members m ON m.team_id = t.id JOIN periods p ON p.code = t.period
           WHERE t.id=? AND m.id=? AND t.active=1 AND m.active=1 AND p.active=1""",
        (data.get("t"), data.get("m")),
    ).fetchone()
    return row


def team_public(db, team_id):
    t = db.execute("SELECT * FROM teams WHERE id=?", (team_id,)).fetchone()
    ms = db.execute("SELECT firstname, lastname FROM members WHERE team_id=? AND active=1 ORDER BY firstname", (team_id,)).fetchall()
    return {"id": t["id"], "name": t["name"], "nrc": t["nrc"], "period": t["period"], "case_id": t["case_id"],
            "members": [f"{m['firstname']} {m['lastname']}".strip() for m in ms]}


@bp.post("/api/auth/login")
def student_login():
    body = request.get_json(silent=True) or {}
    code = re.sub(r"\s+", "", clip(body.get("code"), 40)).upper()
    email = clip(body.get("email"), 200).lower()
    if not code or not email:
        return jsonify(error="Escribe el código del equipo y tu correo institucional."), 400
    db = get_db()
    team = db.execute("SELECT t.* FROM teams t JOIN periods p ON p.code=t.period WHERE t.code=? AND t.active=1 AND p.active=1", (code,)).fetchone()
    member = team and db.execute("SELECT * FROM members WHERE team_id=? AND active=1 AND (email=? OR username=?)", (team["id"], email, email)).fetchone()
    if not team or not member:
        return jsonify(error="El código no existe, el equipo no está activo o tu correo no pertenece a ese equipo. Verifica con tu docente."), 401
    db.execute("INSERT INTO logins (team_id, member_id, at, ua) VALUES (?,?,?,?)", (team["id"], member["id"], now_iso(), clip(request.headers.get("User-Agent"), 160)))
    db.commit()
    token = serializer().dumps({"t": team["id"], "m": member["id"]})
    return jsonify(token=token, team=team_public(db, team["id"]), member={"id": member["id"], "firstname": member["firstname"], "lastname": member["lastname"], "email": member["email"]})


@bp.get("/api/auth/me")
def student_me():
    st = current_student()
    if not st:
        return jsonify(error="Sesión vencida o equipo retirado. Ingresa de nuevo."), 401
    return jsonify(team=team_public(get_db(), st["id"]), member={"id": st["m_id"], "firstname": st["m_first"], "lastname": st["m_last"], "email": st["m_email"]})


@bp.post("/api/progress")
def student_progress():
    st = current_student()
    if not st:
        return jsonify(error="No autorizado"), 401
    body = request.get_json(silent=True) or {}
    case_id = clip(body.get("case_id"), 8) or "general"
    data = json.dumps(body.get("summary") or {}, ensure_ascii=False)[:20000]
    db = get_db()
    db.execute("""INSERT INTO progress (team_id, member_id, case_id, data, updated_at) VALUES (?,?,?,?,?)
                  ON CONFLICT(team_id, member_id, case_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at""",
               (st["id"], st["m_id"], case_id, data, now_iso()))
    db.commit()
    return jsonify(ok=True)


# ------------------------------------------------------------------ panel administrativo (HTML)
@bp.get("/admin")
@bp.get("/admin/")
def admin_page():
    return send_from_directory(ADMIN_DIR, "index.html")


@bp.get("/admin/<path:fname>")
def admin_static(fname):
    return send_from_directory(ADMIN_DIR, fname)


@bp.post("/api/admin/login")
def admin_login():
    pwd = clip((request.get_json(silent=True) or {}).get("password"), 200)
    expected = current_app.config.get("ADMIN_PASSWORD") or current_app.config.get("TEACHER_TOKEN") or ""
    if not expected or not hmac.compare_digest(pwd, expected):
        return jsonify(error="Contraseña incorrecta"), 401
    session.clear()
    session["admin"] = True
    session.permanent = True
    return jsonify(ok=True)


@bp.post("/api/admin/logout")
def admin_logout():
    session.clear()
    return jsonify(ok=True)


@bp.get("/api/admin/session")
def admin_session():
    return jsonify(admin=admin_ok())


# ------------------------------------------------------------------ periodos y NRC
@bp.get("/api/admin/overview")
@admin_required
def admin_overview():
    db = get_db()
    periods = [dict(r) for r in db.execute("SELECT * FROM periods ORDER BY code DESC").fetchall()]
    nrcs = [dict(r) for r in db.execute(
        """SELECT t.period, t.nrc, COUNT(*) teams, SUM(t.active) active_teams,
                  (SELECT COUNT(*) FROM members m JOIN teams t2 ON t2.id=m.team_id WHERE t2.period=t.period AND t2.nrc=t.nrc AND m.active=1 AND t2.active=1) members
           FROM teams t GROUP BY t.period, t.nrc ORDER BY t.period DESC, t.nrc""").fetchall()]
    imports = [dict(r) for r in db.execute("SELECT * FROM imports ORDER BY at DESC LIMIT 30").fetchall()]
    return jsonify(periods=periods, nrcs=nrcs, imports=imports)


@bp.post("/api/admin/periods")
@admin_required
def admin_period_upsert():
    b = request.get_json(silent=True) or {}
    code = clip(b.get("code"), 20)
    if not re.fullmatch(r"\d{4}-\d{1,2}", code):
        return jsonify(error="Usa el formato AAAA-S, por ejemplo 2026-2."), 400
    db = get_db()
    db.execute("""INSERT INTO periods (code, name, active, created_at) VALUES (?,?,?,?)
                  ON CONFLICT(code) DO UPDATE SET name=excluded.name, active=excluded.active""",
               (code, clip(b.get("name"), 80) or f"Periodo {code}", 1 if b.get("active", True) else 0, now_iso()))
    db.commit()
    return jsonify(ok=True)


@bp.post("/api/admin/nrc/retire")
@admin_required
def admin_nrc_retire():
    b = request.get_json(silent=True) or {}
    db = get_db()
    db.execute("UPDATE teams SET active=?, updated_at=? WHERE period=? AND nrc=?", (1 if b.get("active") else 0, now_iso(), clip(b.get("period"), 20), clip(b.get("nrc"), 10)))
    db.commit()
    return jsonify(ok=True)


@bp.post("/api/admin/nrc/delete")
@admin_required
def admin_nrc_delete():
    b = request.get_json(silent=True) or {}
    if b.get("confirm") != "ELIMINAR":
        return jsonify(error="Confirma escribiendo ELIMINAR."), 400
    db = get_db()
    db.execute("DELETE FROM teams WHERE period=? AND nrc=?", (clip(b.get("period"), 20), clip(b.get("nrc"), 10)))
    db.commit()
    return jsonify(ok=True)


# ------------------------------------------------------------------ importación de CSV
@bp.post("/api/admin/import/preview")
@admin_required
def admin_import_preview():
    period = clip(request.form.get("period"), 20)
    if not period:
        return jsonify(error="Elige el periodo."), 400
    db = get_db()
    out = []
    for f in request.files.getlist("files"):
        try:
            parsed = parse_moodle_csv(f.read(), f.filename)
        except ValueError as exc:
            out.append({"filename": f.filename, "error": str(exc)})
            continue
        parsed["nrc"] = clip(request.form.get(f"nrc_{f.filename}"), 10) or parsed["nrc"]
        existing = {r["ext_id"]: r for r in db.execute("SELECT * FROM teams WHERE period=? AND nrc=?", (period, parsed["nrc"])).fetchall()}
        file_ids = {t["ext_id"] for t in parsed["teams"]}
        diff = {"new_teams": 0, "updated_teams": 0, "retire_teams": [r["name"] for k, r in existing.items() if k not in file_ids and r["active"]],
                "members_add": 0, "members_remove": 0, "empty_teams": sum(1 for t in parsed["teams"] if not t["members"])}
        for t in parsed["teams"]:
            row = existing.get(t["ext_id"])
            if not row:
                diff["new_teams"] += 1
                diff["members_add"] += len(t["members"])
                continue
            diff["updated_teams"] += 1
            cur = {r["email"] for r in db.execute("SELECT email FROM members WHERE team_id=? AND active=1", (row["id"],)).fetchall()}
            new = {m["email"] for m in t["members"]}
            diff["members_add"] += len(new - cur)
            diff["members_remove"] += len(cur - new)
        parsed["diff"] = diff
        parsed["members_total"] = sum(len(t["members"]) for t in parsed["teams"])
        out.append(parsed)
    return jsonify(period=period, files=out)


@bp.post("/api/admin/import/commit")
@admin_required
def admin_import_commit():
    b = request.get_json(silent=True) or {}
    period = clip(b.get("period"), 20)
    mode = "sync" if b.get("mode") != "add" else "add"
    keep_empty = bool(b.get("keep_empty", True))
    db = get_db()
    if not db.execute("SELECT 1 FROM periods WHERE code=?", (period,)).fetchone():
        db.execute("INSERT INTO periods (code, name, active, created_at) VALUES (?,?,1,?)", (period, f"Periodo {period}", now_iso()))
    ts = now_iso()
    summary = []
    for f in b.get("files") or []:
        nrc = clip(f.get("nrc"), 10)
        if not re.fullmatch(r"\d{4,6}", nrc):
            summary.append({"filename": f.get("filename"), "error": "NRC inválido"})
            continue
        seen_ids, n_teams, n_members = set(), 0, 0
        for t in f.get("teams") or []:
            members = [m for m in (t.get("members") or []) if clip(m.get("email"))][:12]
            if not members and not keep_empty:
                continue
            ext_id = clip(t.get("ext_id"), 40) or clip(t.get("name"), 80)
            seen_ids.add(ext_id)
            row = db.execute("SELECT * FROM teams WHERE period=? AND nrc=? AND ext_id=?", (period, nrc, ext_id)).fetchone()
            case_id = t.get("case_id") if re.fullmatch(r"C\d{2}", str(t.get("case_id") or "")) else None
            if row:
                db.execute("UPDATE teams SET name=?, case_id=COALESCE(case_id, ?), active=1, updated_at=? WHERE id=?", (clip(t.get("name"), 80), case_id, ts, row["id"]))
                team_id = row["id"]
            else:
                cur = db.execute("INSERT INTO teams (period, nrc, ext_id, name, case_id, code, active, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?)",
                                 (period, nrc, ext_id, clip(t.get("name"), 80), case_id, new_code(db, nrc, t.get("name")), ts, ts))
                team_id = cur.lastrowid
            n_teams += 1
            emails = set()
            for m in members:
                email = clip(m.get("email"), 200).lower()
                emails.add(email)
                # Un estudiante pertenece a un solo equipo activo por periodo: si cambió de grupo, se retira del anterior.
                db.execute("""UPDATE members SET active=0, updated_at=? WHERE email=? AND team_id<>? AND active=1
                              AND team_id IN (SELECT id FROM teams WHERE period=?)""", (ts, email, team_id, period))
                db.execute("""INSERT INTO members (team_id, username, email, firstname, lastname, active, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)
                              ON CONFLICT(team_id, email) DO UPDATE SET username=excluded.username, firstname=excluded.firstname, lastname=excluded.lastname, active=1, updated_at=excluded.updated_at""",
                           (team_id, clip(m.get("username"), 200).lower(), email, clip(m.get("firstname"), 80), clip(m.get("lastname"), 80), ts, ts))
                n_members += 1
            if mode == "sync":
                params = [ts, team_id] + sorted(emails)
                ph = ",".join("?" * len(emails)) or "''"
                db.execute(f"UPDATE members SET active=0, updated_at=? WHERE team_id=? AND active=1 AND email NOT IN ({ph})", params)
        if mode == "sync":
            ph = ",".join("?" * len(seen_ids)) or "''"
            db.execute(f"UPDATE teams SET active=0, updated_at=? WHERE period=? AND nrc=? AND active=1 AND ext_id NOT IN ({ph})", [ts, period, nrc] + sorted(seen_ids))
        db.execute("INSERT INTO imports (period, nrc, filename, mode, teams_n, members_n, at) VALUES (?,?,?,?,?,?,?)", (period, nrc, clip(f.get("filename"), 200), mode, n_teams, n_members, ts))
        summary.append({"filename": f.get("filename"), "nrc": nrc, "teams": n_teams, "members": n_members})
    db.commit()
    return jsonify(ok=True, summary=summary)


# ------------------------------------------------------------------ equipos e integrantes
def team_stats(db, team_id):
    lg = db.execute("SELECT COUNT(*) n, MAX(at) last, COUNT(DISTINCT member_id) people FROM logins WHERE team_id=?", (team_id,)).fetchone()
    sb = db.execute("SELECT COUNT(*) n, MAX(created_at) last FROM submissions WHERE team_id=? AND feedback IS NOT NULL", (team_id,)).fetchone()
    lvl = db.execute("SELECT level FROM submissions WHERE team_id=? AND level IS NOT NULL ORDER BY created_at DESC LIMIT 1", (team_id,)).fetchone()
    prog = {}
    for r in db.execute("""SELECT p.data, p.updated_at FROM progress p JOIN members m ON m.id = p.member_id
                           WHERE p.team_id=? AND m.active=1 ORDER BY p.updated_at""", (team_id,)).fetchall():
        d = json.loads(r["data"] or "{}")
        for k, v in d.items():  # se queda con el mejor valor del equipo para cada indicador
            if isinstance(v, (int, float)):
                prog[k] = max(prog.get(k, 0), v)
        prog["updated_at"] = r["updated_at"]
    # Mentor IA: ítems del caso asignado que el equipo ya resolvió, revisiones y pistas pedidas.
    case_id = db.execute("SELECT case_id FROM teams WHERE id=?", (team_id,)).fetchone()["case_id"]
    mt = {"ok": 0, "total": 0, "checks": 0, "hints": 0}
    if case_id:
        best = db.execute("""SELECT item, MIN(CASE verdict WHEN 'correcto' THEN 1 WHEN 'parcial' THEN 2 WHEN 'incorrecto' THEN 3 END) b,
                                    COUNT(CASE WHEN kind='check' THEN 1 END) c, COUNT(CASE WHEN kind='hint' THEN 1 END) h
                             FROM mentor_events WHERE team_id=? AND case_id=? GROUP BY item""", (team_id, case_id)).fetchall()
        key = db.execute("SELECT data FROM answer_keys WHERE case_id=?", (case_id,)).fetchone()
        mt = {"ok": sum(1 for r in best if r["b"] == 1), "total": len(json.loads(key["data"]).get("items", {})) if key else 0,
              "checks": sum(r["c"] for r in best), "hints": sum(r["h"] for r in best)}
    return {"logins": lg["n"], "last_access": lg["last"], "people_in": lg["people"], "submissions": sb["n"], "last_submission": sb["last"],
            "last_level": lvl["level"] if lvl else None, "progress": prog, "mentor": mt}


@bp.get("/api/admin/teams")
@admin_required
def admin_teams():
    db = get_db()
    q, args = "SELECT * FROM teams WHERE 1=1", []
    for k in ("period", "nrc"):
        v = clip(request.args.get(k), 20)
        if v:
            q += f" AND {k}=?"
            args.append(v)
    if request.args.get("active") in ("0", "1"):
        q += " AND active=?"
        args.append(int(request.args["active"]))
    q += " ORDER BY period DESC, nrc, CAST(substr(name, instr(name,' ')+1) AS INTEGER), name"
    search = clip(request.args.get("q"), 80).lower()
    out = []
    for t in db.execute(q, args).fetchall():
        ms = [dict(m) for m in db.execute("SELECT id, username, email, firstname, lastname, active FROM members WHERE team_id=? ORDER BY active DESC, firstname", (t["id"],)).fetchall()]
        if search and search not in (t["name"] + " " + t["code"] + " " + " ".join(f"{m['firstname']} {m['lastname']} {m['email']}" for m in ms)).lower():
            continue
        out.append(dict(t) | {"members": ms, "stats": team_stats(db, t["id"])})
    return jsonify(items=out)


@bp.get("/api/admin/teams/<int:team_id>")
@admin_required
def admin_team_detail(team_id):
    db = get_db()
    t = db.execute("SELECT * FROM teams WHERE id=?", (team_id,)).fetchone()
    if not t:
        return jsonify(error="No encontrado"), 404
    members = []
    for m in db.execute("SELECT * FROM members WHERE team_id=? ORDER BY active DESC, firstname", (team_id,)).fetchall():
        lg = db.execute("SELECT COUNT(*) n, MAX(at) last FROM logins WHERE member_id=?", (m["id"],)).fetchone()
        pr = [dict(r) | {"data": json.loads(r["data"] or "{}")} for r in db.execute("SELECT case_id, data, updated_at FROM progress WHERE member_id=? AND team_id=?", (m["id"], team_id)).fetchall()]
        members.append(dict(m) | {"logins": lg["n"], "last_access": lg["last"], "progress": pr})
    subs = [dict(r) | {"sections": json.loads(r["sections"] or "[]")} for r in db.execute(
        "SELECT id, created_at, case_id, sections, level, member_id, error FROM submissions WHERE team_id=? ORDER BY created_at DESC LIMIT 100", (team_id,)).fetchall()]
    logins = [dict(r) for r in db.execute("SELECT l.at, m.firstname, m.lastname FROM logins l JOIN members m ON m.id=l.member_id WHERE l.team_id=? ORDER BY l.at DESC LIMIT 50", (team_id,)).fetchall()]
    return jsonify(team=dict(t), members=members, submissions=subs, logins=logins, stats=team_stats(db, team_id))


@bp.post("/api/admin/teams")
@admin_required
def admin_team_create():
    b = request.get_json(silent=True) or {}
    period, nrc, name = clip(b.get("period"), 20), clip(b.get("nrc"), 10), clip(b.get("name"), 80)
    if not (period and nrc and name):
        return jsonify(error="Periodo, NRC y nombre son obligatorios."), 400
    db = get_db()
    if not db.execute("SELECT 1 FROM periods WHERE code=?", (period,)).fetchone():
        db.execute("INSERT INTO periods (code, name, active, created_at) VALUES (?,?,1,?)", (period, f"Periodo {period}", now_iso()))
    ts = now_iso()
    cur = db.execute("INSERT INTO teams (period, nrc, ext_id, name, case_id, code, active, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?)",
                     (period, nrc, "manual-" + secrets.token_hex(4), name, clip(b.get("case_id"), 4) or None, new_code(db, nrc, name), ts, ts))
    db.commit()
    return jsonify(ok=True, id=cur.lastrowid)


@bp.patch("/api/admin/teams/<int:team_id>")
@admin_required
def admin_team_update(team_id):
    b = request.get_json(silent=True) or {}
    db = get_db()
    sets, args = [], []
    if "name" in b:
        sets.append("name=?"); args.append(clip(b["name"], 80))
    if "case_id" in b:
        cid = clip(b["case_id"], 4)
        sets.append("case_id=?"); args.append(cid if re.fullmatch(r"C\d{2}", cid) else None)
    if "active" in b:
        sets.append("active=?"); args.append(1 if b["active"] else 0)
    if sets:
        db.execute(f"UPDATE teams SET {', '.join(sets)}, updated_at=? WHERE id=?", args + [now_iso(), team_id])
        db.commit()
    return jsonify(ok=True)


@bp.post("/api/admin/teams/<int:team_id>/regen-code")
@admin_required
def admin_team_regen(team_id):
    db = get_db()
    t = db.execute("SELECT nrc, name FROM teams WHERE id=?", (team_id,)).fetchone()
    if not t:
        return jsonify(error="No encontrado"), 404
    code = new_code(db, t["nrc"], t["name"])
    db.execute("UPDATE teams SET code=?, updated_at=? WHERE id=?", (code, now_iso(), team_id))
    db.commit()
    return jsonify(ok=True, code=code)


@bp.delete("/api/admin/teams/<int:team_id>")
@admin_required
def admin_team_delete(team_id):
    db = get_db()
    db.execute("DELETE FROM teams WHERE id=?", (team_id,))
    db.commit()
    return jsonify(ok=True)


@bp.post("/api/admin/teams/<int:team_id>/members")
@admin_required
def admin_member_add(team_id):
    b = request.get_json(silent=True) or {}
    email = clip(b.get("email"), 200).lower()
    if "@" not in email:
        return jsonify(error="Correo inválido."), 400
    db = get_db()
    t = db.execute("SELECT period FROM teams WHERE id=?", (team_id,)).fetchone()
    if not t:
        return jsonify(error="Equipo no encontrado"), 404
    ts = now_iso()
    db.execute("UPDATE members SET active=0, updated_at=? WHERE email=? AND team_id<>? AND team_id IN (SELECT id FROM teams WHERE period=?)", (ts, email, team_id, t["period"]))
    db.execute("""INSERT INTO members (team_id, username, email, firstname, lastname, active, created_at, updated_at) VALUES (?,?,?,?,?,1,?,?)
                  ON CONFLICT(team_id, email) DO UPDATE SET firstname=excluded.firstname, lastname=excluded.lastname, active=1, updated_at=excluded.updated_at""",
               (team_id, clip(b.get("username"), 200).lower() or email, email, clip(b.get("firstname"), 80), clip(b.get("lastname"), 80), ts, ts))
    db.commit()
    return jsonify(ok=True)


@bp.patch("/api/admin/members/<int:member_id>")
@admin_required
def admin_member_update(member_id):
    b = request.get_json(silent=True) or {}
    db = get_db()
    if "active" in b:
        db.execute("UPDATE members SET active=?, updated_at=? WHERE id=?", (1 if b["active"] else 0, now_iso(), member_id))
    if "team_id" in b:
        db.execute("UPDATE members SET team_id=?, active=1, updated_at=? WHERE id=?", (int(b["team_id"]), now_iso(), member_id))
    db.commit()
    return jsonify(ok=True)


@bp.delete("/api/admin/members/<int:member_id>")
@admin_required
def admin_member_delete(member_id):
    db = get_db()
    db.execute("DELETE FROM members WHERE id=?", (member_id,))
    db.commit()
    return jsonify(ok=True)


# ------------------------------------------------------------------ exportaciones
def _csv(rows, header, filename):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    return Response("﻿" + buf.getvalue(), mimetype="text/csv", headers={"Content-Disposition": f"attachment; filename={filename}"})


@bp.get("/api/admin/codes.csv")
@admin_required
def admin_codes_csv():
    db = get_db()
    q, args = "SELECT * FROM teams WHERE active=1", []
    for k in ("period", "nrc"):
        v = clip(request.args.get(k), 20)
        if v:
            q += f" AND {k}=?"; args.append(v)
    rows = []
    for t in db.execute(q + " ORDER BY nrc, name", args).fetchall():
        ms = db.execute("SELECT firstname, lastname, email FROM members WHERE team_id=? AND active=1", (t["id"],)).fetchall()
        rows.append([t["period"], t["nrc"], t["name"], t["case_id"] or "", t["code"], "; ".join(f"{m['firstname']} {m['lastname']} <{m['email']}>" for m in ms)])
    return _csv(rows, ["periodo", "nrc", "equipo", "caso", "codigo", "integrantes"], "infralab_codigos.csv")


@bp.get("/api/admin/tracking.csv")
@admin_required
def admin_tracking_csv():
    db = get_db()
    q, args = "SELECT * FROM teams WHERE 1=1", []
    for k in ("period", "nrc"):
        v = clip(request.args.get(k), 20)
        if v:
            q += f" AND {k}=?"; args.append(v)
    keys = ["tours_done", "questions_answered", "bmm_pct", "calcs_ok", "incidents_classified", "lab_services", "matrix_alts", "guide_checks"]
    rows = []
    for t in db.execute(q + " ORDER BY nrc, name", args).fetchall():
        s = team_stats(db, t["id"])
        n = db.execute("SELECT COUNT(*) FROM members WHERE team_id=? AND active=1", (t["id"],)).fetchone()[0]
        rows.append([t["period"], t["nrc"], t["name"], t["case_id"] or "", "activo" if t["active"] else "retirado", n, s["people_in"], s["logins"], s["last_access"] or "",
                     s["submissions"], s["last_level"] or ""] + [s["progress"].get(k, "") for k in keys]
                    + [f"{s['mentor']['ok']}/{s['mentor']['total']}", s["mentor"]["checks"], s["mentor"]["hints"]])
    return _csv(rows, ["periodo", "nrc", "equipo", "caso", "estado", "integrantes", "han_ingresado", "accesos", "ultimo_acceso", "solicitudes_tutor", "ultimo_nivel"] + keys
                + ["mentor_items_correctos", "mentor_revisiones", "mentor_pistas"], "infralab_seguimiento.csv")
