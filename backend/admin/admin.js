/* InfraLab · panel administrativo (servido por el backend en /admin). */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CASES = Array.from({ length: 15 }, (_, i) => "C" + String(i + 1).padStart(2, "0"));
  const LVL = { Insuficiente: "red", "En desarrollo": "amber", Satisfactorio: "green", Excelente: "green" };
  let state = { tab: "seg", overview: null, teams: [], importData: null };

  function toast(msg, err) { const t = $("#toast"); t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600); }
  async function api(path, opts = {}) {
    const headers = { "X-Requested-With": "InfraLab", ...(opts.json ? { "Content-Type": "application/json" } : {}) };
    const r = await fetch(path, { method: opts.method || "GET", headers, body: opts.json ? JSON.stringify(opts.json) : opts.body, credentials: "same-origin" });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { showLogin(); throw new Error(d.error || "Sesión vencida"); }
    if (!r.ok) throw new Error(d.error || "Error " + r.status);
    return d;
  }
  const ago = (iso) => {
    if (!iso) return "nunca";
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 60) return `hace ${m} min`; const h = Math.round(m / 60); if (h < 48) return `hace ${h} h`; return `hace ${Math.round(h / 24)} días`;
  };
  const fdate = (iso) => (iso ? new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—");
  const params = () => new URLSearchParams(Object.entries({ period: $("#f-period").value, nrc: $("#f-nrc").value, active: $("#f-active").value, q: $("#f-q").value }).filter(([, v]) => v !== "")).toString();

  /* ---------- sesión ---------- */
  function showLogin() { $("#login").hidden = false; $("#app").hidden = true; $("#top-r").hidden = true; }
  async function boot() {
    const s = await fetch("/api/admin/session", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({}));
    if (!s.admin) return showLogin();
    $("#login").hidden = true; $("#app").hidden = false; $("#top-r").hidden = false; $("#who").textContent = "Sesión docente";
    await loadOverview(); render();
  }
  $("#enter").addEventListener("click", async () => {
    try { await api("/api/admin/login", { method: "POST", json: { password: $("#pwd").value } }); $("#pwd").value = ""; boot(); }
    catch (e) { $("#login-msg").textContent = e.message; }
  });
  $("#pwd").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#enter").click(); });
  $("#logout").addEventListener("click", async () => { await api("/api/admin/logout", { method: "POST" }).catch(() => {}); showLogin(); });

  /* ---------- filtros ---------- */
  async function loadOverview() {
    state.overview = await api("/api/admin/overview");
    const per = $("#f-period"), cur = per.value;
    per.innerHTML = state.overview.periods.length ? state.overview.periods.map((p) => `<option value="${esc(p.code)}" ${p.code === cur ? "selected" : ""}>${esc(p.code)}${p.active ? "" : " (cerrado)"}</option>`).join("") : `<option value="">Sin periodos</option>`;
    if (!cur && state.overview.periods.find((p) => p.active)) per.value = state.overview.periods.find((p) => p.active).code;
    fillNrc();
  }
  function fillNrc() {
    const sel = $("#f-nrc"), cur = sel.value;
    const list = (state.overview?.nrcs || []).filter((n) => n.period === $("#f-period").value);
    sel.innerHTML = `<option value="">Todos</option>` + list.map((n) => `<option ${n.nrc === cur ? "selected" : ""}>${esc(n.nrc)}</option>`).join("");
  }
  $("#f-period").addEventListener("change", () => { fillNrc(); render(); });
  ["#f-nrc", "#f-active"].forEach((s) => $(s).addEventListener("change", render));
  let qt; $("#f-q").addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(render, 300); });
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (!b) return; state.tab = b.dataset.tab; $$("#tabs button").forEach((x) => x.classList.toggle("on", x === b)); render(); });

  function render() {
    $$(".tab").forEach((t) => (t.hidden = t.id !== "tab-" + state.tab));
    $("#filters").hidden = state.tab === "imp" || state.tab === "per" || state.tab === "key";
    ({ seg: renderSeg, men: renderMen, eq: renderEq, imp: renderImp, per: renderPer, key: renderKey, tut: renderTut })[state.tab]();
  }

  /* ---------- seguimiento ---------- */
  const health = (t) => { const s = t.stats; if (!t.active) return ["r", "Retirado"]; if (!s.logins) return ["r", "Sin ingresos"]; const days = (Date.now() - new Date(s.last_access)) / 864e5; return days > 7 ? ["a", "Inactivo > 7 días"] : ["g", "Activo"]; };
  const mini = (label, v, max) => `<div class="mini"><span>${label}</span><i><b style="width:${max ? Math.min(100, Math.round((v || 0) / max * 100)) : 0}%"></b></i><span>${v ?? 0}${max ? "/" + max : ""}</span></div>`;
  async function loadTeams() { state.teams = (await api("/api/admin/teams?" + params())).items; return state.teams; }
  async function renderSeg() {
    const box = $("#tab-seg"); box.innerHTML = `<p class="muted">Cargando…</p>`;
    const items = await loadTeams().catch((e) => { box.innerHTML = `<p class="msg">${esc(e.message)}</p>`; return null; }); if (!items) return;
    const act = items.filter((t) => t.active), studs = act.reduce((s, t) => s + t.members.filter((m) => m.active).length, 0);
    const inn = act.reduce((s, t) => s + (t.stats.people_in || 0), 0), subs = items.reduce((s, t) => s + t.stats.submissions, 0);
    box.innerHTML = `<div class="kpis">
        <div class="kpi"><b>${act.length}</b><span>Equipos activos</span></div><div class="kpi"><b>${studs}</b><span>Estudiantes</span></div>
        <div class="kpi"><b>${inn}</b><span>Han ingresado al menos una vez</span></div><div class="kpi"><b>${act.filter((t) => !t.stats.logins).length}</b><span>Equipos sin ingresos</span></div>
        <div class="kpi"><b>${subs}</b><span>Retroalimentaciones del tutor</span></div></div>
      <div class="bar-actions"><a class="btn ghost sm" href="/api/admin/tracking.csv?${params()}">Exportar seguimiento (CSV)</a><a class="btn ghost sm" href="/api/admin/codes.csv?${params()}">Exportar códigos (CSV)</a></div>
      <div class="tbl-wrap"><table><thead><tr><th>Estado</th><th>NRC · Equipo</th><th>Caso</th><th>Ingresaron</th><th>Último acceso</th><th>Tutor IA</th><th>Mentor</th><th>Avance</th></tr></thead><tbody>
      ${items.map((t) => { const [c, l] = health(t); const p = t.stats.progress || {}; const nm = t.members.filter((m) => m.active).length;
        return `<tr class="click" data-team="${t.id}"><td><span class="dot ${c}"></span>${l}</td><td><b>${esc(t.nrc)} · ${esc(t.name)}</b><br><span class="muted">${t.members.filter((m) => m.active).map((m) => esc(m.firstname)).join(", ") || "sin integrantes"}</span></td>
          <td>${t.case_id ? `<span class="pill">${t.case_id}</span>` : `<span class="pill amber">sin caso</span>`}</td>
          <td>${t.stats.people_in || 0}/${nm}<br><span class="muted">${t.stats.logins} accesos</span></td><td>${ago(t.stats.last_access)}</td>
          <td>${t.stats.submissions}${t.stats.last_level ? ` <span class="pill ${LVL[t.stats.last_level] || ""}">${esc(t.stats.last_level)}</span>` : ""}</td>
          <td>${t.stats.mentor && t.stats.mentor.total ? `<b>${t.stats.mentor.ok}/${t.stats.mentor.total}</b><br><span class="muted">${t.stats.mentor.checks} rev. · ${t.stats.mentor.hints} pistas</span>` : `<span class="muted">—</span>`}</td>
          <td style="min-width:230px">${mini("Ejercicios", p.tours_done, p.tours_total || 17)}${mini("Preguntas", p.questions_answered, p.questions_total || 6)}${mini("BMM", p.bmm_pct, 100)}${mini("Cálculos", p.calcs_ok, 4)}${mini("Matriz", p.matrix_alts, 4)}</td></tr>`; }).join("") || `<tr><td colspan="8" class="muted">No hay equipos con estos filtros. Importa los CSV en «Importar CSV».</td></tr>`}
      </tbody></table></div>`;
    box.querySelectorAll("[data-team]").forEach((tr) => tr.addEventListener("click", () => openTeam(+tr.dataset.team)));
  }
  async function openTeam(id) {
    const d = await api("/api/admin/teams/" + id); const t = d.team;
    const prog = (m) => m.progress.map((p) => `<div class="muted" style="font-size:12px">${esc(p.case_id)} · ${Object.entries(p.data).filter(([k]) => k !== "case_id").map(([k, v]) => `${k}: ${esc(v)}`).join(" · ")} <i>(${ago(p.updated_at)})</i></div>`).join("") || `<span class="muted">sin avance sincronizado</span>`;
    modal(`<h2>${esc(t.nrc)} · ${esc(t.name)} ${t.active ? "" : '<span class="pill red">retirado</span>'}</h2>
      <p class="muted">Periodo ${esc(t.period)} · Caso ${esc(t.case_id || "sin asignar")} · Código <code>${esc(t.code)}</code></p>
      <h3>Integrantes</h3><div class="tbl-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Estado</th><th>Accesos</th><th>Último acceso</th><th>Avance</th></tr></thead><tbody>
      ${d.members.map((m) => `<tr><td>${esc(m.firstname)} ${esc(m.lastname)}</td><td>${esc(m.email)}</td><td>${m.active ? '<span class="pill green">activo</span>' : '<span class="pill red">retirado</span>'}</td><td>${m.logins}</td><td>${ago(m.last_access)}</td><td>${prog(m)}</td></tr>`).join("")}</tbody></table></div>
      <div class="grid2" style="margin-top:14px"><div><h3>Retroalimentaciones del tutor (${d.submissions.length})</h3>
        <div class="tbl-wrap"><table><tbody>${d.submissions.map((s) => `<tr class="click" data-sub="${s.id}"><td>${fdate(s.created_at)}</td><td>${esc(s.case_id)}</td><td>${s.error ? '<span class="pill red">error</span>' : `<span class="pill ${LVL[s.level] || ""}">${esc(s.level || "—")}</span>`}</td><td class="muted">${esc((s.sections || []).join(", "))}</td></tr>`).join("") || `<tr><td class="muted">Sin solicitudes.</td></tr>`}</tbody></table></div></div>
        <div><h3>Últimos accesos</h3><div class="tbl-wrap"><table><tbody>${d.logins.map((l) => `<tr><td>${fdate(l.at)}</td><td>${esc(l.firstname)} ${esc(l.lastname)}</td></tr>`).join("") || `<tr><td class="muted">Nadie ha ingresado todavía.</td></tr>`}</tbody></table></div></div></div>`);
    $$("[data-sub]", $("#modal-body")).forEach((tr) => tr.addEventListener("click", () => openSub(tr.dataset.sub)));
  }
  async function openSub(id) {
    const r = await api("/api/teacher/submissions/" + encodeURIComponent(id)); const fb = r.feedback || {};
    const li = (a) => `<ul>${(a || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
    modal(`<h2>${esc(r.student_name)}</h2><p class="muted">${esc(r.student_group)} · ${esc(r.case_id)} · ${fdate(r.created_at)} · tokens ${r.tokens_in || 0}/${r.tokens_out || 0}</p>
      <h3>Tutor · <span class="pill ${LVL[fb.nivel_global] || ""}">${esc(fb.nivel_global || "—")}</span></h3><p>${esc(fb.resumen || r.error || "")}</p>
      ${fb.alerta ? `<p class="pill amber">${esc(fb.alerta)}</p>` : ""}<div class="grid2"><div><h4>Fortalezas</h4>${li(fb.fortalezas)}</div><div><h4>Mejoras</h4>${li(fb.mejoras)}</div></div>
      <h4>Preguntas guía</h4>${li(fb.preguntas_guia)}<h4>Trabajo enviado</h4><pre>${esc(JSON.stringify(r.payload, null, 2))}</pre>`);
  }

  /* ---------- equipos ---------- */
  async function renderEq() {
    const box = $("#tab-eq"); box.innerHTML = `<p class="muted">Cargando…</p>`;
    const items = await loadTeams().catch((e) => { box.innerHTML = `<p class="msg">${esc(e.message)}</p>`; return null; }); if (!items) return;
    box.innerHTML = `<div class="bar-actions"><button class="btn sm" id="new-team">+ Nuevo equipo</button><a class="btn ghost sm" href="/api/admin/codes.csv?${params()}">Exportar códigos (CSV)</a><button class="btn ghost sm" id="print-codes">Imprimir códigos</button></div>
      <div class="teams">${items.map((t) => `<div class="team ${t.active ? "" : "off"}" data-id="${t.id}">
        <div class="team-h"><div><h4>${esc(t.name)}</h4><span class="muted">NRC ${esc(t.nrc)} · ${esc(t.period)}</span></div>
          <div class="row"><code>${esc(t.code)}</code><button class="btn ghost sm" data-act="copy" title="Copiar código">Copiar</button></div></div>
        <div class="row"><label style="flex-direction:row;align-items:center;gap:6px">Caso<select data-act="case"><option value="">—</option>${CASES.map((c) => `<option ${c === t.case_id ? "selected" : ""}>${c}</option>`).join("")}</select></label>
          ${t.active ? '<span class="pill green">activo</span>' : '<span class="pill red">retirado</span>'}</div>
        <div class="members">${t.members.map((m) => `<div class="mem ${m.active ? "" : "off"}" data-mid="${m.id}"><span>${esc(m.firstname)} ${esc(m.lastname)}<br><small>${esc(m.email)}</small></span>
          <span class="row">${m.active ? `<button class="btn ghost sm" data-act="m-off">Retirar</button>` : `<button class="btn ghost sm" data-act="m-on">Reactivar</button>`}<button class="btn danger sm" data-act="m-del" title="Eliminar del equipo">✕</button></span></div>`).join("") || `<span class="muted">Sin integrantes</span>`}</div>
        <details><summary class="muted" style="cursor:pointer">+ Agregar integrante</summary><div class="row" style="margin-top:8px">
          <input placeholder="Nombre" data-f="firstname" style="flex:1"><input placeholder="Apellido" data-f="lastname" style="flex:1"><input placeholder="correo@uniminuto.edu.co" data-f="email" style="flex:2">
          <button class="btn sm" data-act="m-add">Agregar</button></div></details>
        <div class="row"><button class="btn ghost sm" data-act="regen">Nuevo código</button>${t.active ? `<button class="btn ghost sm" data-act="off">Retirar equipo</button>` : `<button class="btn ghost sm" data-act="on">Reactivar</button>`}<button class="btn danger sm" data-act="del">Eliminar</button></div>
      </div>`).join("") || `<p class="muted">No hay equipos con estos filtros.</p>`}</div>`;
    $("#new-team").addEventListener("click", newTeamForm);
    $("#print-codes").addEventListener("click", () => printCodes(items));
    box.querySelectorAll(".team").forEach((card) => card.addEventListener("click", (e) => teamAction(e, card)));
    box.querySelectorAll("[data-act=case]").forEach((s) => s.addEventListener("change", async () => { await api(`/api/admin/teams/${s.closest(".team").dataset.id}`, { method: "PATCH", json: { case_id: s.value } }); toast("Caso asignado"); }));
  }
  async function teamAction(e, card) {
    const b = e.target.closest("[data-act]"); if (!b || b.tagName === "SELECT") return;
    const id = card.dataset.id, act = b.dataset.act, mid = b.closest("[data-mid]")?.dataset.mid;
    try {
      if (act === "copy") { await navigator.clipboard.writeText(card.querySelector("code").textContent); return toast("Código copiado"); }
      if (act === "regen") { if (!confirmIn(b, "¿Generar un código nuevo? El anterior dejará de funcionar.")) return; await api(`/api/admin/teams/${id}/regen-code`, { method: "POST" }); }
      if (act === "off" || act === "on") await api(`/api/admin/teams/${id}`, { method: "PATCH", json: { active: act === "on" } });
      if (act === "del") { if (!confirmIn(b, "¿Eliminar el equipo y sus integrantes? Las retroalimentaciones del tutor se conservan.")) return; await api(`/api/admin/teams/${id}`, { method: "DELETE" }); }
      if (act === "m-off" || act === "m-on") await api(`/api/admin/members/${mid}`, { method: "PATCH", json: { active: act === "m-on" } });
      if (act === "m-del") { if (!confirmIn(b, "¿Eliminar a este integrante?")) return; await api(`/api/admin/members/${mid}`, { method: "DELETE" }); }
      if (act === "m-add") { const v = (f) => card.querySelector(`[data-f=${f}]`).value.trim(); await api(`/api/admin/teams/${id}/members`, { method: "POST", json: { firstname: v("firstname"), lastname: v("lastname"), email: v("email") } }); }
      toast("Cambios guardados"); renderEq();
    } catch (err) { toast(err.message, true); }
  }
  // Confirmación en dos clics (sin diálogos del navegador).
  function confirmIn(btn, msg) {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = "1"; const old = btn.textContent; btn.textContent = "¿Seguro? clic de nuevo"; btn.title = msg; toast(msg);
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = old; }, 3500);
    return false;
  }
  function newTeamForm() {
    modal(`<h2>Nuevo equipo</h2><div class="grid2"><label>Periodo<input id="nt-period" value="${esc($("#f-period").value)}"></label><label>NRC<input id="nt-nrc" value="${esc($("#f-nrc").value)}"></label>
      <label>Nombre<input id="nt-name" placeholder="Grupo 13"></label><label>Caso<select id="nt-case"><option value="">—</option>${CASES.map((c) => `<option>${c}</option>`).join("")}</select></label></div>
      <p><button class="btn" id="nt-save">Crear equipo</button></p>`);
    $("#nt-save").addEventListener("click", async () => {
      try { await api("/api/admin/teams", { method: "POST", json: { period: $("#nt-period").value, nrc: $("#nt-nrc").value, name: $("#nt-name").value, case_id: $("#nt-case").value } }); closeModal(); toast("Equipo creado"); await loadOverview(); renderEq(); }
      catch (e) { toast(e.message, true); }
    });
  }
  function printCodes(items) {
    const w = window.open("", "_blank");
    if (!w) return toast("Permite las ventanas emergentes para imprimir", true);
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Códigos InfraLab</title><style>body{font:12pt Arial;margin:24px}.c{display:inline-block;width:46%;margin:1%;border:1px dashed #999;border-radius:8px;padding:12px;vertical-align:top}b{font-size:15pt;letter-spacing:1px}</style>
      <h2>InfraLab · códigos de equipo</h2>${items.filter((t) => t.active).map((t) => `<div class="c">NRC ${esc(t.nrc)} · ${esc(t.name)} ${t.case_id ? "· " + t.case_id : ""}<br><b>${esc(t.code)}</b><br><small>${t.members.filter((m) => m.active).map((m) => esc(m.firstname + " " + m.lastname)).join(", ")}</small><br><small>Ingresa en el sitio con este código y tu correo institucional.</small></div>`).join("")}`);
    w.document.close(); w.print();
  }

  /* ---------- importar ---------- */
  function renderImp() {
    const box = $("#tab-imp"); const periods = state.overview?.periods || [];
    box.innerHTML = `<div class="card"><h3>Importar equipos desde Moodle</h3>
      <p class="muted">Exporta en Moodle la actividad «Auto-selección de grupo» (CSV) de cada NRC y súbelos aquí. El NRC se detecta del nombre del archivo (…_60-83600_…); puedes corregirlo antes de confirmar.</p>
      <div class="grid2"><label>Periodo<input id="imp-period" list="per-list" value="${esc(periods.find((p) => p.active)?.code || "")}" placeholder="2026-2"><datalist id="per-list">${periods.map((p) => `<option value="${esc(p.code)}">`).join("")}</datalist></label>
        <label>Archivos CSV<input type="file" id="imp-files" accept=".csv,text/csv" multiple></label></div>
      <p><button class="btn" id="imp-prev">Ver vista previa</button></p></div><div id="imp-out"></div>`;
    $("#imp-prev").addEventListener("click", previewImport);
  }
  async function previewImport() {
    const files = $("#imp-files").files, period = $("#imp-period").value.trim();
    if (!period || !files.length) return toast("Escribe el periodo y elige al menos un CSV", true);
    const fd = new FormData(); fd.append("period", period); [...files].forEach((f) => fd.append("files", f));
    try {
      const d = await api("/api/admin/import/preview", { method: "POST", body: fd }); state.importData = d;
      $("#imp-out").innerHTML = d.files.map((f, i) => f.error ? `<div class="file-card err"><b>${esc(f.filename)}</b><p class="msg">${esc(f.error)}</p></div>` : `
        <div class="file-card"><div class="row" style="justify-content:space-between"><b>${esc(f.filename)}</b><label style="flex-direction:row;align-items:center;gap:6px">NRC<input data-nrc="${i}" value="${esc(f.nrc)}" style="width:110px"></label></div>
          <p class="muted">${f.teams.length} grupos · ${f.members_total} estudiantes · ${f.diff.empty_teams} grupos vacíos · casos detectados: ${f.teams.filter((t) => t.case_id).map((t) => `${esc(t.name)} → ${t.case_id}`).join(", ") || "ninguno"}</p>
          <div class="row"><span class="pill green">${f.diff.new_teams} equipos nuevos</span><span class="pill">${f.diff.updated_teams} se actualizan</span><span class="pill green">+${f.diff.members_add} integrantes</span><span class="pill amber">−${f.diff.members_remove} integrantes</span>${f.diff.retire_teams.length ? `<span class="pill red">se retiran: ${f.diff.retire_teams.map(esc).join(", ")}</span>` : ""}</div>
          <details style="margin-top:8px"><summary class="muted" style="cursor:pointer">Ver grupos</summary><div class="tbl-wrap" style="margin-top:8px"><table><tbody>${f.teams.map((t) => `<tr><td>${esc(t.name)}</td><td>${t.case_id || ""}</td><td>${t.members.map((m) => esc(m.firstname + " " + m.lastname)).join(", ") || '<span class="muted">vacío</span>'}</td></tr>`).join("")}</tbody></table></div></details></div>`).join("") + `
        <div class="card" style="margin-top:12px"><h3>Confirmar importación</h3>
          <label style="flex-direction:row;gap:8px;align-items:center"><input type="radio" name="mode" value="sync" checked> <span><b>Sincronizar</b>: el CSV manda. Agrega y actualiza, y <b>retira</b> los integrantes y grupos de ese NRC que ya no estén en el archivo.</span></label>
          <label style="flex-direction:row;gap:8px;align-items:center;margin-top:6px"><input type="radio" name="mode" value="add"> <span><b>Solo agregar</b>: agrega y actualiza sin retirar a nadie.</span></label>
          <label style="flex-direction:row;gap:8px;align-items:center;margin-top:6px"><input type="checkbox" id="keep-empty"> <span>Crear también los grupos vacíos (sin integrantes)</span></label>
          <p><button class="btn" id="imp-go">Importar</button></p></div>`;
      $("#imp-go").addEventListener("click", commitImport);
    } catch (e) { toast(e.message, true); }
  }
  async function commitImport() {
    const d = state.importData; const files = d.files.filter((f) => !f.error).map((f, i) => ({ ...f, nrc: ($(`[data-nrc="${d.files.indexOf(f)}"]`)?.value || f.nrc).trim() }));
    try {
      const r = await api("/api/admin/import/commit", { method: "POST", json: { period: d.period, mode: $("input[name=mode]:checked").value, keep_empty: $("#keep-empty").checked, files } });
      $("#imp-out").innerHTML = `<div class="card"><h3>Importación terminada</h3>${r.summary.map((s) => `<p>${esc(s.filename)} → ${s.error ? `<span class="msg">${esc(s.error)}</span>` : `NRC ${esc(s.nrc)}: ${s.teams} equipos, ${s.members} estudiantes`}</p>`).join("")}
        <p class="muted">Los equipos nuevos ya tienen código. Descárgalos en «Equipos y códigos» para repartirlos.</p></div>`;
      toast("Importación completada"); await loadOverview();
    } catch (e) { toast(e.message, true); }
  }

  /* ---------- periodos y NRC ---------- */
  function renderPer() {
    const o = state.overview || { periods: [], nrcs: [], imports: [] };
    $("#tab-per").innerHTML = `<div class="grid2"><div class="card"><h3>Periodos académicos</h3><p class="muted">Solo los periodos abiertos permiten que los estudiantes ingresen. Al terminar el semestre, ciérralo.</p>
        <div class="tbl-wrap"><table><tbody>${o.periods.map((p) => `<tr><td><b>${esc(p.code)}</b></td><td>${p.active ? '<span class="pill green">abierto</span>' : '<span class="pill">cerrado</span>'}</td>
          <td><button class="btn ghost sm" data-per="${esc(p.code)}" data-on="${p.active ? 0 : 1}">${p.active ? "Cerrar" : "Abrir"}</button></td></tr>`).join("") || `<tr><td class="muted">Aún no hay periodos.</td></tr>`}</tbody></table></div>
        <div class="row" style="margin-top:10px"><input id="np-code" placeholder="2027-1" style="width:120px"><button class="btn sm" id="np-add">Crear periodo</button></div></div>
      <div class="card"><h3>NRC por periodo</h3><div class="tbl-wrap"><table><thead><tr><th>Periodo</th><th>NRC</th><th>Equipos</th><th>Estudiantes</th><th></th></tr></thead><tbody>
        ${o.nrcs.map((n) => `<tr><td>${esc(n.period)}</td><td><b>${esc(n.nrc)}</b></td><td>${n.active_teams}/${n.teams}</td><td>${n.members}</td>
          <td class="row"><button class="btn ghost sm" data-nrc="${esc(n.nrc)}" data-p="${esc(n.period)}" data-a="${n.active_teams ? 0 : 1}">${n.active_teams ? "Retirar NRC" : "Reactivar"}</button><button class="btn danger sm" data-del-nrc="${esc(n.nrc)}" data-p="${esc(n.period)}">Eliminar</button></td></tr>`).join("") || `<tr><td colspan="5" class="muted">Sin NRC cargados.</td></tr>`}</tbody></table></div></div></div>
      <div class="card" style="margin-top:14px"><h3>Historial de importaciones</h3><div class="tbl-wrap"><table><tbody>${o.imports.map((i) => `<tr><td>${fdate(i.at)}</td><td>${esc(i.period)}</td><td>${esc(i.nrc)}</td><td>${esc(i.mode)}</td><td>${i.teams_n} equipos · ${i.members_n} estudiantes</td><td class="muted">${esc(i.filename)}</td></tr>`).join("") || `<tr><td class="muted">Sin importaciones.</td></tr>`}</tbody></table></div></div>`;
    const box = $("#tab-per");
    box.querySelectorAll("[data-per]").forEach((b) => b.addEventListener("click", async () => { await api("/api/admin/periods", { method: "POST", json: { code: b.dataset.per, active: b.dataset.on === "1" } }); await loadOverview(); renderPer(); toast("Periodo actualizado"); }));
    $("#np-add").addEventListener("click", async () => { try { await api("/api/admin/periods", { method: "POST", json: { code: $("#np-code").value.trim(), active: true } }); await loadOverview(); renderPer(); toast("Periodo creado"); } catch (e) { toast(e.message, true); } });
    box.querySelectorAll("[data-nrc]").forEach((b) => b.addEventListener("click", async () => { await api("/api/admin/nrc/retire", { method: "POST", json: { period: b.dataset.p, nrc: b.dataset.nrc, active: b.dataset.a === "1" } }); await loadOverview(); renderPer(); toast("NRC actualizado"); }));
    box.querySelectorAll("[data-del-nrc]").forEach((b) => b.addEventListener("click", () => {
      modal(`<h2>Eliminar NRC ${esc(b.dataset.delNrc)} (${esc(b.dataset.p)})</h2><p>Se eliminan sus equipos, integrantes, accesos y avances. Las retroalimentaciones del tutor se conservan sin equipo. Escribe <b>ELIMINAR</b> para confirmar.</p>
        <div class="row"><input id="del-conf"><button class="btn danger" id="del-go">Eliminar definitivamente</button></div>`);
      $("#del-go").addEventListener("click", async () => { try { await api("/api/admin/nrc/delete", { method: "POST", json: { period: b.dataset.p, nrc: b.dataset.delNrc, confirm: $("#del-conf").value } }); closeModal(); await loadOverview(); renderPer(); toast("NRC eliminado"); } catch (e) { toast(e.message, true); } });
    }));
  }

  /* ---------- tutor ---------- */
  async function renderTut() {
    const box = $("#tab-tut"); box.innerHTML = `<p class="muted">Cargando…</p>`;
    try {
      const d = await api("/api/teacher/submissions?" + new URLSearchParams({ q: $("#f-q").value }).toString());
      box.innerHTML = `<div class="bar-actions"><a class="btn ghost sm" href="/api/teacher/export.csv">Exportar entregas (CSV)</a></div><div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Estudiante · equipo</th><th>Grupo</th><th>Caso</th><th>Secciones</th><th>Nivel</th></tr></thead><tbody>
        ${d.items.map((s) => `<tr class="click" data-sub="${s.id}"><td>${fdate(s.created_at)}</td><td>${esc(s.student_name)}</td><td>${esc(s.student_group)}</td><td>${esc(s.case_id)}</td><td class="muted">${esc((s.sections || []).join(", "))}</td><td>${s.error ? '<span class="pill red">error</span>' : `<span class="pill ${LVL[s.level] || ""}">${esc(s.level || "—")}</span>`}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">Sin solicitudes al tutor.</td></tr>`}</tbody></table></div>`;
      box.querySelectorAll("[data-sub]").forEach((tr) => tr.addEventListener("click", () => openSub(tr.dataset.sub)));
    } catch (e) { box.innerHTML = `<p class="msg">${esc(e.message)}</p>`; }
  }

  /* ---------- mentor: seguimiento por ítem ---------- */
  const VERD = { correcto: ["green", "correcto"], parcial: ["amber", "parcial"], incorrecto: ["red", "incorrecto"] };
  const cell = (g) => !g || !g.total ? `<span class="muted">—</span>`
    : `<div class="mini m3"><i><b style="width:${Math.round(g.ok / g.total * 100)}%"></b></i><span>${g.ok}/${g.total}</span></div>${g.partial ? `<small class="muted">${g.partial} parcial(es)</small>` : ""}`;
  async function renderMen() {
    const box = $("#tab-men"); box.innerHTML = `<p class="muted">Cargando…</p>`;
    let d; try { d = await api("/api/admin/mentor/tracking?" + params()); } catch (e) { box.innerHTML = `<p class="msg">${esc(e.message)}</p>`; return; }
    const q = $("#f-q").value.toLowerCase();
    const items = d.items.filter((t) => !q || (t.nrc + " " + t.name).toLowerCase().includes(q));
    const withM = items.filter((t) => t.mentor && (t.mentor.checks || t.mentor.hints));
    const avg = withM.length ? Math.round(withM.reduce((s, t) => s + t.mentor.ok / Math.max(1, t.mentor.total), 0) / withM.length * 100) : 0;
    box.innerHTML = `<div class="kpis">
        <div class="kpi"><b>${withM.length}/${items.length}</b><span>Equipos que usan el mentor</span></div>
        <div class="kpi"><b>${items.reduce((s, t) => s + (t.mentor?.checks || 0), 0)}</b><span>Respuestas revisadas</span></div>
        <div class="kpi"><b>${items.reduce((s, t) => s + (t.mentor?.hints || 0), 0)}</b><span>Pistas pedidas</span></div>
        <div class="kpi"><b>${avg} %</b><span>Ítems resueltos (promedio de los que lo usan)</span></div></div>
      <p class="muted">Cada ítem cuenta como resuelto cuando el equipo obtuvo «correcto» al revisarlo con el mentor. Muchas revisiones con pocas pistas pueden indicar ensayo y error: abre el equipo para ver el detalle.</p>
      <div class="bar-actions"><a class="btn ghost sm" href="/api/admin/mentor/tracking.csv?${params()}">Exportar seguimiento del mentor (CSV)</a></div>
      <div class="tbl-wrap"><table><thead><tr><th>NRC · Equipo</th><th>Caso</th><th>Tier</th><th>Cálculos</th><th>Incidentes</th><th>Preguntas</th><th>Resueltos</th><th>Revisiones · pistas</th><th>Última actividad</th></tr></thead><tbody>
      ${items.map((t) => { const m = t.mentor; const g = m?.groups || {};
        return `<tr class="click" data-mteam="${t.id}"><td><b>${esc(t.nrc)} · ${esc(t.name)}</b></td>
          <td>${t.case_id ? `<span class="pill">${t.case_id}</span>${m && !m.key_loaded ? ` <span class="pill amber" title="Sin clave cargada">sin clave</span>` : ""}` : `<span class="pill amber">sin caso</span>`}</td>
          <td>${g.tier ? (g.tier.ok ? `<span class="pill green">correcto</span>` : g.tier.partial ? `<span class="pill amber">parcial</span>` : g.tier.tried ? `<span class="pill red">incorrecto</span>` : `<span class="muted">—</span>`) : "—"}</td>
          <td>${cell(g.calc)}</td><td>${cell(g.inc)}</td><td>${cell(g.q)}</td>
          <td>${m ? `<b>${m.ok}/${m.total}</b>` : "—"}</td><td>${m ? `${m.checks} · ${m.hints}` : "—"}</td><td>${ago(m?.last_at)}</td></tr>`; }).join("") || `<tr><td colspan="9" class="muted">No hay equipos con estos filtros.</td></tr>`}
      </tbody></table></div>`;
    box.querySelectorAll("[data-mteam]").forEach((tr) => tr.addEventListener("click", () => openMentorTeam(+tr.dataset.mteam)));
  }
  const ansTxt = (a) => !a ? "" : a.text != null ? a.text : a.value != null ? a.value : Object.entries(a).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ");
  async function openMentorTeam(id) {
    const d = await api("/api/admin/mentor/team/" + id); const t = d.team, s = d.summary;
    const rank = (k) => { const [g, x] = k.split("."); const gi = { tier: 0, calc: 1, inc: 2, q: 3 }[g] ?? 4; return gi * 100 + (g === "calc" ? ["av", "mttr", "mtbf", "months"].indexOf(x) : g === "inc" ? x.charCodeAt(0) - 65 : g === "q" ? +x : 0); };
    const rows = s ? Object.entries(s.labels).sort(([a], [b]) => rank(a) - rank(b)).map(([k, l]) => { const it = s.items[k] || {}; const v = VERD[it.best];
      return `<tr><td>${esc(l)}</td><td>${v ? `<span class="pill ${v[0]}">${v[1]}</span>` : `<span class="muted">sin revisar</span>`}</td><td>${it.checks || 0}</td><td>${it.hints || 0}${it.max_hint ? ` (nivel ${it.max_hint})` : ""}</td><td>${ago(it.last_at)}</td></tr>`; }).join("") : "";
    modal(`<h2>${esc(t.nrc)} · ${esc(t.name)} · Mentor IA</h2><p class="muted">Caso ${esc(t.case_id || "sin asignar")} · ${s ? `${s.ok}/${s.total} ítems resueltos · ${s.checks} revisiones · ${s.hints} pistas` : "sin actividad"}</p>
      ${rows ? `<h3>Estado por ítem</h3><div class="tbl-wrap"><table><thead><tr><th>Ítem</th><th>Mejor resultado</th><th>Revisiones</th><th>Pistas</th><th>Última</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}
      <h3 style="margin-top:14px">Bitácora (${d.events.length})</h3><div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Integrante</th><th>Caso · ítem</th><th>Acción</th><th>Respuesta del equipo</th><th>Mentor</th></tr></thead><tbody>
      ${d.events.map((e) => { const v = VERD[e.verdict]; return `<tr><td>${fdate(e.created_at)}</td><td>${esc((e.firstname || "") + " " + (e.lastname || ""))}</td><td>${esc(e.case_id)} · ${esc(e.item)}</td>
        <td>${e.kind === "hint" ? `<span class="pill">pista ${e.level}</span>` : v ? `<span class="pill ${v[0]}">${v[1]}</span>` : `<span class="pill">revisión</span>`}${e.error ? ` <span class="pill red" title="${esc(e.error)}">error</span>` : ""}</td>
        <td class="muted" style="max-width:260px">${esc(ansTxt(e.answer)).slice(0, 300)}</td><td class="muted" style="max-width:320px">${esc(e.response?.explicacion || e.response?.pista || "").slice(0, 400)}</td></tr>`; }).join("") || `<tr><td colspan="6" class="muted">Sin actividad.</td></tr>`}
      </tbody></table></div>`);
  }

  /* ---------- clave de respuestas ---------- */
  let keyEdit = null; // { cid, key }
  const lines = (a) => (a || []).map((x) => (typeof x === "string" ? x : x.tab ? `${x.text} | ${x.tab}` : x.text)).join("\n");
  const parseLines = (t) => t.split("\n").map((x) => x.trim()).filter(Boolean);
  const parseWhere = (t) => parseLines(t).map((x) => { const [text, tab] = x.split("|").map((y) => y.trim()); return tab ? { text, tab } : { text }; });
  const fwOpts = (fw) => Object.values((window.FRAMEWORKS || {})[fw]?.groups || {}).flat();
  async function renderKey() {
    const box = $("#tab-key"); box.innerHTML = `<p class="muted">Cargando…</p>`;
    let d; try { d = await api("/api/admin/answer-keys"); } catch (e) { box.innerHTML = `<p class="msg">${esc(e.message)}</p>`; return; }
    box.innerHTML = `<div class="card"><h3>Clave de respuestas del Mentor IA</h3>
        <p class="muted">La clave es <b>confidencial</b>: vive solo en este servidor y nunca se envía al navegador de los estudiantes. El mentor la usa para revisar respuestas (Tier, cálculos, incidentes) y para orientar pistas y explicaciones en las preguntas abiertas, sin revelarla.
        Para empezar, importa el borrador <code>backend/answer_key/clave_respuestas_borrador.json</code> (lo genera <code>node backend/answer_key/build_draft.js</code> en tu computador), revisa cada caso y márcalo como <b>validado</b>.</p>
        <div class="row"><label style="flex-direction:row;align-items:center;gap:8px">Importar JSON <input type="file" id="key-file" accept=".json,application/json"></label><button class="btn sm" id="key-imp">Importar</button>
          <a class="btn ghost sm" href="/api/admin/answer-keys/export">Exportar respaldo (JSON)</a>
          ${d.llm ? `<span class="pill green">IA disponible para borradores</span>` : `<span class="pill amber">Sin clave de DeepSeek: no se pueden generar borradores con IA</span>`}</div></div>
      <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Caso</th><th>Estado</th><th>Ítems</th><th>Preguntas sin ideas clave</th><th>Actualizado</th><th></th></tr></thead><tbody>
      ${d.items.map((k) => `<tr><td><b>${k.case_id}</b></td><td>${!k.loaded ? `<span class="pill red">sin clave</span>` : k.validated ? `<span class="pill green">validado</span>` : `<span class="pill amber">borrador</span>`}</td>
        <td>${k.items}</td><td>${k.loaded ? (k.open_without_ideas ? `<span class="pill amber">${k.open_without_ideas}</span>` : `<span class="pill green">0</span>`) : "—"}</td><td>${k.updated_at ? fdate(k.updated_at) : "—"}</td>
        <td>${k.loaded ? `<button class="btn ghost sm" data-kedit="${k.case_id}">Revisar y editar</button>` : ""}</td></tr>`).join("")}</tbody></table></div>
      <div id="key-editor"></div>`;
    $("#key-imp").addEventListener("click", async () => {
      const f = $("#key-file").files[0]; if (!f) return toast("Elige el archivo JSON", true);
      const fd = new FormData(); fd.append("file", f); fd.append("keep_validated", "1");
      try { const r = await api("/api/admin/answer-keys/import", { method: "POST", body: fd }); toast(`Importados: ${r.imported.length} caso(s)${r.errors.length ? " · errores: " + r.errors.length : ""}`, !!r.errors.length); renderKey(); if (r.errors.length) modal(`<h2>Errores de importación</h2><pre>${esc(r.errors.join("\n"))}</pre>`); }
      catch (e) { toast(e.message, true); }
    });
    box.querySelectorAll("[data-kedit]").forEach((b) => b.addEventListener("click", () => editKey(b.dataset.kedit)));
    if (keyEdit) editKey(keyEdit.cid, true);
  }
  async function editKey(cid, keep) {
    if (!keep || !keyEdit || keyEdit.cid !== cid) { const d = await api("/api/admin/answer-keys/" + cid); keyEdit = { cid, key: d.key }; }
    const k = keyEdit.key, ed = $("#key-editor");
    const card = (iid, it) => {
      const common = `<label>Por qué (para el mentor; no se muestra al estudiante)<textarea rows="2" data-k="rationale">${esc(it.rationale || "")}</textarea></label>
        <div class="grid2"><label>Dónde buscar (una por línea · «texto | pestaña»)<textarea rows="3" data-k="where">${esc(lines(it.where))}</textarea></label>
        <label>Pistas del docente (nivel 2 y 3, una por línea)<textarea rows="3" data-k="hints">${esc(lines(it.hints))}</textarea></label></div>`;
      let body = "";
      if (it.kind === "tier") {
        const chk = (name, list) => ["I", "II", "III", "IV"].map((l) => `<label class="chk"><input type="checkbox" data-k="${name}" value="${l}" ${(list || []).includes(l) ? "checked" : ""}> Tier ${l}</label>`).join("");
        body = `<div class="grid2"><div><b>Tier actual</b> · principal <select data-k="ans_actual">${["I", "II", "III", "IV"].map((l) => `<option ${it.answer?.actual === l ? "selected" : ""}>${l}</option>`).join("")}</select><div class="row">aceptables: ${chk("acc_actual", it.accept?.actual)}</div></div>
          <div><b>Tier objetivo</b> · aceptables <div class="row">${chk("acc_objetivo", it.accept?.objetivo)}</div></div></div>
          <label>Evidencias del inventario (una por línea)<textarea rows="3" data-k="evidence">${esc(lines(it.evidence))}</textarea></label>`;
      } else if (it.kind === "number") {
        body = `<div class="row"><label>Respuesta<input data-k="answer" value="${esc(it.answer ?? "")}" style="width:120px"></label><label>Tolerancia<input data-k="tol" value="${esc(it.tol ?? 0.02)}" style="width:90px"></label><label>Unidad<input data-k="unit" value="${esc(it.unit || "")}" style="width:80px"></label><label class="grow">Fórmula<input data-k="formula" value="${esc(it.formula || "")}"></label></div>
          <label>Errores típicos (una por línea · «valor | mensaje»)<textarea rows="2" data-k="mistakes">${esc((it.mistakes || []).map(([v, m]) => `${v} | ${m}`).join("\n"))}</textarea></label>`;
      } else if (it.kind === "incident") {
        body = `<p class="muted">${esc(it.prompt || "")}</p><div class="grid3">${["itil", "cobit", "iso"].map((fw) => { const opts = fwOpts(fw); const acc = it.accept?.[fw] || [];
          return `<div><b>${{ itil: "ITIL 4", cobit: "COBIT 2019", iso: "ISO 27001" }[fw]}</b><label>Principal<select data-k="ans_${fw}">${opts.map((o) => `<option ${it.answer?.[fw] === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>
            <label>Aceptables (Ctrl/⌘ + clic para varios)<select multiple size="6" data-k="acc_${fw}">${opts.map((o) => `<option ${acc.includes(o) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>
            <small class="muted">Aceptables guardadas: ${acc.map(esc).join(" · ") || "ninguna"}</small></div>`; }).join("")}</div>`;
      } else {
        body = `<p class="muted">${esc(it.prompt || "")}</p><label>Ideas clave que debe contener una respuesta correcta (una por línea)<textarea rows="4" data-k="key_ideas">${esc(lines(it.key_ideas))}</textarea></label>`;
      }
      return `<details class="kitem" data-iid="${esc(iid)}" ${it.kind === "open" && !(it.key_ideas || []).length ? "open" : ""}><summary><b>${esc(it.label || iid)}</b> <span class="pill">${esc(iid)}</span> ${it.kind === "open" && !(it.key_ideas || []).length ? `<span class="pill amber">sin ideas clave</span>` : ""}</summary><div class="kbody">${body}${common}</div></details>`;
    };
    const order = Object.keys(k.items);
    ed.innerHTML = `<div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3>Clave del caso ${esc(cid)}</h3>
        <div class="row"><label class="chk"><input type="checkbox" id="k-valid" ${k.validated ? "checked" : ""}> Caso validado por el docente</label>
          <button class="btn ghost sm" id="k-draft">Proponer ideas clave con IA</button><button class="btn sm" id="k-save">Guardar</button></div></div>
        ${k.reference ? `<details><summary class="muted" style="cursor:pointer">Datos de referencia del caso (valores calculados y puntos únicos de falla)</summary><pre>${esc(JSON.stringify(k.reference, null, 2))}</pre></details>` : ""}
        <div class="kitems">${order.map((iid) => card(iid, k.items[iid])).join("")}</div>
        <p><button class="btn sm" id="k-save2">Guardar</button></p></div>`;
    const collect = () => {
      const out = JSON.parse(JSON.stringify(k));
      ed.querySelectorAll(".kitem").forEach((el) => {
        const it = out.items[el.dataset.iid]; const v = (n) => el.querySelector(`[data-k="${n}"]`);
        if (v("rationale")) it.rationale = v("rationale").value.trim();
        if (v("where")) it.where = parseWhere(v("where").value);
        if (v("hints")) it.hints = parseLines(v("hints").value);
        if (it.kind === "tier") {
          it.answer = { ...(it.answer || {}), actual: v("ans_actual").value };
          const cks = (n) => [...el.querySelectorAll(`[data-k="${n}"]:checked`)].map((x) => x.value);
          it.accept = { actual: [...new Set([it.answer.actual, ...cks("acc_actual")])], objetivo: cks("acc_objetivo") };
          it.answer.objetivo = it.accept.objetivo[0] || "";
          it.evidence = parseLines(v("evidence").value);
        } else if (it.kind === "number") {
          it.answer = parseFloat(String(v("answer").value).replace(",", ".")); it.tol = parseFloat(String(v("tol").value).replace(",", ".")) || 0.02;
          it.unit = v("unit").value.trim(); it.formula = v("formula").value.trim();
          it.mistakes = parseLines(v("mistakes").value).map((x) => { const [a, ...m] = x.split("|"); return [parseFloat(a.replace(",", ".")), m.join("|").trim()]; }).filter(([a]) => isFinite(a));
        } else if (it.kind === "incident") {
          it.answer = {}; it.accept = {};
          ["itil", "cobit", "iso"].forEach((fw) => { it.answer[fw] = v("ans_" + fw).value; it.accept[fw] = [...new Set([it.answer[fw], ...[...v("acc_" + fw).selectedOptions].map((o) => o.value)])]; });
        } else {
          it.key_ideas = parseLines(v("key_ideas").value);
        }
      });
      return out;
    };
    const save = async () => {
      try { const key = collect(); await api("/api/admin/answer-keys/" + cid, { method: "PUT", json: { key, validated: $("#k-valid").checked } }); keyEdit = { cid, key: { ...key, validated: $("#k-valid").checked } }; toast("Clave guardada"); renderKey(); }
      catch (e) { toast(e.message, true); }
    };
    $("#k-save").addEventListener("click", save); $("#k-save2").addEventListener("click", save);
    $("#k-draft").addEventListener("click", async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = "Generando…";
      try {
        keyEdit.key = collect();
        const r = await api(`/api/admin/answer-keys/${cid}/draft-open`, { method: "POST", json: { only_empty: true } });
        const n = Object.keys(r.items || {}).length;
        Object.entries(r.items || {}).forEach(([iid, v]) => { const it = keyEdit.key.items[iid]; if (!it) return; it.key_ideas = v.key_ideas; if (!(it.hints || []).length) it.hints = v.hints; });
        toast(n ? `Borrador para ${n} pregunta(s): revísalo y guarda` : r.note || "Nada que generar"); editKey(cid, true);
      } catch (err) { toast(err.message, true); b.disabled = false; b.textContent = "Proponer ideas clave con IA"; }
    });
    ed.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- modal ---------- */
  function modal(html) { $("#modal-body").innerHTML = html; $("#modal").hidden = false; }
  function closeModal() { $("#modal").hidden = true; }
  $("#modal").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  boot();
})();
