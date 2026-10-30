/* InfraLab · «Su solución»: la arquitectura del caso con la solución del equipo y la de la consultora simuladas sobre ella, con paquetes
   animados (tráfico normal, pérdidas en un componente caído, desvío a la réplica, servicio degradado), la repetición de los incidentes,
   el comportamiento de cada punto único de falla y lo que la solución no cubrió y cómo cubrirlo.
   Lo usan el panel docente (/admin/archview.js, que el servidor lee de este mismo archivo) y la pestaña «Su solución» del sitio. */
(function () {
  "use strict";
  const CSS = `.av{color:#e2e8f0}.av h3{margin:12px 0 6px;font-size:16px}.av-muted{color:#94a3b8}.av-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}
    .av-card{background:rgba(15,23,42,.65);border:1px solid rgba(148,163,184,.22);border-radius:12px;padding:10px 12px}.av-tbl{overflow:auto;border:1px solid rgba(148,163,184,.22);border-radius:12px}
    .av-tbl table{width:100%;border-collapse:collapse;font-size:13px}.av-tbl th,.av-tbl td{padding:7px 9px;border-bottom:1px solid rgba(148,163,184,.14);text-align:left;vertical-align:top}.av-tbl th{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em}
    .av-pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11.5px;border:1px solid rgba(148,163,184,.35);white-space:nowrap}.av-pill.green{color:#a7f3d0;border-color:rgba(52,211,153,.5);background:rgba(52,211,153,.1)}
    .av-pill.amber{color:#fde68a;border-color:rgba(251,191,36,.5);background:rgba(251,191,36,.1)}.av-pill.red{color:#fecdd3;border-color:rgba(244,63,94,.5);background:rgba(244,63,94,.1)}
    .av-btn{font:600 12.5px Inter,sans-serif;color:#e2e8f0;background:rgba(15,23,42,.8);border:1px solid rgba(148,163,184,.35);border-radius:999px;padding:5px 12px;cursor:pointer}.av-btn:hover{border-color:#22d3ee}
    .av-btn.on{background:rgba(34,211,238,.18);border-color:#22d3ee;color:#cffafe}.av-btn:disabled{opacity:.45;cursor:default}.av-primary{background:linear-gradient(90deg,#22d3ee,#a78bfa);color:#0b1224;border:0}
    .av-msg{color:#fecdd3}.av ul{padding-left:18px}.av li{margin:4px 0}`;
  function style() { if (document.getElementById("av-style")) return; const s = document.createElement("style"); s.id = "av-style"; s.textContent = CSS; document.head.appendChild(s); }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const KIND = { a: ["Actor", "#94a3b8"], s: ["Servicio", "#22d3ee"], x: ["Tercero", "#facc15"], c: ["Componente", "#a78bfa"] };
  const EST = { evitado: ["green", "se evita"], reducido: ["amber", "se reduce"], igual: ["red", "se repite igual"] };
  const pct = (v) => (v == null ? "—" : String(v).replace(".", ",") + " %");

  // Mismo trazado por capas que la pestaña Arquitectura del sitio: cada nodo a la derecha de lo que depende de él.
  function layout(m) {
    const ids = m.nodes.map((n) => n[0]);
    const out = Object.fromEntries(ids.map((i) => [i, []])), inc = Object.fromEntries(ids.map((i) => [i, []]));
    m.edges.forEach(([a, b]) => { if (out[a] && inc[b]) { out[a].push(b); inc[b].push(a); } });
    const layer = {}, visiting = new Set();
    const L = (id) => { if (layer[id] != null) return layer[id]; if (visiting.has(id)) return 0; visiting.add(id); const v = inc[id].length ? Math.max(...inc[id].map((p) => L(p) + 1)) : 0; visiting.delete(id); return (layer[id] = v); };
    ids.forEach(L);
    const isolated = ids.filter((i) => !out[i].length && !inc[i].length);
    const maxL = Math.max(0, ...ids.filter((i) => !isolated.includes(i)).map((i) => layer[i]));
    isolated.forEach((i) => (layer[i] = maxL + 1));
    const cols = []; ids.forEach((i) => (cols[layer[i]] = cols[layer[i]] || []).push(i));
    const pos = {};
    cols.forEach((col) => { col.sort((a, b) => { const bc = (x) => (inc[x].length ? inc[x].reduce((s, p) => s + (pos[p] ?? 0), 0) / inc[x].length : 99); return bc(a) - bc(b); }); col.forEach((id, i) => (pos[id] = i)); });
    const W = 196, H = 58, CW = 240, RH = 80, PAD = 24, rows = Math.max(1, ...cols.map((c) => c.length)), xy = {};
    cols.forEach((col, li) => { const off = ((rows - col.length) * RH) / 2; col.forEach((id, i) => (xy[id] = { x: PAD + li * CW, y: PAD + off + i * RH })); });
    return { W, H, xy, inc, width: PAD * 2 + cols.length * CW - (CW - W), height: PAD * 2 + rows * RH };
  }

  // Diagrama animado: paquetes que viajan por cada dependencia (de quien usa un componente hacia el componente). Con una falla
  // («sim»: {id, tone, seen}) los paquetes hacia lo caído se pierden en rojo; si tiene respaldo, se desvían en verde a la réplica;
  // si el impacto se reduce, van en ámbar, más lentos, y algunos se pierden.
  function graph(d, G, sol, sim, pfx) {
    const nodos = (sol && sol.nodos) || {}, seen = (sim && sim.seen) || new Set(), tone = sim && sim.tone;
    const fids = new Set(sim ? [].concat(sim.id) : []), isF = (x) => fids.has(x), fid = fids.size > 0;
    let edges = "", packets = "", s = "";
    const pkt = (path, color, dur, lost, n = 2) => Array.from({ length: n }, (_, k) => `<circle r="${lost ? 3.6 : 3.2}" fill="${color}" opacity="0">
        <animateMotion dur="${dur}s" begin="${(k * dur) / n}s" repeatCount="indefinite" ${lost ? 'keyPoints="0;0.78" keyTimes="0;1" calcMode="linear"' : ""}><mpath href="#${path}"/></animateMotion>
        <animate attributeName="opacity" values="${lost ? "0;1;1;0" : "0;1;1;0"}" keyTimes="0;.1;${lost ? ".75" : ".9"};1" dur="${dur}s" begin="${(k * dur) / n}s" repeatCount="indefinite"/></circle>`).join("");
    d.modelo.edges.forEach(([a, b, inf], i) => {
      const A = G.xy[a], B = G.xy[b]; if (!A || !B) return;
      const x1 = A.x + G.W, y1 = A.y + G.H / 2, x2 = B.x, y2 = B.y + G.H / 2, mx = (x1 + x2) / 2, pid = `${pfx}-e${i}`;
      const hit = fid && (isF(b) || (seen.has(a) && (seen.has(b) || isF(b)))), toFailed = fid && isF(b);
      let stroke = inf ? "rgba(251,191,36,.45)" : "rgba(148,163,184,.4)", w = 1.5;
      if (hit && tone === "down") { stroke = "rgba(244,63,94,.75)"; w = 2.2; }
      if (hit && tone === "part") { stroke = "rgba(251,191,36,.75)"; w = 2.2; }
      edges += `<path id="${pid}" class="ar-edge" data-a="${esc(a)}" data-b="${esc(b)}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="${stroke}" stroke-width="${w}" ${inf || (hit && tone === "part") ? 'stroke-dasharray="5 4"' : ""}/>`;
      if (toFailed && tone === "ok") {   // se desvía a la réplica
        const rx = B.x + 9, ry = B.y + 9 + G.H / 2, rid = `${pid}-r`;
        edges += `<path id="${rid}" d="M${x1},${y1} C${mx},${y1} ${mx},${ry} ${rx},${ry}" fill="none" stroke="rgba(52,211,153,.8)" stroke-width="2.2"/>`;
        packets += pkt(rid, "#34d399", 1.8, false, 3);
        edges += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="rgba(244,63,94,.35)" stroke-width="1.2" stroke-dasharray="2 5"/>`;
      } else if (hit && tone === "down") packets += pkt(pid, "#f43f5e", 1.5, true, 2);
      else if (hit && tone === "part") packets += pkt(pid, "#fbbf24", 2.8, k_lost(i), 2);
      else packets += pkt(pid, inf ? "#fbbf24" : "#22d3ee", 2.4, false, inf ? 1 : 2);
    });
    // Estado de cada nodo con la simulación: color de fondo sólido, borde y etiqueta. Sin simulación, los componentes que siguen siendo
    // únicos se ven en riesgo (rojo tenue) y los que tienen respaldo, protegidos (verde tenue).
    const STATE = {
      caido: { fill: "#7f1d1d", stroke: "#f43f5e", label: "CAÍDO", txt: "#fecdd3" }, degradado: { fill: "#78350f", stroke: "#fbbf24", label: "DEGRADADO", txt: "#fde68a" },
      operativo: { fill: "#064e3b", stroke: "#34d399", label: "OPERATIVO", txt: "#a7f3d0" }, replica: { fill: "#1e293b", stroke: "#64748b", label: "EN RÉPLICA", txt: "#cbd5e1" },
      riesgo: { fill: "#3b0d1a", stroke: "#f43f5e", label: "SIGUE ÚNICO", txt: "#fda4af" }, protegido: { fill: "#0b2a24", stroke: "#34d399", label: "CON RESPALDO", txt: "#a7f3d0" },
    };
    d.modelo.nodes.forEach((n) => {
      const p = G.xy[n[0]]; if (!p) return;
      const [kind, col] = KIND[n[2]] || KIND.c, st = nodos[n[0]] || {}, failed = isF(n[0]), aff = seen.has(n[0]);
      let key = "";
      if (fid) key = failed ? (tone === "ok" ? "replica" : tone === "part" ? "degradado" : "caido") : aff ? (tone === "part" ? "degradado" : "caido") : n[2] === "a" ? "" : "operativo";
      else if (n[2] === "c" && (st.unico || n[4])) key = st.resuelto ? "protegido" : "riesgo";
      const S = STATE[key];
      const name = String(n[1]); const short = name.length > 20 ? name.slice(0, 19) + "…" : name;
      const fill = S ? S.fill : "#0b1224", stroke = S ? S.stroke : col;
      s += `<g class="ar-node" data-n="${esc(n[0])}" style="cursor:pointer">
        ${failed && tone === "ok" ? `<rect x="${p.x + 9}" y="${p.y + 9}" width="${G.W}" height="${G.H}" rx="10" fill="#064e3b" stroke="#34d399" stroke-width="1.8" stroke-dasharray="5 3">
            <animate attributeName="opacity" from="0" to="1" dur=".6s" fill="freeze"/></rect>
          <text x="${p.x + G.W + 6}" y="${p.y + G.H + 5}" text-anchor="end" style="font:700 10px 'JetBrains Mono',monospace;fill:#34d399">RÉPLICA OPERATIVA</text>` : ""}
        <rect class="ar-box" x="${p.x}" y="${p.y}" width="${G.W}" height="${G.H}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="${S ? 2.2 : 1.4}">
          ${S && fid ? `<animate attributeName="fill" from="#0b1224" to="${fill}" dur=".7s" fill="freeze"/>` : ""}
          ${failed && tone !== "ok" ? `<animate attributeName="stroke-opacity" values="1;.2;1" dur=".9s" repeatCount="indefinite"/>` : ""}</rect>
        <text x="${p.x + 10}" y="${p.y + 19}" style="font:700 11px 'JetBrains Mono',monospace;fill:${S ? S.txt : col}">${esc(kind.toUpperCase())}</text>
        <text x="${p.x + 10}" y="${p.y + 44}" style="font:700 15px Inter,sans-serif;fill:${failed && tone === "ok" ? "#94a3b8" : "#f1f5f9"}">${esc(short)}</text>
        ${S ? `<rect x="${p.x + G.W - 96}" y="${p.y + 6}" width="90" height="18" rx="9" fill="${stroke}" opacity=".95"/><text x="${p.x + G.W - 51}" y="${p.y + 19}" text-anchor="middle" style="font:800 10.5px Inter,sans-serif;fill:#0b1224">${S.label}</text>` : ""}
        ${failed && tone !== "ok" ? `<text x="${p.x + G.W - 14}" y="${p.y + 47}" text-anchor="middle" style="font:800 16px Inter,sans-serif;fill:#f43f5e">✕</text>` : ""}
        <title>${esc(name)}${d.funciones[n[0]] ? ` — ${esc(d.funciones[n[0]])}` : ""}${S ? ` · ${S.label}` : ""}</title></g>`;
    });
    return `<svg viewBox="0 0 ${G.width + 30} ${G.height + 14}" style="width:100%;height:auto;display:block">${edges}${packets}${s}</svg>`;
  }
  const k_lost = (i) => i % 2 === 0;   // con impacto reducido, la mitad de las dependencias pierde paquetes

  const incTable = (eq, co) => {
    const ci = Object.fromEntries(((co && co.incidentes) || []).map((i) => [i.id, i]));
    return `<div class="av-tbl"><table><thead><tr><th>Incidente</th><th>Con la solución del equipo</th>${co ? "<th>Con la mirada de la consultora</th>" : ""}</tr></thead><tbody>
      ${(eq.incidentes || []).map((i) => { const c = ci[i.id]; const cell = (x) => (x ? `<span class="av-pill ${EST[x.estado][0]}">${EST[x.estado][1]}</span><br><span class="av-muted">${esc(x.porque)}</span>` : "—");
        return `<tr><td><b>${esc(i.id)}</b> · ${esc(i.titulo)}${i.minutos ? ` <span class="av-muted">(${i.minutos} min)</span>` : ""}</td><td>${cell(i)}</td>${co ? `<td>${cell(c)}</td>` : ""}</tr>`; }).join("")}</tbody></table></div>`;
  };
  const solBox = (title, sol, extra) => (sol && sol.disponible
    ? `<div class="av-card" style="padding:10px 12px"><b>${esc(title)}:</b> ${esc(sol.alternativa)}<br><span class="av-muted">Patrones: ${esc((sol.patrones || []).join(" + ") || "—")}</span>
        <p style="margin:6px 0 0">Incidentes: <span class="av-pill green">${sol.resumen.evitados} se evitan</span> <span class="av-pill amber">${sol.resumen.reducidos} se reducen</span> <span class="av-pill red">${sol.resumen.iguales} se repiten</span>
        · ${sol.resumen.minutos_evitados} min de caída evitados</p>
        <p class="av-muted" style="margin:4px 0 0">Siguen siendo únicos: ${sol.unicos_que_quedan.length ? esc(sol.unicos_que_quedan.map((u) => u.componente).join(", ")) : "ninguno"}${sol.capas_expuestas.length ? ` · capa expuesta: ${esc(sol.capas_expuestas.join(", "))}` : ""}</p>${extra || ""}</div>`
    : `<div class="av-card" style="padding:10px 12px"><b>${esc(title)}:</b> <span class="av-muted">${esc((sol && sol.motivo) || "no disponible")}</span></div>`);

  // Pinta todo en «box». opts: {admin: true en el panel, label: título}. Los datos vienen de /api/admin/e3/team/<id>/architecture o /api/e3/architecture.
  function render(box, d, opts) {
    style();
    const admin = !!(opts && opts.admin), label = (opts && opts.label) || "", G_ = admin ? "del grupo" : "de su equipo";
    if (!d || !d.disponible) { box.innerHTML = `<div class="av"><p class="av-muted">${esc((d && d.motivo) || "No disponible.")}</p></div>`; return; }
    const G = layout(d.modelo), eq = d.equipo, co = d.consultora;
    const node = Object.fromEntries(d.modelo.nodes.map((n) => [n[0], n]));
    const both = eq.disponible && co && co.disponible;
    let view = both ? "ambos" : eq.disponible ? "equipo" : "consultora", last = null, timer = null;
    const $ = (s) => box.querySelector(s);
    const total = d.modelo.nodes.filter((x) => x[2] === "s").length;
    const SOL = { equipo: ["Solución del equipo", eq], consultora: ["Mirada de la consultora", co] };
    const shown = () => (view === "ambos" ? ["equipo", "consultora"] : [view]);
    // Lo que arrastra la falla de un componente (quién depende de él, en cascada).
    const cascade = (id) => { const seen = new Set([id]), q = [id]; while (q.length) { const x = q.shift(); (G.inc[x] || []).forEach((p) => { if (!seen.has(p)) { seen.add(p); q.push(p); } }); } seen.delete(id); return seen; };
    const downOf = (seen) => [...seen].map((x) => node[x]).filter((x) => x && x[2] === "s");
    const svc = (seen, tone) => { const dn = downOf(seen); return `servicios ${tone === "part" ? "degradados" : "caídos"}: <b>${dn.length}/${total}</b>${dn.length ? ` (${esc(dn.map((x) => x[1]).join(", "))})` : ""}`; };
    // Resultado de una simulación para una solución: el estado de la falla y el texto que lo explica.
    function outcome(key, act) {
      const sl = SOL[key][1];
      if (!act) return { sim: null, txt: "" };
      if (act.type === "node") {
        const n = node[act.id], st = (sl.nodos || {})[act.id] || {}, ok = n[2] === "c" && st.resuelto && (st.unico || n[4]);
        const seen = ok ? new Set() : cascade(act.id);
        return { sim: { id: act.id, tone: ok ? "ok" : "down", seen }, txt: ok ? `<span style="color:#34d399">«${esc(n[1])}» falla y la réplica toma el tráfico: no se cae nada.</span>`
          : `<span style="color:#fda4af">«${esc(n[1])}» cae</span> → ${seen.size} elementos en cascada · ${svc(seen)}.` };
      }
      const i = (sl.incidentes || []).find((x) => x.id === act.id); if (!i) return { sim: null, txt: "" };
      const [cls, t] = EST[i.estado];
      const head = `<span class="av-pill ${cls}">${t}</span> <span class="av-muted">${esc(i.porque)}</span>`;
      const thirds = d.modelo.nodes.filter((n) => n[2] === "x").map((n) => n[0]);
      if ((!i.causa_id || !node[i.causa_id]) && i.capa === "prov" && thirds.length) {   // la causa es un proveedor: fallan los terceros del diagrama
        const tone = i.estado === "evitado" ? "ok" : i.estado === "reducido" ? "part" : "down", seen = new Set();
        if (tone !== "ok") thirds.forEach((x) => cascade(x).forEach((y) => seen.add(y)));
        return { sim: { id: thirds, tone, seen }, txt: `${head}<br>Causa: un proveedor externo (${esc(thirds.map((x) => node[x][1]).join(", "))})${tone === "ok" ? " · el tráfico se desvía: no se repite." : ` · ${svc(seen, tone)}${tone === "part" ? " · timeouts y reintentos contienen la falla: el impacto se reduce." : "."}`}` };
      }
      if (!i.causa_id || !node[i.causa_id]) return { sim: null, txt: `${head}<br><span class="av-muted">${i.causa ? `Su causa es ${esc(i.causa)}, no un componente del diagrama.` : (admin ? "El grupo no dijo qué componente lo causó." : "Su equipo no dijo qué componente lo causó.")}</span>` };
      const tone = i.estado === "evitado" ? "ok" : i.estado === "reducido" ? "part" : "down", seen = tone === "ok" ? new Set() : cascade(i.causa_id);
      return { sim: { id: i.causa_id, tone, seen }, txt: `${head}<br>Causa: «${esc(node[i.causa_id][1])}»${tone === "ok" ? " · la réplica toma el tráfico: el incidente no se repite." : ` · ${svc(seen, tone)}${tone === "part" ? " · el impacto se reduce, pero no desaparece." : "."}`}` };
    }
    // Lo que el grupo tiene que hacer para la exposición: foco único, qué reforzar, cada pendiente (por qué, dónde, fuentes, cómo
    // sustentarlo) y la estructura común. Sale de la guía de exposiciones de la docente.
    function expoHtml(x) {
      if (!x) return "";
      const f = x.foco || {}, row = (k, v) => `<tr><th style="width:170px">${k}</th><td>${esc(v)}</td></tr>`;
      return `<div id="av-expo" class="av-card" style="margin-top:16px;border:2px solid #22d3ee">
        <h3 style="margin:0 0 6px;color:#67e8f9">📋 Lo que tienen que hacer para la exposición</h3>
        <div class="av-card" style="border-color:#22d3ee;margin:6px 0"><b>🎯 Su foco único:</b> ${esc(f.texto || "—")}<br><span class="av-muted">${esc(f.por_que || "")}</span></div>
        <h3>✅ Lo que hicieron bien: recálquenlo</h3>${x.bien.length ? `<ul>${x.bien.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : `<p class="av-muted">—</p>`}
        <h3>❌ Lo que deben atender</h3>
        ${x.pendientes.length ? x.pendientes.map((p) => `<div class="av-card" style="margin:6px 0"><b>${esc(p.que)}</b><div class="av-tbl" style="margin-top:6px"><table>
          ${row("Por qué investigarlo", p.porque)}${row("En qué parte del caso", p.donde)}${row("Cómo cubrirlo", p.como)}${row("Dónde investigar", (p.fuentes || []).join("; ") || "Base de conocimiento del curso y expediente")}${row("Cómo sustentarlo", p.sustentar)}</table></div></div>`).join("")
          : `<p class="av-muted">La simulación no deja pendientes: expliquen cómo lo lograron.</p>`}
        <h3>🗣️ Cómo exponerlo para que todos lo entiendan</h3>
        <div class="av-tbl"><table><tr><th>Tiempo</th><th>Parte</th><th>Qué hacer</th></tr>${(x.estructura || []).map((s) => `<tr><td>${esc(s.tiempo)}</td><td><b>${esc(s.parte)}</b></td><td>${esc(s.como)}</td></tr>`).join("")}</table></div>
        <ul style="margin-top:8px">${(x.reglas || []).map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>`;
    }
    // Resumen en tres listas, para leerlo de un vistazo: qué resuelve la solución del equipo, qué no y en qué se equivocó el diagnóstico;
    // y, si hay mirada de la consultora, qué resuelve ella que el equipo no y al revés.
    // Estrellas ganadoras: las que aprobó la docente (el equipo las reclama en el próximo corte). En el panel, también las propuestas sin aprobar.
    function starsBox() {
      const st = d.estrellas || { estrellas: [] }, got = st.estrellas || [], keys = new Set(got.map((x) => x.star_key));
      const pend = admin ? (st.propuestas || []).filter((x) => !keys.has(x.clave)) : [];
      if (!got.length && !pend.length) return "";
      const n = (v) => String(v).replace(".", ",");
      return `<div class="av-card" style="margin:10px 0;border:2px solid #facc15;background:linear-gradient(135deg,rgba(250,204,21,.16),rgba(167,139,250,.12))">
        <h3 style="margin:0 0 4px;color:#fde047">⭐ Estrellas ganadoras para el próximo corte${got.length ? ` · +${n(st.disponible)} décimas disponibles` : ""}</h3>
        ${got.length ? `<p style="margin:0 0 6px">${admin ? "El grupo resolvió" : "Su equipo resolvió"} lo que la mirada de la consultora no vio. Cada estrella suma décimas a la nota del próximo corte (hasta ${n(st.maximo || 5)} décimas): ${admin ? "el grupo las reclama contigo." : "reclámenlas con su docente."}</p>
          <ul style="margin:0">${got.map((x) => `<li>⭐ ${esc(x.text)} · <b>+${n(x.value)} décimas</b> ${x.status === "reclamada" ? `<span class="av-pill">ya reclamada</span>` : `<span class="av-pill green">ganadora · disponible</span>`}</li>`).join("")}</ul>` : ""}
        ${pend.length ? `<p class="av-muted" style="margin:8px 0 2px">Propuestas sin aprobar (el grupo aún no las ve; apruébalas en «Estrellas para el próximo corte»):</p>
          <ul style="margin:0">${pend.map((x) => `<li>☆ ${esc(x.texto)} · +${n(x.valor)} décimas</li>`).join("")}</ul>` : ""}</div>`;
    }
    function summary() {
      if (!eq.disponible) return `<div class="av-card" style="margin:8px 0"><b>En resumen:</b> <span class="av-muted">${esc(eq.motivo)}</span></div>`;
      const cname = (id) => String((node[id] || [id, id])[1]);
      const ok = [], bad = [], diag = [], better = [], theirs = [];
      Object.entries(eq.nodos || {}).forEach(([id, x]) => { if (x.unico && x.resuelto) ok.push(`${cname(id)} deja de ser un punto único (tiene respaldo)`); });
      (eq.incidentes || []).forEach((i) => {
        const t = `Incidente ${i.id} · ${i.titulo}${i.minutos ? ` (${i.minutos} min)` : ""}`;
        if (i.estado === "evitado") ok.push(`${t}: no se repetiría`);
        else if (i.estado === "reducido") ok.push(`${t}: se reduce, pero no desaparece`);
        else bad.push(`${t}: se repetiría igual — ${i.porque}`);
        if (i.diagnostico_ok === false) diag.push(`Incidente ${i.id} · ${i.titulo}: lo atribuyeron a ${i.causa_equipo}, pero según el caso lo causó ${i.causa || "otra causa"}`);
      });
      (eq.unicos_que_quedan || []).forEach((u) => bad.push(`${u.componente} sigue siendo un punto único (${u.funcion})`));
      (eq.capas_expuestas || []).forEach((l) => bad.push(`La capa de ${l} queda expuesta: ningún patrón de la solución la atiende`));
      if (co && co.disponible) {
        const ci = Object.fromEntries((co.incidentes || []).map((i) => [i.id, i]));
        (eq.incidentes || []).forEach((i) => { const c = ci[i.id]; if (!c) return; const rank = { evitado: 2, reducido: 1, igual: 0 };
          if (rank[c.estado] > rank[i.estado]) better.push(`Incidente ${i.id} · ${i.titulo}: con la consultora ${c.estado === "evitado" ? "no se repite" : "se reduce"} (${c.porque})`);
          if (rank[c.estado] < rank[i.estado]) theirs.push(`Incidente ${i.id} · ${i.titulo}: su solución lo ${i.estado === "evitado" ? "evita" : "reduce"} y la de la consultora no`); });
        Object.entries(eq.nodos || {}).forEach(([id, x]) => { const y = (co.nodos || {})[id] || {};
          if (x.unico && x.resuelto && !y.resuelto) theirs.push(`${cname(id)}: su solución le da respaldo y la de la consultora no`);
          if (x.unico && !x.resuelto && y.resuelto) better.push(`${cname(id)}: la consultora le da respaldo y su solución no`); });
      }
      const list = (xs, empty) => (xs.length ? `<ul style="margin:4px 0 0">${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="av-muted" style="margin:4px 0 0">${empty}</p>`);
      const col = (icon, title, color, xs, empty) => `<div class="av-card" style="border-color:${color}"><b style="color:${color}">${icon} ${title}</b>${list(xs, empty)}</div>`;
      return `${starsBox()}<div style="margin:10px 0"><h3 style="margin:0 0 6px">En resumen</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">
          ${col("✅", "Lo que su solución resuelve", "#34d399", ok, "Nada de lo que se simula.")}
          ${col("❌", "Lo que su solución no resuelve", "#f43f5e", bad, "Nada: con este diagnóstico no queda nada sin atender.")}
          ${col("⚠️", "Errores de diagnóstico", "#fbbf24", diag, "Ninguno: las causas que dieron coinciden con el caso.")}</div>
        ${better.length || theirs.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px;margin-top:10px">
          ${col("🔎", "La consultora resuelve y su solución no", "#22d3ee", better, "Nada.")}${col("⭐", `Su solución resuelve y la de la consultora no${(d.estrellas && d.estrellas.estrellas || []).length ? " · son sus estrellas ganadoras" : ""}`, "#a78bfa", theirs, "Nada.")}</div>` : ""}</div>`;
    }
    function draw(act) {
      last = act || null;
      box.querySelectorAll("#ar-seg button").forEach((b) => b.classList.toggle("on", b.dataset.v === view));
      const title = act ? (act.type === "node" ? `Falla de «${esc(node[act.id][1])}»` : (() => { const i = (eq.incidentes || []).find((x) => x.id === act.id) || {}; return `Incidente ${esc(act.id)} · ${esc(i.titulo || "")}${i.minutos ? ` (${i.minutos} min de caída en el caso)` : ""}`; })()) : "";
      $("#ar-g").innerHTML = shown().map((k) => { const o = outcome(k, act);
        const svs = d.modelo.nodes.filter((x) => x[2] === "s").map((x) => x[0]), sim = o.sim, fs = new Set(sim ? [].concat(sim.id) : []);
        const st = (id) => (!sim ? "op" : sim.tone === "ok" && fs.has(id) ? "op" : fs.has(id) || sim.seen.has(id) ? (sim.tone === "part" ? "deg" : "down") : "op");
        const cnt = { op: 0, deg: 0, down: 0 }; svs.forEach((id) => cnt[st(id)]++);
        const meter = `<span style="white-space:nowrap"><span class="av-pill green">● ${cnt.op} operativos</span> <span class="av-pill amber">● ${cnt.deg} degradados</span> <span class="av-pill red">● ${cnt.down} caídos</span></span>`;
        return `<div style="margin-bottom:8px"><div class="av-row" style="justify-content:space-between"><b style="color:${k === "equipo" ? "#a78bfa" : "#22d3ee"}">${SOL[k][0]}</b>${meter}${o.txt ? `<span style="flex:1 1 380px;text-align:right">${o.txt}</span>` : ""}</div>
          <div class="av-tbl" style="padding:6px;background:#070d1c">${graph(d, G, SOL[k][1], o.sim, "ar" + k)}</div></div>`; }).join("");
      $("#ar-out").innerHTML = act ? `<b>${title}</b>` : `<span class="av-muted">Los paquetes muestran el tráfico normal. Haz clic en un componente para «apagarlo», en un incidente para repetirlo, o reproduce todos los incidentes.</span>`;
    }
    box.innerHTML = `<div class="av"><h3>Su solución${label ? ` · ${esc(label)}` : ""}${admin ? ` <span class="av-pill amber">solo la docente</span>` : ""}</h3>
      <p class="av-muted">La arquitectura del caso con cada solución aplicada sobre el diagnóstico ${G_} (los componentes que ${admin ? "marcó" : "marcaron"} como únicos y las causas que ${admin ? "dio" : "dieron"} a los incidentes). Los puntos que viajan son las solicitudes entre componentes: <span style="color:#22d3ee">cian</span> tráfico normal · <span style="color:#f43f5e">rojo</span> se pierden en un componente caído · <span style="color:#34d399">verde</span> se desvían a la réplica · <span style="color:#fbbf24">ámbar</span> servicio degradado. Cada componente y servicio cambia de color según lo que le pasa: <b style="color:#34d399">OPERATIVO</b> · <b style="color:#fbbf24">DEGRADADO</b> · <b style="color:#f43f5e">CAÍDO</b> · <b style="color:#cbd5e1">EN RÉPLICA</b> (falló, pero la réplica atiende). Sin simulación, los puntos únicos se ven <b style="color:#f43f5e">SIGUE ÚNICO</b> o <b style="color:#34d399">CON RESPALDO</b> según la solución.</p>
      ${d.exposicion ? `<div class="av-row" style="margin:10px 0"><button type="button" class="av-btn av-primary" id="av-go-expo" style="font-size:14px;padding:8px 16px">📋 Lo que tienen que hacer para la exposición</button>
        <span class="av-muted">${admin ? "Así lo ve el grupo." : "Su foco único, qué reforzar, qué investigar y cómo sustentarlo."}</span></div>` : ""}
      ${summary()}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px;margin:8px 0">${solBox("Solución del equipo", eq)}${co ? solBox("Mirada de la consultora", co, d.consultora_porque ? `<p class="av-muted" style="margin:4px 0 0">${esc(d.consultora_porque)}</p>` : "") : `<div class="av-card" style="padding:10px 12px"><span class="av-muted">Este caso no tiene la mirada de la consultora en la clave.</span></div>`}</div>
      <div class="av-row" id="ar-seg">${both ? `<button class="av-btn" data-v="ambos">Comparar ambos</button>` : ""}<button class="av-btn" data-v="equipo" ${eq.disponible ? "" : "disabled"}>Solución del equipo</button>${co && co.disponible ? `<button class="av-btn" data-v="consultora">Mirada de la consultora</button>` : ""}
        <button class="av-btn" id="ar-normal">Tráfico normal</button></div>
      ${eq.disponible && eq.incidentes.length ? `<div class="av-row" id="ar-inc"><button class="av-btn av-primary" id="ar-play">▶ Reproducir incidentes</button><span class="av-muted">o uno:</span>${eq.incidentes.map((i) => `<button class="av-btn" data-inc="${esc(i.id)}" title="${esc(i.titulo)}">${esc(i.id)} · ${esc(i.titulo.length > 24 ? i.titulo.slice(0, 23) + "…" : i.titulo)}</button>`).join("")}</div>` : ""}
      <div class="av-card" id="ar-out" style="padding:10px 12px;margin:8px 0"></div>
      <div id="ar-g"></div>
      <h3 style="margin-top:14px">Comportamiento de los puntos únicos de falla (SPOF)</h3>
      <p class="av-muted">Cada componente que ${admin ? "el grupo marcó" : "su equipo marcó"} como único o que el caso declara como punto único, apagado con cada solución: si tiene respaldo, no se cae nada; si no, lo que arrastra en cascada. «Simular» lo muestra con los paquetes.</p>
      <div id="ar-spof"></div>
      <h3 style="margin-top:14px">${admin ? "Qué no cubrieron y cómo podrían cubrirlo" : "Qué no cubrió su solución y cómo podrían cubrirlo"}</h3>
      ${d.falta.length ? `<ul>${d.falta.map((f) => `<li><b>${esc(f.que)}</b><br><span class="${f.consultora_lo_resuelve ? "" : "av-muted"}">→ ${esc(f.como)}</span></li>`).join("")}</ul>` : `<p class="av-muted">Con ese diagnóstico, la solución del equipo no deja componentes únicos ni incidentes sin atender.</p>`}
      <h3 style="margin-top:14px">Repetición de incidentes</h3>${eq.disponible ? incTable(eq, co && co.disponible ? co : null) : `<p class="av-muted">${esc(eq.motivo)}</p>`}
      ${eq.disponible && eq.cadenas.length ? `<h3 style="margin-top:14px">Disponibilidad de los servicios (laboratorio ${G_})</h3><div class="av-tbl"><table><thead><tr><th>Servicio</th><th>Antes</th><th>Con su solución</th><th>Horas de caída al año</th></tr></thead><tbody>
        ${eq.cadenas.map((c) => `<tr><td>${esc(c.servicio)}</td><td>${pct(c.antes)}</td><td><b>${pct(c.despues)}</b></td><td>${c.horas_antes} → <b>${c.horas_despues}</b></td></tr>`).join("")}</tbody></table></div>` : ""}
      ${expoHtml(d.exposicion)}</div>`;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } const b = $("#ar-play"); if (b) b.textContent = "▶ Reproducir incidentes"; };
    $("#ar-seg").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b || b.disabled) return; view = b.dataset.v; draw(last); });
    $("#ar-g").addEventListener("click", (e) => { const g = e.target.closest(".ar-node"); if (g) { stop(); draw({ type: "node", id: g.dataset.n }); } });
    $("#ar-inc")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-inc]");
      if (b) { stop(); draw({ type: "inc", id: b.dataset.inc }); return; }
      if (!e.target.closest("#ar-play")) return;
      if (timer) return stop();
      const ids = (eq.incidentes || []).map((i) => i.id); let k = 0;
      const step = () => { draw({ type: "inc", id: ids[k % ids.length] }); k++; };
      step(); timer = setInterval(step, 4500); $("#ar-play").textContent = "■ Detener";
    });
    $("#ar-normal")?.addEventListener("click", () => { stop(); draw(null); });
    $("#av-go-expo")?.addEventListener("click", () => { const t = $("#av-expo"); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); });
    new MutationObserver((_, ob) => { if (!box.isConnected || !box.querySelector("#ar-g")) { stop(); ob.disconnect(); } }).observe(document.body, { childList: true, subtree: true });   // al cerrar la ventana o cambiar de pestaña se detiene
    // Tabla de los SPOF: qué pasa al apagar cada uno con cada solución.
    const spofs = d.modelo.nodes.filter((n) => n[2] === "c" && (((eq.nodos || {})[n[0]] || {}).unico || n[4]));
    const cell = (s, id) => { if (!s || !s.disponible) return `<span class="av-muted">—</span>`; const st = (s.nodos || {})[id] || {};
      if (st.resuelto) return `<span class="av-pill green">con respaldo</span> <span class="av-muted">no se cae nada</span>`;
      const down = downOf(cascade(id)); return `<span class="av-pill red">sigue único</span> <span class="av-muted">${down.length ? `tumba ${down.length}/${total}: ${esc(down.map((x) => x[1]).join(", "))}` : "no arrastra servicios"}</span>`; };
    $("#ar-spof").innerHTML = spofs.length ? `<div class="av-tbl"><table><thead><tr><th>Punto único</th><th>Hoy (sin solución)</th><th>Con la solución del equipo</th>${co && co.disponible ? "<th>Con la mirada de la consultora</th>" : ""}<th></th></tr></thead><tbody>
      ${spofs.map((n) => `<tr><td><b>${esc(n[1])}</b><br><span class="av-muted">${((eq.nodos || {})[n[0]] || {}).unico ? (admin ? "el grupo lo marcó como único" : "su equipo lo marcó como único") : (admin ? "el caso lo declara; el grupo no lo marcó" : "el caso lo declara y su equipo no lo marcó")} · ${esc(d.funciones[n[0]] || "")}</span></td>
        <td>${((dn) => `<span class="av-pill red">cae</span> <span class="av-muted">${dn.length ? `tumba ${dn.length}/${total}: ${esc(dn.map((x) => x[1]).join(", "))}` : "no arrastra servicios"}</span>`)(downOf(cascade(n[0])))}</td>
        <td>${cell(eq, n[0])}</td>${co && co.disponible ? `<td>${cell(co, n[0])}</td>` : ""}<td><button class="av-btn" data-spof="${esc(n[0])}">Simular</button></td></tr>`).join("")}</tbody></table></div>`
      : `<p class="av-muted">Ni el grupo ni el caso marcan puntos únicos de falla.</p>`;
    $("#ar-spof").addEventListener("click", (e) => { const b = e.target.closest("[data-spof]"); if (!b) return; stop(); draw({ type: "node", id: b.dataset.spof }); $("#ar-g").scrollIntoView({ behavior: "smooth", block: "start" }); });
    draw(null);
  }
  window.ArchView = { render };
})();
