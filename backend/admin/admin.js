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
    $("#filters").hidden = state.tab === "imp" || state.tab === "per";
    ({ seg: renderSeg, eq: renderEq, imp: renderImp, per: renderPer, tut: renderTut })[state.tab]();
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
      <div class="tbl-wrap"><table><thead><tr><th>Estado</th><th>NRC · Equipo</th><th>Caso</th><th>Ingresaron</th><th>Último acceso</th><th>Tutor IA</th><th>Avance</th></tr></thead><tbody>
      ${items.map((t) => { const [c, l] = health(t); const p = t.stats.progress || {}; const nm = t.members.filter((m) => m.active).length;
        return `<tr class="click" data-team="${t.id}"><td><span class="dot ${c}"></span>${l}</td><td><b>${esc(t.nrc)} · ${esc(t.name)}</b><br><span class="muted">${t.members.filter((m) => m.active).map((m) => esc(m.firstname)).join(", ") || "sin integrantes"}</span></td>
          <td>${t.case_id ? `<span class="pill">${t.case_id}</span>` : `<span class="pill amber">sin caso</span>`}</td>
          <td>${t.stats.people_in || 0}/${nm}<br><span class="muted">${t.stats.logins} accesos</span></td><td>${ago(t.stats.last_access)}</td>
          <td>${t.stats.submissions}${t.stats.last_level ? ` <span class="pill ${LVL[t.stats.last_level] || ""}">${esc(t.stats.last_level)}</span>` : ""}</td>
          <td style="min-width:230px">${mini("Ejercicios", p.tours_done, p.tours_total || 17)}${mini("Preguntas", p.questions_answered, p.questions_total || 6)}${mini("BMM", p.bmm_pct, 100)}${mini("Cálculos", p.calcs_ok, 4)}${mini("Matriz", p.matrix_alts, 4)}</td></tr>`; }).join("") || `<tr><td colspan="7" class="muted">No hay equipos con estos filtros. Importa los CSV en «Importar CSV».</td></tr>`}
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

  /* ---------- modal ---------- */
  function modal(html) { $("#modal-body").innerHTML = html; $("#modal").hidden = false; }
  function closeModal() { $("#modal").hidden = true; }
  $("#modal").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  boot();
})();
