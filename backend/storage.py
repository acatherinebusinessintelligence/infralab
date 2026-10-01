"""Base de datos SQLite compartida por el tutor, los equipos y el panel administrativo."""
import sqlite3

from flask import current_app, g

SCHEMA = """
CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT,
    student_group TEXT,
    student_email TEXT,
    case_id TEXT NOT NULL,
    sections TEXT,
    payload TEXT,
    feedback TEXT,
    level TEXT,
    model TEXT,
    tokens_in INTEGER,
    tokens_out INTEGER,
    error TEXT
);
CREATE INDEX IF NOT EXISTS idx_student ON submissions(student_id, case_id);
CREATE INDEX IF NOT EXISTS idx_case ON submissions(case_id, created_at);

-- Periodo académico (p. ej. 2026-2). Solo los periodos activos permiten ingresar a los estudiantes.
CREATE TABLE IF NOT EXISTS periods (
    code TEXT PRIMARY KEY,
    name TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
-- Equipos (grupos de Moodle). ext_id = «Group ID» de Moodle.
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT NOT NULL,
    nrc TEXT NOT NULL,
    ext_id TEXT,
    name TEXT NOT NULL,
    case_id TEXT,
    code TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (period, nrc, ext_id)
);
CREATE INDEX IF NOT EXISTS idx_teams_nrc ON teams(period, nrc);
-- Integrantes. No se guarda el número de documento (minimización de datos).
CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    username TEXT,
    email TEXT NOT NULL,
    firstname TEXT,
    lastname TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (team_id, email)
);
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE TABLE IF NOT EXISTS logins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    at TEXT NOT NULL,
    ua TEXT
);
CREATE INDEX IF NOT EXISTS idx_logins_team ON logins(team_id, at);
-- Última foto del avance de cada integrante en un caso.
CREATE TABLE IF NOT EXISTS progress (
    team_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL,
    case_id TEXT NOT NULL,
    data TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (team_id, member_id, case_id)
);
-- Bitácora de importaciones de CSV.
CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT NOT NULL,
    nrc TEXT NOT NULL,
    filename TEXT,
    mode TEXT,
    teams_n INTEGER,
    members_n INTEGER,
    at TEXT NOT NULL
);
-- Clave de respuestas del Mentor IA (confidencial: solo vive en el servidor). data = JSON del caso.
CREATE TABLE IF NOT EXISTS answer_keys (
    case_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    validated INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);
-- Bitácora del Mentor IA: cada pista pedida y cada respuesta revisada, por equipo e ítem.
CREATE TABLE IF NOT EXISTS mentor_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    team_id INTEGER,
    member_id INTEGER,
    case_id TEXT NOT NULL,
    item TEXT NOT NULL,
    kind TEXT NOT NULL,          -- hint | check
    level INTEGER,               -- nivel de la pista (1-3)
    verdict TEXT,                -- correcto | parcial | incorrecto
    answer TEXT,
    response TEXT,
    llm INTEGER NOT NULL DEFAULT 0,
    tokens_in INTEGER,
    tokens_out INTEGER,
    error TEXT
);
CREATE INDEX IF NOT EXISTS idx_mentor_team ON mentor_events(team_id, case_id, item);
CREATE INDEX IF NOT EXISTS idx_mentor_time ON mentor_events(team_id, created_at);
"""


def _migrate(db):
    cols = {r[1] for r in db.execute("PRAGMA table_info(submissions)").fetchall()}
    for col in ("team_id", "member_id"):
        if col not in cols:
            db.execute(f"ALTER TABLE submissions ADD COLUMN {col} INTEGER")
    db.execute("CREATE INDEX IF NOT EXISTS idx_sub_team ON submissions(team_id, case_id)")


def init_db(path):
    with sqlite3.connect(path) as db:
        db.executescript(SCHEMA)
        _migrate(db)


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DB_PATH"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()
