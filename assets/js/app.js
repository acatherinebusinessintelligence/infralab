/* ============ InfraLab · lógica de la aplicación ============ */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, d = 2) => Number(n).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: d });
  const icon = window.icon;
  const hydrate = (root = document) => $$("[data-icon]", root).forEach((el) => { el.innerHTML = icon(el.dataset.icon); el.removeAttribute("data-icon"); });

  const store = {
    get(k, d) { try { const v = localStorage.getItem("infralab:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("infralab:" + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  };

  // Cada cambio guardado programa la sincronización del avance del equipo (si hay sesión de equipo).
  const _storeSet = store.set;
  store.set = (k, v) => { _storeSet(k, v); if (k !== "team" && k !== "student") { scheduleSync(); twOnSet(k, v); } };

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2200);
  }

  const { COMPONENTS, CATEGORIES, PATTERNS, PATTERN_CATS, CASE_MODEL, SPOF_TYPES, EVIDENCE_DOMAINS, GLOSSARY } = window;

  /* ---------- Datos de casos ---------- */
  const SECTOR_COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#fb923c", "#e879f9", "#2dd4bf", "#f87171", "#a3e635", "#c084fc", "#38bdf8", "#facc15", "#fb7185"];
  const CASES = window.BMM_CASES.map((c, i) => ({ ...c, ...CASE_MODEL[c.case_id], color: SECTOR_COLORS[i % SECTOR_COLORS.length], data: window.CASE_DATA[c.case_id], corpus: window.BMM_CORPUS[c.case_id] || [] }));
  const byId = Object.fromEntries(CASES.map((c) => [c.case_id, c]));

  /* Calidad de la evidencia calculada desde los datos del documento oficial de cada caso (mismos criterios para los 15):
   * Disponibilidad/Incidentes: completos si hay periodo, caída, nº de incidentes y recuperación (parciales si vienen de tickets).
   * Timestamps: completos si todos los incidentes tienen duración; parciales si solo algunos; faltantes si ninguno.
   * Latencia: completa si hay promedio medido; faltante si el caso dice que no hay histórico.
   * Capacidad: completa con CPU/RAM medidos y crecimiento de almacenamiento; parcial si falta alguno.
   * Backup: parcial en todos: los documentos lo describen sin indicadores de éxito ni de restauración. */
  function pdfEvidence(c) {
    const d = c.data, s = d.service, rows = d.blocks.flatMap((b) => b.rows);
    const has = (tag) => rows.some((r) => r[3] === tag);
    const durs = d.incidents.filter((i) => i[3] != null).length;
    return {
      Disponibilidad: s.partial ? "p" : "c",
      Incidentes: s.partial ? "p" : "c",
      Timestamps: s.partial ? "p" : durs === d.incidents.length ? "c" : durs ? "p" : "f",
      Latencia: has("latAvg") ? "c" : rows.some((r) => /latencia/i.test(r[0])) ? "f" : "n",
      Capacidad: has("cpuAvg") && d.storage.growth ? "c" : has("cpuAvg") || d.storage.used ? "p" : "f",
      Backup: "p",
    };
  }
  CASES.forEach((c) => (c.evidence = pdfEvidence(c)));

  /* ---------- Índice de exposición (conteo de palabras clave del corpus) ---------- */
  const EXPOSURE = {
    Continuidad: ["continuidad", "caida", "interrupcion", "contingencia", "backup", "respaldo", "recuperacion", "restauracion", "24/7", "fuera de servicio"],
    Seguridad: ["seguridad", "mfa", "credenciales", "iso 27001", "acceso", "privacidad", "antifraude", "segmentacion", "permisos", "ciberseguridad"],
    Capacidad: ["capacidad", "saturacion", "sobrecarga", "pico", "lentitud", "latencia", "escalabilidad", "crecimiento", "almacenamiento", "cpu"],
    Conectividad: ["wan", "vpn", "enlace", "conectividad", "intermitencia", "desconectad", "sedes", "gateway", "internet"],
    Proveedores: ["proveedor", "externo", "pasarela", "transportadoras", "region", "terceros", "contrato"],
    Gobierno: ["gobierno", "itil", "cobit", "sla", "cambios", "responsabilidad", "raci", "catalogo", "metricas", "roles"],
  };
  CASES.forEach((c) => {
    const txt = c.corpus.map((k) => k.text.toLowerCase()).join(" ");
    c.exposure = {};
    for (const [dim, words] of Object.entries(EXPOSURE)) c.exposure[dim] = words.reduce((a, w) => a + (txt.split(w).length - 1), 0);
  });
  const EXP_MAX = Math.max(...CASES.flatMap((c) => Object.values(c.exposure)));
  CASES.forEach((c) => { c.expNorm = Object.fromEntries(Object.entries(c.exposure).map(([k, v]) => [k, +(10 * v / EXP_MAX).toFixed(1)])); });

  /* ---------- Chart.js: tema ---------- */
  const hasChart = () => typeof window.Chart !== "undefined";
  if (hasChart()) {
    Chart.defaults.color = "#8b9ab5";
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    Chart.defaults.borderColor = "rgba(148,163,184,.12)";
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = "#1a2645";
    Chart.defaults.plugins.tooltip.borderColor = "rgba(148,163,184,.3)";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
  }
  function makeChart(canvas, cfg, registry) {
    if (!canvas) return null;
    if (!hasChart()) { canvas.parentElement.innerHTML = '<p class="hint">Gráfico no disponible (sin conexión a la librería Chart.js).</p>'; return null; }
    const ch = new Chart(canvas, cfg);
    if (registry) registry.push(ch);
    return ch;
  }
  const alpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  /* ---------- Términos del glosario dentro del texto ---------- */
  const TERM_RE = new RegExp("\\b(" + Object.keys(GLOSSARY).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b", "g");
  const linkTerms = (text) => esc(text).replace(TERM_RE, '<button type="button" class="term" data-term="$1">$1</button>');

  const tip = $("#tooltip");
  function showTip(el) {
    const def = GLOSSARY[el.dataset.term]; if (!def) return;
    tip.innerHTML = `<b>${esc(el.dataset.term)}</b> — ${esc(def)}`; tip.hidden = false;
    const r = el.getBoundingClientRect(); const tw = Math.min(320, window.innerWidth - 24);
    tip.style.left = Math.max(12, Math.min(r.left, window.innerWidth - tw - 12)) + "px";
    tip.style.top = (r.bottom + 8 + tip.offsetHeight > window.innerHeight ? r.top - tip.offsetHeight - 8 : r.bottom + 8) + "px";
  }
  document.addEventListener("mouseover", (e) => { const t = e.target.closest(".term"); if (t) showTip(t); });
  document.addEventListener("mouseout", (e) => { if (e.target.closest(".term")) tip.hidden = true; });
  document.addEventListener("click", (e) => { const t = e.target.closest(".term"); if (t) { e.stopPropagation(); showTip(t); } else tip.hidden = true; }, true);

  /* ==================== MODAL ==================== */
  const modal = $("#modal"), modalBody = $("#modal-body");
  function openModal(html, color = "#22d3ee") {
    modalBody.innerHTML = html; modalBody.style.setProperty("--c", color);
    $(".modal-card").style.setProperty("--c", color);
    hydrate(modalBody); modal.hidden = false; document.body.classList.add("lock");
    $(".modal-x").focus();
  }
  function closeModal() { modal.hidden = true; if ($("#workspace").hidden) document.body.classList.remove("lock"); }
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!modal.hidden) closeModal(); else if (!$("#workspace").hidden) closeWorkspace();
  });

  const list = (items, ico = "arrow", cls = "") => `<ul class="m-list ${cls}">${items.map((i) => `<li>${icon(ico)}<span>${linkTerms(i)}</span></li>`).join("")}</ul>`;
  const flowHtml = (steps) => `<div class="flow"><div class="flow-track"></div><div class="flow-pkt"></div>${steps.map((s) => `<div class="flow-step"><i></i>${esc(s)}</div>`).join("")}</div>`;

  function casesUsing(compKey) { return CASES.filter((c) => c.nodes.some((n) => n[3] === compKey)); }

  function componentHtml(key, ctx) {
    const c = COMPONENTS[key]; const cat = CATEGORIES[c.cat];
    const used = casesUsing(key);
    return `
      <div class="m-head"><div class="m-ico">${icon(c.icon)}</div><div><div class="kick">${cat.label}</div><h2 id="modal-title">${esc(ctx?.label || c.name)}</h2><p class="muted" style="margin:4px 0 0">${esc(ctx ? c.name + " · " + c.tagline : c.tagline)}</p></div></div>
      ${ctx ? ctx.html : ""}
      <div class="m-sec"><h3>${icon("info")} ¿Qué es?</h3><p>${linkTerms(c.what)}</p></div>
      <div class="m-sec"><h3>${icon("zap")} ¿Cómo funciona?</h3>${flowHtml(c.flow)}</div>
      <div class="m-sec"><div class="analogy">${icon("lightbulb")}<span><b>Analogía:</b> ${esc(c.analogy)}</span></div></div>
      <div class="m-two">
        <div class="m-sec"><h3>${icon("alert")} Cuando falla…</h3>${list(c.failure, "alert", "bad")}</div>
        <div class="m-sec"><h3>${icon("gauge")} Qué medir</h3><table class="metric-table">${c.metrics.map(([a, b]) => `<tr><td>${linkTerms(a)}</td><td>${linkTerms(b)}</td></tr>`).join("")}</table></div>
      </div>
      <div class="m-sec"><h3>${icon("search")} Preguntas para tu análisis</h3>${list(c.questions, "search", "q")}</div>
      ${used.length ? `<div class="m-sec"><h3>${icon("layers")} Aparece en ${used.length} casos</h3><div class="case-links">${used.map((u) => `<button class="case-link" data-open-case="${u.case_id}">${u.case_id} · ${esc(u.title)}</button>`).join("")}</div></div>` : ""}`;
  }
  function openComponent(key, ctx) { const c = COMPONENTS[key]; if (!c) return; openModal(componentHtml(key, ctx), CATEGORIES[c.cat].color); }

  document.addEventListener("click", (e) => {
    const oc = e.target.closest("[data-open-case]"); if (oc) { closeModal(); openCase(oc.dataset.openCase); return; }
    const cp = e.target.closest("[data-comp]"); if (cp && !cp.closest(".graph")) { openComponent(cp.dataset.comp); return; }
    const pt = e.target.closest("[data-pattern]"); if (pt) { openPattern(pt.dataset.pattern, pt.dataset.case); }
  });

  /* ==================== HERO ==================== */
  function renderHero() {
    const sectors = new Set(CASES.map((c) => c.sector)).size;
    const stats = [[CASES.length, "casos de estudio"], [Object.keys(COMPONENTS).length, "componentes explicados"], [Object.keys(PATTERNS).length, "alternativas en el catálogo"], [sectors, "sectores económicos"]];
    $("#hero-stats").innerHTML = stats.map(([n, l]) => `<div class="stat"><b data-count="${n}">0</b><span>${l}</span></div>`).join("");
    $$("[data-count]").forEach((el) => {
      const target = +el.dataset.count; const t0 = performance.now();
      const step = (t) => { const p = Math.min(1, (t - t0) / 1400); el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }

  /* ==================== RUTA ==================== */
  const STEPS = [
    { icon: "building", t: "Comprender el negocio", d: "¿Qué hace la organización y qué no puede dejar de funcionar?",
      obj: "Identificar procesos críticos, usuarios afectados y el impacto de una interrupción en términos de negocio (dinero, vidas, reputación, cumplimiento).",
      act: ["Lee el expediente completo del caso", "Lista los servicios críticos y sus usuarios", "Estima qué significa una hora de caída para el negocio", "Identifica las restricciones (presupuesto, regulación, sistemas que no se pueden cambiar)"],
      tool: "Pestaña «Expediente» del espacio de trabajo de cada caso.", q: "Si mañana se cae la tecnología durante 4 horas, ¿quién sufre y cuánto?" },
    { icon: "sitemap", t: "Mapear la infraestructura", d: "Dibuja qué depende de qué. Ahí se esconden los puntos únicos de falla.",
      obj: "Construir el diagrama AS-IS (situación actual) con componentes y dependencias, y detectar los SPOF.",
      act: ["Explora el grafo de dependencias", "Distingue relaciones declaradas de inferidas (líneas punteadas)", "Usa el simulador de fallas para ver cascadas", "Marca los componentes cuya falla detiene el negocio"],
      tool: "Pestaña «Arquitectura» con simulador de fallas.", q: "¿Cuál es el componente más pequeño cuya falla causa el mayor daño?" },
    { icon: "gauge", t: "Medir y diagnosticar", d: "Disponibilidad, MTTR, MTBF, capacidad. Sin evidencia no hay diagnóstico.",
      obj: "Cuantificar la situación actual y reconocer qué evidencia falta para decidir con rigor.",
      act: ["Calcula disponibilidad, MTTR y MTBF cuando haya datos", "Compara con objetivos (99 %, 99,9 %…)", "Revisa la calidad de la evidencia", "Propón cómo construir la línea base si no existe"],
      tool: "Sección «Métricas» y pestaña «Métricas» del caso.", q: "¿Qué número convencería a la gerencia de invertir?" },
    { icon: "puzzle", t: "Diseñar alternativas", d: "Al menos tres alternativas distintas, con pros, contras, costo y riesgo.",
      obj: "Formular alternativas viables y diferentes entre sí (no variaciones de la misma idea), coherentes con las restricciones.",
      act: ["Revisa las alternativas candidatas del caso", "Descarta las que no aplican y explica por qué", "Combina patrones en alternativas completas", "Considera tecnología + procesos + personas"],
      tool: "Pestaña «Alternativas» y el catálogo general.", q: "¿Qué nuevo riesgo introduce cada alternativa?" },
    { icon: "target", t: "Decidir y justificar", d: "Matriz de decisión ponderada y una recomendación defendible.",
      obj: "Comparar alternativas con criterios explícitos, recomendar una y trazar su hoja de ruta.",
      act: ["Define criterios y pesos antes de puntuar", "Califica cada alternativa con evidencia", "Analiza la sensibilidad: ¿cambia la decisión si cambias pesos?", "Propón una hoja de ruta por fases"],
      tool: "Pestaña «Matriz» del caso (se guarda en tu navegador y se exporta).", q: "Si te equivocas, ¿cuál es el costo de haber elegido esta alternativa?" },
  ];
  function renderSteps() {
    $("#steps").innerHTML = STEPS.map((s, i) => `<button class="step reveal" data-step="${i}"><span class="num">0${i + 1}</span><div class="ico-wrap">${icon(s.icon)}</div><h3>${s.t}</h3><p>${s.d}</p></button>`).join("");
    $("#steps").addEventListener("click", (e) => {
      const b = e.target.closest("[data-step]"); if (!b) return; const s = STEPS[+b.dataset.step];
      openModal(`<div class="m-head"><div class="m-ico">${icon(s.icon)}</div><div><div class="kick">Paso ${+b.dataset.step + 1} de 5</div><h2 id="modal-title">${s.t}</h2></div></div>
        <div class="m-sec"><h3>${icon("target")} Objetivo</h3><p>${linkTerms(s.obj)}</p></div>
        <div class="m-sec"><h3>${icon("check")} Actividades</h3>${list(s.act, "check")}</div>
        <div class="m-sec"><h3>${icon("compass")} Dónde trabajarlo</h3><p>${esc(s.tool)}</p></div>
        <div class="m-sec"><div class="analogy">${icon("lightbulb")}<span><b>Pregunta clave:</b> ${esc(s.q)}</span></div></div>`);
    });
  }

  /* ==================== MAPA DE REFERENCIA ==================== */
  const MAP = {
    zones: [[20, 20, 190, 635, "Usuarios y campo"], [225, 20, 190, 635, "Conectividad"], [430, 170, 750, 485, "Centro de datos"], [600, 20, 400, 135, "Nube pública"]],
    nodes: {
      users: [115, 100, null, "users", "Usuarios"], mobile: [115, 240, "mobile"], sede: [115, 380, null, "building", "Sede remota"], sensor: [115, 480, "sensor"],
      external: [320, 100, "external", null, "Internet / terceros"], vpn: [320, 240, "vpn"], wan: [320, 380, "wan"], iotgw: [320, 480, "iotgw"], edge: [320, 590, "edge"],
      firewall: [510, 270, "firewall"], lb: [650, 270, "lb"], server: [790, 270, "server"], db: [930, 270, "db"], backup: [1090, 345, "backup"],
      lan: [510, 420, "lan"], auth: [650, 420, "auth"], directory: [790, 420, "directory"], storage: [930, 420, "storage"],
      cloud: [720, 85, "cloud"], containers: [880, 85, "containers"],
    },
    links: [["users", "external"], ["external", "firewall"], ["mobile", "vpn"], ["vpn", "firewall"], ["sede", "wan"], ["wan", "firewall"], ["sensor", "iotgw"], ["iotgw", "edge"], ["iotgw", "lan"], ["edge", "wan", 1],
      ["firewall", "lb"], ["lb", "server"], ["server", "db"], ["server", "auth"], ["auth", "directory"], ["lan", "firewall"], ["db", "backup"], ["storage", "backup"], ["server", "storage"], ["firewall", "cloud", 1], ["cloud", "containers"]],
  };
  const MAP_SHORT = { external: "Internet / terceros", server: "Servidores", db: "Base de datos", firewall: "Firewall", lb: "Balanceador", lan: "Red LAN", wan: "Enlace WAN", vpn: "VPN", directory: "Directorio / DNS", auth: "Autenticación", backup: "Backup", storage: "Almacenamiento", monitoring: "Monitoreo", cloud: "Servicios cloud", containers: "Contenedores", iotgw: "Gateway IoT", sensor: "Sensores", edge: "Edge", mobile: "Móviles" };
  const curve = (x1, y1, x2, y2) => { const mx = (x1 + x2) / 2; return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`; };
  const svgIcon = (name, x, y, s = 24, color = "currentColor") => `<g transform="translate(${x - s / 2},${y - s / 2}) scale(${s / 24})" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${window.ICONS[name] || ""}</g>`;

  function renderMap() {
    const svg = $("#ref-map"); svg.setAttribute("viewBox", "0 0 1200 670");
    let h = "";
    MAP.zones.forEach(([x, y, w, hh, l]) => { h += `<g class="zone"><rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="16"/><text x="${x + 14}" y="${y + 22}">${l}</text></g>`; });
    MAP.links.forEach(([a, b, d], i) => {
      const A = MAP.nodes[a], B = MAP.nodes[b]; const p = curve(A[0], A[1], B[0], B[1]);
      const col = A[2] ? CATEGORIES[COMPONENTS[A[2]].cat].color : "#94a3b8";
      h += `<path class="link ${d ? "dashed" : ""}" d="${p}"/>`;
      h += `<circle class="packet" r="3.5" fill="${col}" style="color:${col}"><animateMotion dur="${2.6 + (i % 5) * 0.5}s" begin="${(i % 7) * 0.4}s" repeatCount="indefinite" path="${p}"/></circle>`;
    });
    // monitoreo: barra inferior con líneas de observación
    const mc = CATEGORIES.ops.color;
    ["firewall", "lan", "auth", "directory", "storage", "backup"].forEach((k) => { const N = MAP.nodes[k]; h += `<path class="link dashed" d="M${N[0]},${N[1] + 32} L${N[0]},560" style="stroke:${alpha(mc, .35)}"/>`; });
    h += `<g class="hot" data-comp="monitoring" tabindex="0" role="button" aria-label="Monitoreo y observabilidad">
      <rect x="470" y="560" width="680" height="56" rx="14" fill="${alpha(mc, .1)}" stroke="${mc}" stroke-width="1.5"/>
      ${svgIcon("monitor", 505, 588, 24, mc)}<text x="810" y="593" style="text-anchor:middle">Monitoreo y observabilidad · la capa que ve a todas las demás</text></g>`;
    for (const [k, [x, y, comp, ic, label]] of Object.entries(MAP.nodes)) {
      if (!comp) { h += `<g class="plain">${svgIcon(ic, x, y, 30, "#8b9ab5")}<text x="${x}" y="${y + 40}">${label}</text></g>`; continue; }
      const c = COMPONENTS[comp], col = CATEGORIES[c.cat].color;
      h += `<g class="hot" data-comp="${comp}" tabindex="0" role="button" aria-label="${esc(c.name)}">
        <circle class="halo pulse" cx="${x}" cy="${y}" r="32" fill="${col}" style="animation-delay:${(x + y) % 7 * .3}s"/>
        <circle class="halo" cx="${x}" cy="${y}" r="38" fill="${col}"/>
        <circle class="disc" cx="${x}" cy="${y}" r="30" stroke="${col}"/>
        ${svgIcon(c.icon, x, y, 26, col)}<text x="${x}" y="${y + 50}">${label || MAP_SHORT[comp] || c.name}</text></g>`;
    }
    svg.innerHTML = h;
    svg.addEventListener("keydown", (e) => { const g = e.target.closest(".hot"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openComponent(g.dataset.comp); } });
    $("#map-legend").innerHTML = Object.values(CATEGORIES).map((c) => `<span><i style="background:${c.color}"></i>${c.label}</span>`).join("") + `<span><i style="background:none;border:1px dashed #94a3b8"></i>Enlace híbrido / respaldo</span>`;
  }

  function renderCompGrid() {
    $("#comp-grid").innerHTML = Object.entries(COMPONENTS).map(([k, c]) => {
      const cat = CATEGORIES[c.cat];
      return `<button class="comp-card reveal" data-comp="${k}" style="--c:${cat.color}"><span class="cat">${cat.label}</span><div class="ci">${icon(c.icon)}</div><h4>${esc(c.name)}</h4><p>${esc(c.tagline)}</p></button>`;
    }).join("");
  }

  /* ==================== MÉTRICAS ==================== */
  const FORMULAS = [
    { tag: "Disponibilidad", eq: "(T − Tcaída) / T × 100", d: "Porcentaje del tiempo en que el servicio funcionó.", long: "Mide qué fracción de una ventana de tiempo el servicio estuvo operativo. Ojo: depende de cómo definas «caído» (¿también cuenta la lentitud extrema?).", ex: "Ventana 720 h, 15,8 h caído → (720 − 15,8) / 720 = 97,81 %." },
    { tag: "MTTR", eq: "Σ tiempo de recuperación / Nº incidentes", d: "Cuánto tardas, en promedio, en recuperarte.", long: "Tiempo medio de recuperación. Un MTTR alto suele indicar falta de monitoreo, procedimientos o repuestos. Para calcularlo necesitas timestamps de inicio y fin de cada incidente.", ex: "36 h de recuperación / 9 incidentes = 4 h." },
    { tag: "MTBF", eq: "Tiempo operativo / Nº fallas", d: "Cada cuánto falla, en promedio.", long: "Tiempo medio entre fallas. Un MTBF bajo sugiere problemas recurrentes (candidatos a gestión de problemas y causa raíz).", ex: "(720 − 15,8) / 9 ≈ 78,24 h." },
    { tag: "Serie", eq: "A = A₁ × A₂ × … × Aₙ", d: "Si todos deben funcionar, la disponibilidad baja.", long: "Cuando un servicio necesita que TODOS sus componentes funcionen (aplicación + BD + firewall + enlace), la disponibilidad total es el producto. Por eso muchos componentes «buenos» en serie dan un servicio mediocre.", ex: "99 % × 99 % × 99 % = 97,03 %." },
    { tag: "Paralelo", eq: "A = 1 − (1 − A₁)(1 − A₂)", d: "Si uno respalda al otro, la disponibilidad sube.", long: "Cuando hay componentes redundantes y basta con que uno funcione, la probabilidad de que fallen todos a la vez es muy baja. La condición: que las fallas sean independientes (distinta energía, ruta, proveedor…).", ex: "Dos nodos de 99 %: 1 − 0,01 × 0,01 = 99,99 %." },
    { tag: "RTO / RPO", eq: "RTO = tiempo · RPO = datos", d: "¿Cuánto tiempo y cuántos datos puedes perder?", long: "RTO: tiempo máximo para volver a operar. RPO: cantidad máxima de datos (medida en tiempo) que se puede perder. Los define el NEGOCIO, no TI; la arquitectura debe cumplirlos.", ex: "RPO de 15 min exige copias o replicación al menos cada 15 min." },
  ];
  function renderFormulas() {
    $("#formula-grid").innerHTML = FORMULAS.map((f, i) => `<button class="formula reveal" data-f="${i}"><span class="tag">${f.tag}</span><div class="eq">${f.eq}</div><p>${f.d}</p></button>`).join("");
    $("#formula-grid").addEventListener("click", (e) => {
      const b = e.target.closest("[data-f]"); if (!b) return; const f = FORMULAS[+b.dataset.f];
      openModal(`<div class="m-head"><div class="m-ico">${icon("gauge")}</div><div><div class="kick">Fórmula</div><h2 id="modal-title">${f.tag}</h2></div></div>
        <div class="m-sec"><div class="eq formula" style="cursor:default;font:600 18px var(--mono);text-align:center">${f.eq}</div></div>
        <div class="m-sec"><h3>${icon("info")} Qué significa</h3><p>${linkTerms(f.long)}</p></div>
        <div class="m-sec"><div class="analogy">${icon("lightbulb")}<span><b>Ejemplo:</b> ${esc(f.ex)}</span></div></div>`, "#a78bfa");
    });
  }

  const cls = (av) => (av >= 99.9 ? "good" : av >= 99 ? "warn" : "bad");
  function availabilityCalc() {
    const run = () => {
      const T = +$("#av-window").value || 1, D = Math.min(+$("#av-down").value || 0, T), N = Math.max(1, +$("#av-inc").value || 1);
      const av = (T - D) / T * 100;
      $("#av-out").innerHTML = [
        [fmt(av, 3) + " %", "Disponibilidad", cls(av)], [fmt(D / N, 2) + " h", "Caída media por incidente (aprox. MTTR)"],
        [fmt((T - D) / N, 2) + " h", "MTBF"], [fmt(D / T * 8760, 1) + " h", "Caída proyectada al año", cls(av)],
      ].map(([v, l, c]) => `<div class="kpi ${c || ""}"><b>${v}</b><span>${l}</span></div>`).join("");
    };
    ["#av-window", "#av-down", "#av-inc"].forEach((s) => $(s).addEventListener("input", run)); run();
  }

  function ninesCalc() {
    // Control no lineal: cada tramo (70 → 90 → 99 → 99,9 …) ocupa un espacio similar del deslizador.
    const U_MAX = 30, U_MIN = 0.001; // indisponibilidad en %
    const posToAv = (pos) => 100 - U_MAX * Math.pow(U_MIN / U_MAX, pos / 100);
    const avToPos = (av) => 100 * Math.log((100 - av) / U_MAX) / Math.log(U_MIN / U_MAX);
    const PRESETS = [70, 90, 95, 99, 99.9, 99.99, 99.999];
    const levels = PRESETS;
    makeChart($("#chart-nines"), {
      type: "bar",
      data: { labels: levels.map((l) => fmt(l, 3) + " %"), datasets: [{ label: "Caída permitida al año", data: levels.map((l) => +((100 - l) / 100 * 8760).toFixed(3)), backgroundColor: levels.map((_, i) => alpha(["#f43f5e", "#fb7185", "#fb923c", "#fbbf24", "#a3e635", "#34d399", "#22d3ee"][i], .75)), borderRadius: 6 }] },
      options: { maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => " " + dur(c.raw) + " al año" } } }, scales: { x: { type: "logarithmic", title: { display: true, text: "horas de caída al año (escala logarítmica)" } } } },
    });
    function dur(h) {
      if (h >= 48) return fmt(h / 24, 1) + " días";
      if (h >= 1) return fmt(h, 1) + " h";
      if (h * 60 >= 1) return fmt(h * 60, 1) + " min";
      return fmt(h * 3600, 0) + " s";
    }
    $("#nines-presets").innerHTML = PRESETS.map((p) => `<button class="chip" data-av="${p}">${fmt(p, 3)} %</button>`).join("");
    const run = () => {
      const raw = posToAv(+$("#nines").value);
      const near = PRESETS.find((p) => Math.abs(avToPos(p) - +$("#nines").value) < 0.6);
      const v = near ?? +raw.toFixed(raw > 99.9 ? 3 : raw > 99 ? 2 : 1);
      $("#nines").dataset.av = v;
      $("#nines-val").textContent = fmt(v, 3);
      $$("#nines-presets .chip").forEach((c) => c.classList.toggle("on", +c.dataset.av === v));
      const u = (100 - v) / 100;
      $("#nines-out").innerHTML = [[dur(u * 8760), "por año"], [dur(u * 730), "por mes"], [dur(u * 168), "por semana"], [dur(u * 24), "por día"]].map(([x, y]) => `<div class="kpi ${cls(v)}"><b>${x}</b><span>de caída ${y}</span></div>`).join("");
      const every = u >= 0.01 ? ` Es como si el servicio fallara <b>1 de cada ${fmt(Math.round(1 / u))} días</b>.` : "";
      const ctx = v < 99 ? " Para un servicio crítico 24/7 suele ser inaceptable." : v < 99.9 ? " Aceptable para muchos servicios internos; corto para servicios críticos 24/7." : v < 99.99 ? " Nivel típico de servicios críticos bien gestionados." : " Exige redundancia alta y procesos maduros: cada nueve adicional cuesta mucho más.";
      $("#nines-say").innerHTML = `Con <b>${fmt(v, 3)} %</b> de disponibilidad, el servicio podría estar caído <b>${dur(u * 8760)} al año</b> (${dur(u * 730)} al mes).${every}${ctx}`;
    };
    $("#nines").addEventListener("input", run);
    $("#nines-presets").addEventListener("click", (e) => { const b = e.target.closest("[data-av]"); if (!b) return; $("#nines").value = avToPos(+b.dataset.av).toFixed(1); run(); });
    $("#nines").value = avToPos(99.9).toFixed(1); run();
  }

  /* ---- Laboratorio serie / paralelo con pesos por servicio ---- */
  // Disponibilidades de referencia (supuestos didácticos, el estudiante debe ajustarlos).
  const REF_AV = { server: 99.5, db: 99.5, firewall: 99.9, lb: 99.95, lan: 99.9, wan: 99.0, vpn: 99.0, directory: 99.5, auth: 99.5, backup: 99.0, storage: 99.9, monitoring: 99.0, cloud: 99.95, containers: 99.9, iotgw: 99.0, sensor: 98.5, edge: 99.0, mobile: 98.0, external: 99.5 };
  const CRIT = [[5, "Crítica"], [4, "Alta"], [3, "Media"], [2, "Baja"], [1, "Mínima"]];
  const critWeight = (label) => ({ "crítica": 5, "muy alta": 5, alta: 4, media: 3, baja: 2 }[String(label).toLowerCase()] || 3);
  const serverType = (name, func) => { const n = (name + " " + func).toUpperCase(); return /^DB|BASE DE DATOS/.test(n) ? "db" : /^AD-|DIRECTORIO|ACTIVE DIRECTORY/.test(n) ? "directory" : /^AUTH|AUTENTICA/.test(n) ? "auth" : /^FILE|ARCHIVOS/.test(n) ? "storage" : "server"; };
  const GENERIC_CHAIN = [{ asset: "g:firewall", a: 99.9, r: 1, w: 3 }, { asset: "g:server", a: 99.5, r: 1, w: 3 }, { asset: "g:db", a: 99.5, r: 1, w: 3 }];
  const INST_ASSET = "inst";
  let chain = [];
  const lab = { caseId: "", service: 0 };

  function labAssets(caseId) {
    const own = caseId ? byId[caseId].data.servers.map((s) => ({ id: "s:" + s[0], label: `${s[0]} — ${s[1]}`, type: serverType(s[0], s[1]) })) : [];
    const gen = Object.entries(COMPONENTS).map(([k, c]) => ({ id: "g:" + k, label: c.name, type: k }));
    return { own, gen, all: [...own, ...gen] };
  }
  const labKey = () => `lab:${lab.caseId || "generic"}:${lab.service}`;

  function chainLab() {
    const selCase = $("#lab-case"), selSrv = $("#lab-service"), selW = $("#lab-weight");
    selCase.innerHTML = `<option value="">Ejemplo genérico</option>` + CASES.map((c) => `<option value="${c.case_id}">${c.case_id} · ${esc(c.data.org)}</option>`).join("");
    selW.innerHTML = CRIT.map(([v, l]) => `<option value="${v}">${v} · ${l}</option>`).join("");
    let riskChart = null;

    const loadService = () => {
      const saved = store.get(labKey(), null);
      const srv = lab.caseId ? window.CASE_SERVICES[lab.caseId].rows[lab.service] : null;
      chain = saved?.chain || (lab.caseId ? [] : GENERIC_CHAIN.map((x) => ({ ...x })));
      selW.value = saved?.w || (srv ? critWeight(srv[3]) : 3);
      $("#lab-note").innerHTML = srv
        ? `Servicio <b>${esc(srv[0])}</b> · usuarios: ${esc(srv[1])} · operación: ${esc(srv[2])} · criticidad informada por TI: <span class="pill ${critWeight(srv[3]) >= 5 ? "red" : critWeight(srv[3]) >= 4 ? "amber" : ""}">${esc(srv[3])}</span>${chain.length ? "" : " — <b>agrega los componentes de los que depende este servicio.</b>"}`
        : "Modo genérico: cadena de ejemplo con tres componentes.";
      if (lab.caseId && lab.caseId === tw.cid && tw.on) $("#lab-note").innerHTML += `<br><span class="tw-ed" data-twed="lab.${lab.service}">${twBadgeInner("lab." + lab.service)}</span>`;
      draw();
    };
    const fillServices = () => {
      selSrv.disabled = !lab.caseId;
      selSrv.innerHTML = lab.caseId ? window.CASE_SERVICES[lab.caseId].rows.map((r, i) => `<option value="${i}">${esc(r[0])} (${esc(r[3])})</option>`).join("") : `<option>—</option>`;
      lab.service = 0; loadService();
    };
    const save = () => store.set(labKey(), { chain, w: +selW.value });
    // La instalación (energía, enfriamiento) es un eslabón más de la cadena en serie. Ningún caso da su disponibilidad:
    // el equipo la escribe como supuesto. Mientras no la escriba, no entra en el cálculo.
    const isInst = (c) => c.asset === INST_ASSET;
    const eff = (c) => (isInst(c) && !(c.a > 0) ? 1 : 1 - Math.pow(1 - c.a / 100, c.r));
    const assetLabel = (id) => (id === INST_ASSET ? "Instalación (supuesto)" : labAssets(lab.caseId).all.find((a) => a.id === id)?.label || "Componente");

    const calc = () => {
      $$("#chain [data-i] .av").forEach((el) => { const c = chain[+el.closest("[data-i]").dataset.i]; el.textContent = isInst(c) && !(c.a > 0) ? "Aún no entra en el cálculo: escribe tu supuesto" : "Efectiva: " + fmt(eff(c) * 100, 4) + " %"; });
      const sw = +selW.value;
      if (!chain.length) { $("#chain-out").innerHTML = ""; if (riskChart) { riskChart.data.labels = []; riskChart.data.datasets[0].data = []; riskChart.update(); } return; }
      const total = chain.reduce((a, c) => a * eff(c), 1) * 100;
      const risks = chain.map((c) => ({ n: assetLabel(c.asset).split(" — ")[0], v: +(sw * c.w * (1 - eff(c)) * 8760).toFixed(1) }));
      const top = risks.reduce((m, r) => (r.v > m.v ? r : m), risks[0]);
      $("#chain-out").innerHTML = [[fmt(total, 4) + " %", "Disponibilidad del servicio", cls(total)], [fmt((1 - total / 100) * 8760, 1) + " h", "Caída esperada al año", cls(total)], [esc(top.n), "Mayor riesgo ponderado"], [fmt(risks.reduce((s, r) => s + r.v, 0), 0), "Índice de riesgo total"]]
        .map(([v, l, c]) => `<div class="kpi ${c || ""}"><b>${v}</b><span>${l}</span></div>`).join("");
      const sorted = [...risks].sort((a, b) => b.v - a.v);
      const data = { labels: sorted.map((r) => r.n), datasets: [{ label: "Índice de riesgo ponderado", data: sorted.map((r) => r.v), backgroundColor: sorted.map((_, i) => alpha(i === 0 ? "#f43f5e" : "#38bdf8", .75)), borderRadius: 6 }] };
      if (riskChart) { riskChart.data = data; riskChart.update(); }
      else riskChart = makeChart($("#chart-risk"), { type: "bar", data, options: { maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: "horas ponderadas / año" } } } } });
    };
    const draw = () => {
      const { own, gen } = labAssets(lab.caseId);
      const opts = (sel) => (own.length ? `<optgroup label="Activos de la organización">${own.map((a) => `<option value="${a.id}" ${a.id === sel ? "selected" : ""}>${esc(a.label)}</option>`).join("")}</optgroup>` : "") +
        `<optgroup label="Componentes genéricos">${gen.map((a) => `<option value="${a.id}" ${a.id === sel ? "selected" : ""}>${esc(a.label)}</option>`).join("")}</optgroup>`;
      $("#chain").innerHTML = `<div class="chain-node chain-user">${icon("users")}<span class="muted" style="font-size:12px">Usuario del servicio</span></div>` +
        chain.map((c, i) => isInst(c) ? `<div class="link-arrow"></div><div class="chain-node chain-inst" data-i="${i}">
          <header><span class="muted" style="font:600 11px var(--mono)">INSTALACIÓN</span><button class="rm" data-rm="${i}" title="Quitar">×</button></header>
          <p class="inst-tag">Supuesto, no dato del caso</p>
          <p class="inst-note">Energía, enfriamiento y rutas del sitio que aloja los equipos. Si la instalación cae, cae todo lo que está dentro.</p>
          <label>Disponibilidad que supones (%)<input type="number" step="0.001" min="50" max="99.999" value="${c.a ?? ""}" placeholder="escribe tu supuesto" data-k="a"></label>
          <label>Criticidad para el servicio<select data-k="w">${CRIT.map(([v, l]) => `<option value="${v}" ${c.w === v ? "selected" : ""}>${v} · ${l}</option>`).join("")}</select></label>
          <p class="inst-ref">Referencias que suelen citarse: 99,671 · 99,741 · 99,982 · 99,995 %. Son valores citados comúnmente, no una medida oficial de Uptime Institute; el Tier certifica el diseño del sitio, no garantiza un porcentaje.</p>
          <div class="av" style="margin-top:8px"></div></div>` : `<div class="link-arrow"></div><div class="chain-node" data-i="${i}">
          <header><span class="muted" style="font:600 11px var(--mono)">COMPONENTE ${i + 1}</span><button class="rm" data-rm="${i}" title="Quitar">×</button></header>
          <label>Activo / componente<select data-k="asset">${opts(c.asset)}</select></label>
          <label>Disponibilidad de cada nodo (%)<input type="number" step="0.01" min="50" max="99.999" value="${c.a}" data-k="a"></label>
          <label>Criticidad para el servicio<select data-k="w">${CRIT.map(([v, l]) => `<option value="${v}" ${c.w === v ? "selected" : ""}>${v} · ${l}</option>`).join("")}</select></label>
          <div class="rep" title="Copias redundantes del mismo componente: basta con que una funcione">En paralelo (redundancia): <button data-d="-1" aria-label="Quitar copia">−</button><b>${c.r}</b><button data-d="1" aria-label="Agregar copia">+</button></div>
          <div class="copies">${"<i></i>".repeat(c.r)}</div>
          <div class="av" style="margin-top:8px"></div></div>`).join("") +
        (chain.length ? "" : `<div class="link-arrow"></div><button class="chain-node chain-empty" id="chain-add-inline">+ Agrega el primer componente</button>`);
      calc();
    };
    const addComp = () => {
      if (chain.length >= 8) return toast("Máximo 8 componentes");
      const { own } = labAssets(lab.caseId); const first = own[0] || { id: "g:server", type: "server" };
      chain.push({ asset: first.id, a: REF_AV[first.type] || 99, r: 1, w: 3 }); save(); draw();
    };

    selCase.addEventListener("change", () => { lab.caseId = selCase.value; fillServices(); });
    selSrv.addEventListener("change", () => { lab.service = +selSrv.value; loadService(); });
    selW.addEventListener("change", () => { save(); calc(); });
    $("#chain").addEventListener("input", (e) => {
      const n = e.target.closest("[data-i]"); if (!n) return; const c = chain[+n.dataset.i];
      if (e.target.dataset.k === "a") { c.a = isInst(c) && e.target.value === "" ? null : Math.min(99.999, Math.max(50, +e.target.value || 50)); save(); calc(); }
    });
    $("#chain").addEventListener("change", (e) => {
      const n = e.target.closest("[data-i]"); if (!n) return; const c = chain[+n.dataset.i];
      if (e.target.dataset.k === "asset") { c.asset = e.target.value; const t = labAssets(lab.caseId).all.find((a) => a.id === c.asset)?.type; c.a = REF_AV[t] || 99; save(); draw(); }
      if (e.target.dataset.k === "w") { c.w = +e.target.value; save(); calc(); }
    });
    $("#chain").addEventListener("click", (e) => {
      if (e.target.closest("#chain-add-inline")) return addComp();
      const rm = e.target.closest("[data-rm]"); if (rm) { chain.splice(+rm.dataset.rm, 1); save(); draw(); return; }
      const d = e.target.closest("[data-d]"); if (d) { const c = chain[+d.closest("[data-i]").dataset.i]; c.r = Math.max(1, Math.min(4, c.r + +d.dataset.d)); save(); draw(); }
    });
    $("#chain-add").addEventListener("click", addComp);
    $("#chain-inst")?.addEventListener("click", () => {
      if (chain.some(isInst)) return toast("La instalación ya está en la cadena");
      if (chain.length >= 8) return toast("Máximo 8 componentes");
      chain.push({ asset: INST_ASSET, a: null, r: 1, w: 5 }); save(); draw();
    });
    $("#chain-reset").addEventListener("click", () => { chain = []; save(); loadService(); });
    window.addEventListener("infralab:work", (ev) => {
      const f = document.activeElement; if (lab.caseId !== ev.detail.cid || (f && f.closest(".lab-wide") && /INPUT|SELECT/.test(f.tagName))) return;
      loadService();
    });
    window.__lab = () => ({ caseId: lab.caseId, service: lab.service, serviceName: lab.caseId ? window.CASE_SERVICES[lab.caseId].rows[lab.service][0] : "", chain });
    window.__labOpen = (caseId) => { selCase.value = caseId; lab.caseId = caseId; fillServices(); $("#metricas .lab-wide").scrollIntoView({ behavior: "smooth", block: "start" }); };
    fillServices();
  }
  // Cadenas guardadas de un caso (para exportar y para el tutor IA).
  function labChainsFor(caseId) {
    const rows = window.CASE_SERVICES[caseId]?.rows || [];
    const assets = labAssets(caseId).all;
    return rows.map((r, i) => ({ r, s: store.get(`lab:${caseId}:${i}`, null) })).filter((x) => x.s && x.s.chain.length).map(({ r, s }) => ({
      servicio: r[0], criticidad_informada: r[3], importancia_asignada: s.w,
      componentes: s.chain.map((c) => ({ activo: c.asset === INST_ASSET ? "Instalación (supuesto del equipo, no dato del caso)" : assets.find((a) => a.id === c.asset)?.label || c.asset, disponibilidad: c.a, copias: c.r, criticidad: c.w })),
      disponibilidad_calculada: +(s.chain.reduce((a, c) => a * (c.asset === INST_ASSET && !(c.a > 0) ? 1 : 1 - Math.pow(1 - c.a / 100, c.r)), 1) * 100).toFixed(4),
    }));
  }

  /* ==================== CASOS ==================== */
  let sectorFilter = "Todos";
  const qProgress = (c) => { const s = store.get(c.case_id + ":q", {}); const done = Object.values(s).filter((x) => x && x.done).length; return Math.round(done / c.questions.length * 100); };

  function renderCases() {
    const sectors = ["Todos", ...new Set(CASES.map((c) => c.sector))];
    $("#sector-chips").innerHTML = sectors.map((s) => `<button class="chip ${s === sectorFilter ? "on" : ""}" data-sector="${esc(s)}">${esc(s)}</button>`).join("");
    const q = ($("#case-search").value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const items = CASES.filter((c) => (sectorFilter === "Todos" || c.sector === sectorFilter) &&
      (!q || [c.title, c.case_name, c.data.org, c.sector, c.challenge_type, c.description, ...c.nodes.map((n) => n[1])].join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)));
    $("#case-grid").innerHTML = items.map((c) => {
      const spof = c.nodes.filter((n) => n[4]).length; const prog = qProgress(c);
      return `<button class="case-card reveal in" data-open-case="${c.case_id}" style="--c:${c.color}">
        <div class="case-top"><div class="case-ico">${icon(c.icon)}</div><span class="case-id">${c.case_id}</span></div>
        <div><div class="case-sector">${esc(c.sector)}</div><h3>${esc(c.title)}</h3>${c.data.org !== c.title ? `<div class="case-org">${esc(c.data.org)}</div>` : ""}</div>
        <p>${esc(c.description)}</p>
        <div class="case-meta">
          ${spof ? `<span class="pill red">${spof} SPOF declarados</span>` : `<span class="pill amber">SPOF por descubrir</span>`}
          ${teamCase() === c.case_id ? `<span class="pill green">${icon("users")} Caso de tu equipo</span>` : ""}
          <span class="pill">${c.nodes.length} nodos</span>
          <span class="pill green">${c.data.incidents.length} incidentes · ${c.data.servers.length} servidores</span>
        </div>
        <div class="case-progress" title="Avance en preguntas guía"><i style="width:${prog}%"></i></div>
        <div class="case-cta"><span>${prog}% preguntas respondidas</span><b>Abrir caso ${icon("arrow")}</b></div></button>`;
    }).join("") || `<p class="muted">No hay casos que coincidan con la búsqueda.</p>`;
  }
  function casesEvents() {
    $("#sector-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-sector]"); if (b) { sectorFilter = b.dataset.sector; renderCases(); } });
    $("#case-search").addEventListener("input", renderCases);
  }

  const SPOF_SHORT = { bd: "BD nodo único", app: "App única", fw: "Firewall único", wan: "WAN/VPN único", gw: "Gateway IoT", auth: "Autenticación", central: "Servicio central", lb: "Balanceador", prov: "Proveedor único", region: "Región única", bkp: "Backup mismo sitio", human: "Una persona" };
  function renderHeatmaps() {
    const spofKeys = Object.keys(SPOF_TYPES);
    $("#heat-spof").innerHTML = `<thead><tr><th></th>${spofKeys.map((k) => `<th class="rot" title="${esc(SPOF_TYPES[k])}"><div>${esc(SPOF_SHORT[k] || SPOF_TYPES[k])}</div></th>`).join("")}</tr></thead><tbody>` +
      CASES.map((c) => `<tr class="row" data-open-case="${c.case_id}"><td class="name">${c.case_id} · ${esc(c.title)}</td>${spofKeys.map((k) => (c.spofPatterns.length ? `<td class="${c.spofPatterns.includes(k) ? "on" : ""}" title="${esc(c.case_id + " · " + SPOF_TYPES[k] + (c.spofPatterns.includes(k) ? ": con evidencia en el caso" : ": no evidenciado (verifícalo en el inventario)"))}"></td>` : `<td class="q">?</td>`)).join("")}</tr>`).join("") + "</tbody>";
    const lab = { c: "Completa", p: "Parcial", f: "Faltante", n: "No reportada" };
    $("#heat-evidence").innerHTML = `<thead><tr><th></th>${EVIDENCE_DOMAINS.map((d) => `<th class="rot"><div>${d}</div></th>`).join("")}</tr></thead><tbody>` +
      CASES.map((c) => `<tr class="row" data-open-case="${c.case_id}"><td class="name">${c.case_id} · ${esc(c.title)}</td>${EVIDENCE_DOMAINS.map((d) => { const v = c.evidence[d]; return `<td class="ev-${v}" title="${d}: ${lab[v]}">${v === "n" ? "·" : ""}</td>`; }).join("")}</tr>`).join("") + "</tbody>";
    $("#evidence-legend").innerHTML = [["#34d399", "Completa"], ["#fbbf24", "Parcial"], ["#f43f5e", "Faltante"]].map(([c, l]) => `<span><i style="background:${c};border-radius:3px"></i>${l}</span>`).join("");
  }

  function renderExposureChart() {
    const dims = Object.keys(EXPOSURE);
    const colors = ["#34d399", "#fb7185", "#38bdf8", "#22d3ee", "#facc15", "#a78bfa"];
    makeChart($("#chart-exposure"), {
      type: "bar",
      data: { labels: CASES.map((c) => c.case_id), datasets: dims.map((d, i) => ({ label: d, data: CASES.map((c) => c.exposure[d]), backgroundColor: alpha(colors[i], .8), borderRadius: 3 })) },
      options: { maintainAspectRatio: false, plugins: { tooltip: { callbacks: { title: (it) => { const c = CASES[it[0].dataIndex]; return `${c.case_id} · ${c.title}`; } } } }, scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: "señales en el expediente" } } },
        onClick: (_, el) => { if (el.length) openCase(CASES[el[0].index].case_id); } },
    });
  }

  /* ==================== ALTERNATIVAS ==================== */
  let patFilter = "Todas";
  const meter = (n, max = 5) => `<span class="meter">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? "f" : ""}"></i>`).join("")}</span>`;
  const patCard = (k, caseId = "") => {
    const p = PATTERNS[k]; const c = PATTERN_CATS[p.cat].color;
    return `<button class="pat reveal in" data-pattern="${k}" ${caseId ? `data-case="${caseId}"` : ""} style="--c:${c}">
      <h4>${icon(p.icon)}<span>${esc(p.name)}</span></h4><p>${esc(p.idea)}</p>
      <div class="bars"><span>Costo</span>${meter(p.cost)}<span>Complejidad</span>${meter(p.complexity)}</div>
      <div class="case-meta"><span class="pill">${PATTERN_CATS[p.cat].label}</span><span class="pill">Plazo: ${p.time}</span></div></button>`;
  };
  function renderPatterns() {
    const cats = ["Todas", ...Object.values(PATTERN_CATS).map((c) => c.label)];
    $("#pattern-chips").innerHTML = cats.map((c) => `<button class="chip ${c === patFilter ? "on" : ""}" data-pcat="${c}">${c}</button>`).join("");
    $("#pattern-grid").innerHTML = Object.keys(PATTERNS).filter((k) => patFilter === "Todas" || PATTERN_CATS[PATTERNS[k].cat].label === patFilter).map((k) => patCard(k)).join("");
  }
  function patternsChart() {
    const keys = Object.keys(PATTERNS); const seen = {};
    const ds = Object.entries(PATTERN_CATS).map(([ck, cat]) => ({
      label: cat.label, backgroundColor: alpha(cat.color, .55), borderColor: cat.color,
      data: keys.filter((k) => PATTERNS[k].cat === ck).map((k) => {
        const p = PATTERNS[k]; const key = p.cost + "-" + p.complexity; const n = (seen[key] = (seen[key] || 0) + 1) - 1;
        const ang = n * 2.1; const off = n ? 0.18 : 0;
        return { x: p.cost + Math.cos(ang) * off, y: p.complexity + Math.sin(ang) * off, r: 9, k };
      }),
    }));
    makeChart($("#chart-patterns"), {
      type: "bubble", data: { datasets: ds },
      options: { maintainAspectRatio: false,
        scales: { x: { min: 0.3, max: 5.7, title: { display: true, text: "Costo relativo →" }, ticks: { stepSize: 1 } }, y: { min: 0.3, max: 5.7, title: { display: true, text: "Complejidad →" }, ticks: { stepSize: 1 } } },
        plugins: { tooltip: { callbacks: { label: (c) => " " + PATTERNS[c.raw.k].name } } },
        onClick: (_, el) => { if (el.length) { const d = el[0]; openPattern(ds[d.datasetIndex].data[d.index].k); } } },
    });
  }
  function openPattern(k, caseId) {
    const p = PATTERNS[k]; const color = PATTERN_CATS[p.cat].color;
    const inCases = CASES.filter((c) => c.alternatives.includes(k));
    const sel = caseId ? (store.get(caseId + ":matrix", null)?.alts || []).some((a) => a.id === k) : false;
    openModal(`<div class="m-head"><div class="m-ico">${icon(p.icon)}</div><div><div class="kick">Alternativa · ${PATTERN_CATS[p.cat].label}</div><h2 id="modal-title">${esc(p.name)}</h2></div></div>
      <div class="m-sec"><p>${linkTerms(p.idea)}</p></div>
      <div class="m-sec"><div class="kpi-row"><div class="kpi"><b>${meter(p.cost)}</b><span>Costo relativo (${p.cost}/5)</span></div><div class="kpi"><b>${meter(p.complexity)}</b><span>Complejidad (${p.complexity}/5)</span></div><div class="kpi"><b>${p.time}</b><span>Plazo típico</span></div></div></div>
      <div class="m-two"><div class="m-sec"><h3>${icon("check")} A favor</h3>${list(p.pros, "check")}</div><div class="m-sec"><h3>${icon("alert")} En contra / riesgos nuevos</h3>${list(p.cons, "alert", "bad")}</div></div>
      <div class="m-sec"><h3>${icon("search")} Preguntas críticas antes de elegirla</h3>${list(p.questions, "search", "q")}</div>
      <div class="m-sec"><div class="notice info">${icon("info")}<span>Esta ficha no dice si la alternativa es correcta para un caso. Eso lo decides tú con la evidencia del expediente.</span></div></div>
      ${caseId ? `<div class="row-actions"><button class="btn btn-primary" data-add-alt="${k}" data-case="${caseId}">${sel ? "Ya está en tu matriz ✓" : "Agregar a mi matriz de decisión"}</button></div>` : ""}
      ${inCases.length ? `<div class="m-sec"><h3>${icon("layers")} Candidata en ${inCases.length} casos</h3><div class="case-links">${inCases.map((u) => `<button class="case-link" data-open-case="${u.case_id}">${u.case_id} · ${esc(u.title)}</button>`).join("")}</div></div>` : ""}`, color);
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-add-alt]"); if (!b) return;
    const ok = addAlt(b.dataset.case, b.dataset.addAlt, PATTERNS[b.dataset.addAlt].name);
    b.textContent = ok ? "Agregada a tu matriz ✓" : "Máximo 4 alternativas (o ya estaba)";
    if (ok) toast("Alternativa agregada a la matriz");
    if (currentCase && currentTab === "alternativas") renderTab();
  });

    /* ==================== TALLER GUIADO ==================== */
  let guideStep = store.get("guide:step", 0);
  function renderGuide() {
    const G = window.GUIDE; if (!G) return;
    const st = (id) => store.get("guide:" + id, { notes: "", checks: {}, shown: false });
    const doneCount = (s) => Object.values(st(s.id).checks).filter(Boolean).length;
    $("#guide-how").innerHTML = G.how.map((h, i) => `<div class="gh"><b>${i + 1}</b><span>${esc(h)}</span></div>`).join("");
    const TK = Object.fromEntries((G.toolkit || []).map((t) => [t.id, t]));
    renderTourCards();
    $("#guide-tools").innerHTML = (G.toolkit || []).map((t) => `<a class="gt" href="${t.anchor}"><b>${esc(t.name)}</b><span>${esc(t.what)}</span>
      <em>${esc(t.use)}</em><small>Etapas: ${t.steps.length === G.steps.length ? "todas" : t.steps.join(" · ")}</small></a>`).join("");
    const draw = () => {
      const s = G.steps[guideStep], c = byId[s.case_id], data = st(s.id);
      $("#guide-steps").innerHTML = G.steps.map((x, i) => { const cc = byId[x.case_id]; const full = doneCount(x) === x.checks.length;
        return `<button class="gstep ${i === guideStep ? "on" : ""} ${full ? "full" : ""}" data-gstep="${i}" style="--c:${cc.color}">
          <span class="gnum">${full ? icon("check") : x.id}</span><span class="gtxt"><b>${esc(x.title)}</b><small>${esc(cc.case_id)} · ${esc(cc.data.org)}</small></span></button>`; }).join("");
      $("#guide-detail").innerHTML = `
        <div class="gd-head" style="--c:${c.color}">
          <div><div class="kick" style="color:${c.color}">Etapa ${s.id} de ${G.steps.length}</div><h3>${esc(s.title)}</h3>
            <p class="muted">En el sitio: ${esc(s.tab)}</p></div>
          <button class="gd-case" data-open-case="${c.case_id}" style="--c:${c.color}"><span class="case-ico">${icon(c.icon)}</span><span><small>Caso de ejemplo</small><b>${esc(c.case_id)} · ${esc(c.data.org)}</b></span></button>
        </div>
        ${(s.tours || []).length ? `<div class="gd-block gd-tours"><h5>${icon("flask")} Ejercicios guiados de esta etapa</h5><p class="muted" style="margin:0 0 8px">Empieza por aquí: familiarízate con la plataforma; el sitio te lleva clic a clic y luego aplicas lo mismo a tu caso.</p>
              <div class="gd-tour-btns">${s.tours.map((id) => tourById[id] ? `<a class="btn btn-sm btn-primary" href="#guia/${id}">${icon("arrow")} ${esc(tourById[id].title)}</a>` : "").join("")}</div></div>` : ""}
        <div class="gd-grid">
          <div class="gd-col">
            <div class="gd-block"><h5>${icon("target")} Para qué sirve</h5><p>${esc(s.purpose)}</p><p class="gd-disc">${icon("lightbulb")}<span><b>Lo que vas a descubrir:</b> ${esc(s.discover)}</span></p></div>
            <div class="gd-block"><h5>${icon("check")} Qué haces</h5>${list(s.activities, "arrow")}</div>
            <div class="gd-block"><h5>${icon("check")} Autoverificación <span class="pill">${doneCount(s)}/${s.checks.length}</span></h5>
              <ul class="gd-checks">${s.checks.map((k, i) => `<li><label><input type="checkbox" data-gcheck="${i}" ${data.checks[i] ? "checked" : ""}><span>${esc(k)}</span></label></li>`).join("")}</ul></div>
          </div>
          <div class="gd-col">
            <div class="gd-block attempt-block"><h5>${icon("alert")} Detecta los errores · intento de un equipo</h5>
              <div class="gd-attempt">${s.attempt.map((l) => `<p>${esc(l)}</p>`).join("")}</div>
              <p class="hint">Este intento contiene <b>${s.errors.length} errores</b>. Escribe los que encuentres <b>antes</b> de revelarlos.</p>
              <textarea data-gnotes placeholder="Errores que encontramos…">${esc(data.notes)}</textarea>
              <button class="btn btn-sm ${data.shown ? "btn-ghost" : ""}" data-greveal>${data.shown ? "Ocultar errores" : `Ver los ${s.errors.length} errores`}</button>
              ${data.shown ? `<ol class="gd-errors">${s.errors.map((e) => `<li><b>${esc(e.e)}</b><span>${esc(e.why)}</span></li>`).join("")}</ol>` : ""}</div>
            ${(s.tools || []).length ? `<div class="gd-block gd-tools"><h5>${icon("layers")} Herramientas del sitio para esta etapa</h5>
              ${s.tools.map((t) => { const tk = TK[t.tool] || {}; return `<div class="gd-tool"><a class="btn btn-sm" href="${tk.anchor}">${esc(tk.name || t.tool)} →</a>
                <p>${esc(t.do)}</p><p class="gd-trap">${icon("alert")}<span><b>Trampa:</b> ${esc(t.trap)}</span></p></div>`; }).join("")}</div>` : ""}
            <div class="gd-block"><h5>${icon("file")} Tu turno · hoja de trabajo</h5>
              <p class="muted" style="margin:0 0 8px">Aplica la etapa a <b>tu</b> caso en el documento descargable:</p>
              <div class="heat-scroll"><table class="rubric gd-ws"><thead><tr>${s.worksheet.cols.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody><tr>${s.worksheet.cols.map(() => "<td></td>").join("")}</tr></tbody></table></div></div>
          </div>
        </div>
        <div class="step-nav">${guideStep > 0 ? `<button class="btn btn-sm btn-ghost" data-gstep="${guideStep - 1}">← ${esc(G.steps[guideStep - 1].title)}</button>` : "<span></span>"}
          ${guideStep < G.steps.length - 1 ? `<button class="btn btn-sm btn-primary" data-gstep="${guideStep + 1}">${esc(G.steps[guideStep + 1].title)} →</button>` : `<a class="btn btn-sm btn-primary" href="#casos">Ir a mi caso →</a>`}</div>`;
    };
    const sec = $("#taller");
    sec.addEventListener("click", (e) => {
      const b = e.target.closest("[data-gstep]"); if (b) { guideStep = +b.dataset.gstep; store.set("guide:step", guideStep); draw(); $("#guide-detail").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      if (e.target.closest("[data-greveal]")) { const s = G.steps[guideStep]; const d = st(s.id); d.shown = !d.shown; store.set("guide:" + s.id, d); draw(); }
    });
    sec.addEventListener("change", (e) => { const i = e.target.dataset.gcheck; if (i === undefined) return; const s = G.steps[guideStep]; const d = st(s.id); d.checks[i] = e.target.checked; store.set("guide:" + s.id, d); draw(); });
    sec.addEventListener("input", (e) => { if (!("gnotes" in e.target.dataset)) return; const s = G.steps[guideStep]; const d = st(s.id); d.notes = e.target.value; store.set("guide:" + s.id, d); });
    draw();
  }

  /* ==================== ESPACIO DE TRABAJO DEL CASO ==================== */
  const TABS = [["expediente", "book", "Expediente"], ["inventario", "server", "Inventario"], ["arquitectura", "sitemap", "Arquitectura"], ["metricas", "gauge", "Métricas"], ["incidentes", "alert", "Incidentes"], ["bmm", "compass", "BMM"], ["retos", "target", "Retos"], ["alternativas", "puzzle", "Alternativas"], ["matriz", "chart", "Matriz de decisión"], ["tutor", "zap", "Tutor IA"]];
  let currentCase = null, currentTab = "expediente", wsCharts = [];
  const ws = $("#workspace");

  function openCase(id, tab) {
    const c = byId[id]; if (!c) return;
    store.set("lastcase", id);
    currentCase = c; currentTab = tab || "expediente";
    $(".ws-card").style.setProperty("--c", c.color);
    $("#ws-head").style.setProperty("--c", c.color);
    $("#ws-head").innerHTML = `<div class="case-ico" style="--c:${c.color}">${icon(c.icon)}</div>
      <div class="ws-title"><div class="case-sector" style="color:${c.color}">${c.case_id} · ${esc(c.sector)}</div><h2>${esc(c.title)}${c.data.org !== c.title ? ` <span class="ws-org">· ${esc(c.data.org)}</span>` : ""}</h2><p>${esc(c.challenge_type)}</p></div>
      <div class="ws-actions"><button class="icon-btn" id="ws-prev" title="Caso anterior">‹</button><button class="icon-btn" id="ws-next" title="Caso siguiente">›</button><button class="icon-btn" id="ws-close" title="Cerrar (Esc)">${icon("x")}</button></div>`;
    $("#ws-tabs").innerHTML = TABS.map(([k, ic, l]) => `<button class="ws-tab ${k === currentTab ? "on" : ""}" data-tab="${k}">${icon(ic)}${l}</button>`).join("");
    ws.hidden = false; document.body.classList.add("lock");
    if (location.hash !== "#caso/" + id) history.replaceState(null, "", "#caso/" + id);
    renderTab();
  }
  function closeWorkspace() {
    ws.hidden = true; document.body.classList.remove("lock"); wsCharts.forEach((c) => c.destroy()); wsCharts = []; currentCase = null;
    history.replaceState(null, "", "#casos"); renderCases();
  }
  ws.addEventListener("click", (e) => {
    if (e.target === ws || e.target.closest("#ws-close")) return closeWorkspace();
    const idx = currentCase ? CASES.indexOf(currentCase) : 0;
    if (e.target.closest("#ws-prev")) return openCase(CASES[(idx - 1 + CASES.length) % CASES.length].case_id, currentTab);
    if (e.target.closest("#ws-next")) return openCase(CASES[(idx + 1) % CASES.length].case_id, currentTab);
    const t = e.target.closest("[data-tab]"); if (t) { currentTab = t.dataset.tab; $$(".ws-tab").forEach((b) => b.classList.toggle("on", b === t)); renderTab(); }
    const go = e.target.closest("[data-go]"); if (go) { currentTab = go.dataset.go; $$(".ws-tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === currentTab)); renderTab(); }
  });

  function renderTab() {
    wsCharts.forEach((c) => c.destroy()); wsCharts = [];
    // Se reemplaza el contenedor para descartar los listeners de la pestaña anterior.
    const old = $("#ws-body"); const body = old.cloneNode(false); old.replaceWith(body);
    const c = currentCase;
    ({ expediente: tabExpediente, inventario: tabInventario, arquitectura: tabArquitectura, metricas: tabMetricas, incidentes: tabIncidentes, bmm: tabBmm, tutor: tabTutor, retos: tabRetos, alternativas: tabAlternativas, matriz: tabMatriz })[currentTab](body, c);
    hydrate(body);
  }

  /* Oculta en el expediente los resultados ya calculados (el estudiante debe obtenerlos). */
  const hideAnswers = (t) => {
    const parts = t.split(/(?<=\.)\s+/);
    const kept = parts.filter((p) => !/(calculad[ao]|MTTR fue|MTBF estimado)/i.test(p));
    return kept.length < parts.length ? kept.join(" ") + " [Resultados calculados ocultos: obtenlos tú en la pestaña Métricas.]" : t;
  };
  /* ---- Expediente ---- */
  function tabExpediente(body, c) {
    const services = c.nodes.filter((n) => n[2] === "s");
    body.innerHTML = `<div class="ws-grid">
      <div class="card span-8"><h4>${icon("info")} Resumen</h4><p style="margin:0 0 14px;font-size:16px">${linkTerms(c.description)}</p>
        <div class="case-meta">${c.archs.map((a) => `<span class="pill">${esc(a)}</span>`).join("")}${c.conditions.map((a) => `<span class="pill amber">${esc(a)}</span>`).join("")}</div></div>
      <div class="card span-4"><h4>${icon("heart")} Servicios críticos</h4><div class="case-meta">${services.map((s) => `<span class="pill" style="border-color:${alpha(c.color, .5)}">${esc(s[1])}</span>`).join("")}</div>
        <p class="hint">Haz clic en «Arquitectura» para ver cómo dependen entre sí.</p></div>
      <div class="span-12"><div class="notice info">${icon("lightbulb")}<span>Los términos <button class="term" data-term="SPOF" type="button">subrayados</button> tienen definición: pasa el cursor o tócalos. Lee todo el expediente antes de proponer: las restricciones cambian qué alternativas son viables.</span></div></div>
      <div class="span-12 chunks">${c.corpus.map((k) => `<article class="chunk" style="--c:${c.color}"><h5><span>${esc(k.section)}</span><span>p. ${k.page}</span></h5><p>${linkTerms(hideAnswers(k.text))}</p><div class="tags">${k.tags.map((t) => `<span>#${esc(t)}</span>`).join("")}</div></article>`).join("")}</div>
    </div>`;
  }

  /* ---- Arquitectura: grafo con simulador ---- */
  function layoutGraph(c) {
    const ids = c.nodes.map((n) => n[0]);
    const out = Object.fromEntries(ids.map((i) => [i, []])), inc = Object.fromEntries(ids.map((i) => [i, []]));
    c.edges.forEach(([a, b]) => { if (out[a] && inc[b]) { out[a].push(b); inc[b].push(a); } });
    const layer = {}; const visiting = new Set();
    const L = (id) => { if (layer[id] != null) return layer[id]; if (visiting.has(id)) return 0; visiting.add(id); const v = inc[id].length ? Math.max(...inc[id].map((p) => L(p) + 1)) : 0; visiting.delete(id); return (layer[id] = v); };
    ids.forEach(L);
    const isolated = ids.filter((i) => !out[i].length && !inc[i].length);
    const maxL = Math.max(0, ...ids.filter((i) => !isolated.includes(i)).map((i) => layer[i]));
    isolated.forEach((i) => (layer[i] = maxL + 1));
    const cols = []; ids.forEach((i) => (cols[layer[i]] = cols[layer[i]] || []).push(i));
    const kindOrder = { a: 0, s: 1, x: 2, c: 3 };
    const node = Object.fromEntries(c.nodes.map((n) => [n[0], n]));
    const pos = {};
    cols.forEach((col, li) => {
      if (li === 0) col.sort((a, b) => kindOrder[node[a][2]] - kindOrder[node[b][2]]);
      else col.sort((a, b) => { const bc = (x) => inc[x].length ? inc[x].reduce((s, p) => s + (pos[p] ?? 0), 0) / inc[x].length : 99; return bc(a) - bc(b); });
      col.forEach((id, i) => (pos[id] = i));
    });
    const W = 200, H = 54, CW = 250, RH = 84, PAD = 30;
    const maxRows = Math.max(...cols.map((c) => c.length));
    const height = PAD * 2 + maxRows * RH + 20;
    const xy = {};
    cols.forEach((col, li) => { const off = (maxRows - col.length) * RH / 2; col.forEach((id, i) => (xy[id] = { x: PAD + li * CW, y: PAD + 20 + off + i * RH })); });
    return { W, H, width: PAD * 2 + cols.length * CW - (CW - W), height, xy, out, inc, isolatedCol: isolated.length ? maxL + 1 : -1, CW, PAD };
  }

  const KIND = { a: ["Actor", "#94a3b8", "users"], s: ["Servicio", "#22d3ee", "app"], x: ["Tercero", "#facc15", "plug"] };
  function nodeStyle(n) {
    if (n[2] === "c") { const comp = COMPONENTS[n[3]]; return [CATEGORIES[comp.cat].label, CATEGORIES[comp.cat].color, comp.icon]; }
    if (n[2] === "x" && n[3]) { return ["Tercero", "#facc15", COMPONENTS[n[3]].icon]; }
    return KIND[n[2]];
  }

  function tabArquitectura(body, c) {
    const G = layoutGraph(c);
    const node = Object.fromEntries(c.nodes.map((n) => [n[0], n]));
    let edges = "", nodes = "";
    c.edges.forEach(([a, b, inf], i) => {
      const A = G.xy[a], B = G.xy[b]; if (!A || !B) return;
      edges += `<path class="g-edge flow ${inf ? "inferred" : ""}" data-e="${i}" data-a="${a}" data-b="${b}" d="${curve(A.x + G.W, A.y + G.H / 2, B.x, B.y + G.H / 2)}" marker-end="url(#arr${inf ? "i" : ""})"/>`;
    });
    c.nodes.forEach((n) => {
      const { x, y } = G.xy[n[0]]; const [sub, col, ic] = nodeStyle(n);
      nodes += `<g class="g-node ${n[4] ? "spof" : ""}" data-n="${n[0]}" tabindex="0" role="button" aria-label="${esc(n[1])}">
        <rect class="spof-ring" x="${x - 5}" y="${y - 5}" width="${G.W + 10}" height="${G.H + 10}" rx="15"/>
        <rect class="box" x="${x}" y="${y}" width="${G.W}" height="${G.H}" rx="12" stroke="${col}"/>
        <rect x="${x + 8}" y="${y + 9}" width="36" height="36" rx="10" fill="${alpha(col, .14)}"/>
        ${svgIcon(ic, x + 26, y + 27, 20, col)}
        <text class="sub" x="${x + 52}" y="${y + 21}">${esc(sub)}</text>
        <text x="${x + 52}" y="${y + 38}">${esc(n[1].length > 19 ? n[1].slice(0, 18) + "…" : n[1])}</text>
        <g class="spof-badge"><circle cx="${x + G.W - 2}" cy="${y + 2}" r="10" fill="#f43f5e"/><text x="${x + G.W - 2}" y="${y + 6.5}" text-anchor="middle" style="font:700 12px Inter;fill:#fff">!</text></g>
        <title>${esc(n[1])}</title></g>`;
    });
    const isoLabel = G.isolatedCol >= 0 ? `<text x="${G.PAD + G.isolatedCol * G.CW}" y="24" style="fill:#fbbf24;font:600 11px 'JetBrains Mono'">¿DÓNDE ENCAJAN? (sin relación declarada)</text>` : "";
    const spofCount = c.nodes.filter((n) => n[4]).length;

    body.innerHTML = `
      <div class="graph-bar">
        <div class="seg" id="g-mode"><button data-mode="explore" class="on">${icon("search")} Explorar</button><button data-mode="fail" class="danger">${icon("flame")} Simular falla</button></div>
        <div class="seg"><button id="g-spof" class="${spofCount ? "on danger" : ""}">${icon("alert")} Mostrar SPOF ${spofCount ? `(${spofCount})` : ""}</button></div>
      </div>
      <div class="graph-wrap ${spofCount ? "show-spof" : ""}" id="g-wrap">
        <svg class="graph" id="graph" viewBox="0 0 ${G.width} ${G.height}" style="min-width:${Math.max(760, G.width * 0.8)}px">
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="rgba(148,163,184,.6)"/></marker>
            <marker id="arri" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="rgba(251,191,36,.7)"/></marker>
          </defs>${isoLabel}${edges}${nodes}</svg>
      </div>
      <div class="legend">
        <span><i style="background:#94a3b8"></i>Actor</span><span><i style="background:#22d3ee"></i>Servicio de negocio</span><span><i style="background:#facc15"></i>Tercero</span><span><i style="background:#a78bfa"></i>Componente (color por categoría)</span>
        <span>── depende de (declarada)</span><span style="color:#fbbf24">- - - relación inferida: valídala</span><span style="color:#fb7185">! punto único de falla declarado</span>
      </div>
      <div class="sim-out idle" id="sim-out">${icon("info")} <b style="color:inherit">Modo explorar:</b> pasa el cursor sobre un nodo para resaltar sus dependencias y haz clic para ver su ficha. Cambia a <b style="color:#fecdd3">Simular falla</b> y haz clic en un componente para ver la cascada de impacto.</div>
      ${c.spofNote ? `<div class="notice info" style="margin-top:12px">${icon("file")}<span>${esc(c.spofNote)}</span></div>` : ""}
      ${spofCount ? "" : `<div class="notice" style="margin-top:12px">${icon("alert")}<span>Este caso <b>no declara puntos únicos de falla</b>. Usa el simulador para descubrirlos: ¿qué nodo tumba más servicios?</span></div>`}`;

    let mode = "explore";
    const svg = $("#graph"), out = $("#sim-out");
    const rev = G.inc; // quién depende de mí
    const cascade = (id) => { const seen = new Set([id]); const q = [id]; while (q.length) { const x = q.shift(); (rev[x] || []).forEach((p) => { if (!seen.has(p)) { seen.add(p); q.push(p); } }); } seen.delete(id); return seen; };
    const clear = () => $$(".g-node, .g-edge", svg).forEach((el) => el.classList.remove("failed", "impacted", "hit", "dim", "hl"));

    $("#g-mode").addEventListener("click", (e) => {
      const b = e.target.closest("[data-mode]"); if (!b) return; mode = b.dataset.mode;
      $$("#g-mode button").forEach((x) => x.classList.toggle("on", x === b)); clear();
      out.className = "sim-out idle";
      out.innerHTML = mode === "fail" ? `${icon("flame")} <b style="color:#fecdd3">Modo simulación:</b> haz clic en cualquier nodo para «apagarlo» y ver qué se cae en cascada.` : `${icon("info")} Modo explorar: pasa el cursor sobre un nodo y haz clic para ver su ficha.`;
      hydrate(out);
    });
    $("#g-spof").addEventListener("click", (e) => { $("#g-wrap").classList.toggle("show-spof"); e.currentTarget.classList.toggle("on"); e.currentTarget.classList.toggle("danger"); });

    svg.addEventListener("mouseover", (e) => {
      if (mode !== "explore") return; const g = e.target.closest(".g-node"); if (!g) return; const id = g.dataset.n;
      const near = new Set([id, ...G.out[id], ...G.inc[id]]);
      $$(".g-node", svg).forEach((n) => n.classList.toggle("dim", !near.has(n.dataset.n)));
      $$(".g-edge", svg).forEach((ed) => { const on = ed.dataset.a === id || ed.dataset.b === id; ed.classList.toggle("hl", on); ed.classList.toggle("dim", !on); });
    });
    svg.addEventListener("mouseleave", () => { if (mode === "explore") clear(); });
    const act = (g) => {
      const id = g.dataset.n; const n = node[id];
      if (mode === "explore") return openNode(c, n, G);
      clear();
      const hit = cascade(id);
      g.classList.add("failed");
      $$(".g-node", svg).forEach((x) => { if (hit.has(x.dataset.n)) x.classList.add("impacted"); else if (x.dataset.n !== id) x.classList.add("dim"); });
      $$(".g-edge", svg).forEach((ed) => { const inChain = (hit.has(ed.dataset.a)) && (hit.has(ed.dataset.b) || ed.dataset.b === id); ed.classList.add(inChain ? "hit" : "dim"); });
      const hs = [...hit].map((h) => node[h]);
      const sv = hs.filter((h) => h[2] === "s"), ac = hs.filter((h) => h[2] === "a");
      const totalS = c.nodes.filter((x) => x[2] === "s").length;
      out.className = "sim-out";
      out.innerHTML = hit.size
        ? `${icon("flame")} <b>Falla de «${esc(n[1])}»</b> → ${hit.size} elementos impactados en cascada. <br>Servicios caídos: <b>${sv.length}/${totalS}</b> ${sv.length ? "(" + sv.map((x) => esc(x[1])).join(", ") + ")" : ""}${ac.length ? `<br>Actores afectados: ${ac.map((x) => esc(x[1])).join(", ")}` : ""}
           <br><span class="muted">Pregunta: ¿qué tendría que existir para que esta falla NO se propagara? No te damos la respuesta; revisa la pestaña Alternativas.</span>`
        : `${icon("info")} Nada depende de «${esc(n[1])}» según el modelo. ¿Es realmente así, o hay una dependencia no documentada?`;
      hydrate(out);
    };
    svg.addEventListener("click", (e) => { const g = e.target.closest(".g-node"); if (g) act(g); });
    svg.addEventListener("keydown", (e) => { const g = e.target.closest(".g-node"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); act(g); } });
  }

  function openNode(c, n, G) {
    const node = Object.fromEntries(c.nodes.map((x) => [x[0], x]));
    const deps = G.out[n[0]].map((d) => node[d][1]), dependents = G.inc[n[0]].map((d) => node[d][1]);
    const ctx = `<div class="m-sec"><div class="card" style="border-color:${alpha(c.color, .4)}">
      <h4 style="margin-bottom:8px">${icon("layers")} En el caso ${c.case_id} · ${esc(c.title)}</h4>
      ${n[4] ? `<div class="notice" style="margin-bottom:10px;background:rgba(244,63,94,.1);border-color:rgba(244,63,94,.4);color:#fecdd3">${icon("alert")}<span>Declarado como <b>punto único de falla</b> en el expediente.</span></div>` : ""}
      <p style="margin:0 0 6px"><b>Depende de:</b> ${deps.length ? deps.map(esc).join(", ") : "<span class='muted'>ninguno declarado</span>"}</p>
      <p style="margin:0"><b>Dependen de él:</b> ${dependents.length ? dependents.map(esc).join(", ") : "<span class='muted'>ninguno declarado</span>"}</p></div></div>`;
    if (n[2] === "c" || (n[2] === "x" && n[3])) return openComponent(n[3], { label: n[1], html: ctx });
    const [sub, col, ic] = nodeStyle(n);
    const qs = n[2] === "s"
      ? [`¿Cuánto le cuesta al negocio una hora sin «${n[1]}»?`, "¿Cuál sería un RTO y un RPO razonables para este servicio?", "¿De cuántos componentes en serie depende? Calcula su disponibilidad teórica.", "¿Quién es el dueño (accountable) de este servicio?"]
      : n[2] === "a" ? ["¿Qué necesita este actor para trabajar y cuándo lo necesita?", "¿Tiene alguna alternativa manual si la tecnología falla?", "¿Cómo se entera de que hay un incidente?"]
      : ["¿Qué pasa si este tercero no responde?", "¿Existe contrato o SLA con él?"];
    openModal(`<div class="m-head"><div class="m-ico">${icon(ic)}</div><div><div class="kick">${sub}</div><h2 id="modal-title">${esc(n[1])}</h2></div></div>${ctx}
      <div class="m-sec"><h3>${icon("search")} Preguntas para tu análisis</h3>${list(qs, "search", "q")}</div>`, col);
  }

  /* ---- Redundancia de la arquitectura TI (parte A) e información de la instalación (parte B) ----
     El Tier clasifica la instalación, no los servidores. La respuesta se guarda en el ítem «tier» del equipo. */
  const RD = window.REDUND;
  const tierGet = (cid) => RD.norm(store.get(cid + ":tier", null));
  const tierHosting = (c) => c.hosting || RD.hosting[c.case_id] || "propio";
  const tierComps = (c) => (c.nodes || []).filter((n) => n[2] === "c");
  // Patrones del catálogo que no están entre las alternativas candidatas del caso (el equipo puede elegir cualquiera de los dos grupos).
  // Tolerancia a versiones mezcladas: si el navegador aún tiene en caché un scoring.js anterior, la matriz se dibuja igual (sin cobertura ni orden por cobertura).
  const mxCrit = (pr) => (pr && pr.criticos) || { total: 0, cubiertos: 0, sin: [] };
  const mxRank = (list) => (SCR.rank ? SCR.rank(list) : list.slice().sort((a, b) => b.total - a.total));
  const mxOthers = (c) => Object.keys(PATTERNS).filter((k) => !(c.alternatives || []).includes(k));
  const tierSeed = (c) => (tw.on && tw.team ? "t" + tw.team : c.case_id);
  const tierTopOpts = (t) => `<option value="">— Elige —</option>${RD.info.filter(([id]) => t.b.info.includes(id)).map(([id, l]) => `<option value="${id}" ${t.b.top === id ? "selected" : ""}>${esc(l)}</option>`).join("")}`;
  function tierCardHtml(c) {
    const t = tierGet(c.case_id), host = tierHosting(c);
    const info = RD.shuffle(RD.info.filter(([id]) => id !== "zonas" || RD.hasCloud(host)), tierSeed(c) + ":info");
    const who = RD.shuffle(RD.who, tierSeed(c) + ":who");
    const sel = (k) => `<select data-tier="${k}"><option value="">— Elige —</option>${RD.levels.map(([id, l]) => `<option value="${id}" ${t[k] === id ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const chk = (attr, id, label, on) => `<label class="rd-chk"><input type="checkbox" ${attr}="${id}" ${on ? "checked" : ""}><span>${esc(label)}</span></label>`;
    return `<div class="card span-12 tier-card"><h4>${icon("building")} Redundancia de la arquitectura TI e instalación <span class="h4-r">${mentorBtn("tier", "Redundancia de la arquitectura TI e instalación")}</span></h4>
        <div class="rd-what"><b>${icon("info")} Qué mide el Tier y qué no</b>
          <p>El Tier (Uptime Institute) clasifica la <b>instalación</b> que aloja los equipos: energía, enfriamiento y rutas de distribución. No clasifica servidores, redes ni aplicaciones, y no es un porcentaje de disponibilidad.</p>
          <p>La disponibilidad de un servicio depende de tres capas <b>en serie</b>: si una falla, el servicio cae aunque las otras dos estén bien.</p>
          <div class="heat-scroll"><table class="rubric inv"><thead><tr><th>Capa</th><th>Qué incluye</th><th>Con qué se evalúa</th></tr></thead>
            <tbody>${RD.layers.map((r) => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join("")}</tbody></table></div>
          <p class="muted">Un centro de datos Tier IV no salva un servicio que depende de un único servidor de base de datos.</p></div>
        ${t.prev && !RD.done({ ...t, prev: false }) ? `<div class="notice info">${icon("check")}<span><b>Tu equipo ya tenía este ítem desarrollado y sigue contando.</b> La pregunta cambió: lo que respondieron como Tier quedó convertido en la parte A. Completen la <b>parte B</b> cuando puedan.</span></div>` : ""}

        <h5 class="rd-h">Parte A · Redundancia de la arquitectura TI</h5>
        <div class="tier-grid">${RD.levels.map(([, l, d]) => `<div class="tier"><b>${esc(l)}</b><span>${esc(d)}</span></div>`).join("")}</div>
        <div class="lab-ctx rd-two">
          <label>Nivel que mejor describe la situación actual${sel("actual")}</label>
          <label>Nivel objetivo para los servicios críticos${sel("objetivo")}</label>
        </div>
        <p class="rd-q"><b>Evidencia del inventario.</b> Marca cuáles de estos componentes son únicos y cuáles tienen respaldo (al menos dos).</p>
        <div class="rd-comps">${tierComps(c).map((n) => `<div class="rd-comp"><code>${esc(n[1])}</code><span class="rd-seg">
            <button type="button" class="${t.ev[n[0]] === "u" ? "on u" : ""}" data-rdev="${esc(n[0])}" data-val="u">Único</button><button type="button" class="${t.ev[n[0]] === "r" ? "on r" : ""}" data-rdev="${esc(n[0])}" data-val="r">Con respaldo</button></span></div>`).join("")}</div>
        <label class="rd-line">Matiz (opcional)<input type="text" data-tier="just" value="${esc(t.just)}" placeholder="p. ej. los dos enlaces llegan por la misma acometida…"></label>

        <h5 class="rd-h">Parte B · Tier de la instalación</h5>
        <p class="muted">${esc(RD.intro[host] || RD.intro.propio)}</p>
        <p class="rd-q"><b>1. ${esc(RD.ask[host] || RD.ask.propio)}</b> Marca todas las que apliquen.</p>
        <div class="rd-checks">${info.map(([id, l]) => chk("data-rdinfo", id, l, t.b.info.includes(id))).join("")}</div>
        <p class="rd-q"><b>2. ¿A quién se la pedirías?</b></p>
        <div class="rd-checks">${who.map(([id, l]) => chk("data-rdwho", id, l, t.b.who.includes(id))).join("")}</div>
        <p class="rd-q"><b>3. ¿Cuál de las que marcaste es la más importante y por qué?</b></p>
        <div class="lab-ctx rd-two">
          <label>La más importante<select data-rdtop>${tierTopOpts(t)}</select></label>
          <label>¿Por qué? (una línea, mínimo 8 palabras)<input type="text" data-rdwhy value="${esc(t.b.why)}" placeholder="p. ej. sin ese dato no puedo saber si…"></label>
        </div>
        ${twBadges(["tier"])}
        <p class="hint">La parte A describe los equipos; la parte B, el lugar que los aloja. Son capas distintas: mejorar una no arregla la otra.</p></div>`;
  }
  function tierCardBind(body, c) {
    const cid = c.case_id;
    const save = (fn) => { const t = tierGet(cid); fn(t); if (!t.b.info.includes(t.b.top)) t.b.top = ""; store.set(cid + ":tier", t); return t; };
    body.addEventListener("click", (e) => {
      const b = e.target.closest("[data-rdev]"); if (!b) return;
      const id = b.dataset.rdev, val = b.dataset.val;
      const t = save((x) => { if (x.ev[id] === val) delete x.ev[id]; else x.ev[id] = val; });
      $$(`[data-rdev="${id}"]`, body).forEach((x) => { x.className = t.ev[id] === x.dataset.val ? "on " + x.dataset.val : ""; });
    });
    body.addEventListener("change", (e) => {
      const d = e.target.dataset;
      if (d.tier === "actual" || d.tier === "objetivo") return void save((x) => { x[d.tier] = e.target.value; });
      if (d.rdinfo || d.rdwho) {
        const k = d.rdinfo ? "info" : "who", id = d.rdinfo || d.rdwho;
        const t = save((x) => { x.b[k] = x.b[k].filter((y) => y !== id); if (e.target.checked) x.b[k].push(id); });
        const top = $("[data-rdtop]", body); if (top && k === "info") top.innerHTML = tierTopOpts(t);
        return;
      }
      if ("rdtop" in d) save((x) => { x.b.top = e.target.value; });
    });
    body.addEventListener("input", (e) => {
      const d = e.target.dataset;
      if (d.tier === "just") save((x) => { x.just = e.target.value; });
      if ("rdwhy" in d) save((x) => { x.b.why = e.target.value; });
    });
  }

  /* ---- Inventario ---- */
  function tabInventario(body, c) {
    const d = c.data;
    const st = d.storage; const stPct = st.used / st.total * 100;
    const teamTotal = d.team.reduce((s, r) => s + r[1], 0);
    body.innerHTML = `<div class="ws-grid">
      <div class="span-12 kpi-row" style="margin-top:0">${d.facts.map(([l, v]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}</div>
      <div class="card span-12"><h4>${icon("server")} Servidores y recursos</h4>
        <div class="heat-scroll"><table class="rubric inv"><thead><tr><th>Servidor</th><th>Función</th><th>vCPU</th><th>RAM</th><th>Plataforma</th><th>Observación</th></tr></thead>
        <tbody>${d.servers.map((s) => `<tr><td><code>${esc(s[0])}</code></td><td>${esc(s[1])}</td><td>${s[2] ?? "Variable"}</td><td>${s[3] != null ? s[3] + " GB" : "Variable"}</td><td>${esc(s[4])}</td><td>${esc(s[5])}</td></tr>`).join("")}</tbody></table></div>
        <p class="hint">${esc(d.serversNote)}</p>
        <div class="chart-box"><canvas id="ch-inv"></canvas></div>
        <div class="notice info" style="margin-top:12px">${icon("search")}<span>Lee con atención la columna <b>Observación</b>: palabras como «instancia principal», «nodo principal» o «único» son pistas. ¿Cuáles de estos servidores son puntos únicos de falla? Justifícalo en la etapa 3 del taller guiado.</span></div></div>
      <div class="card span-6"><h4>${icon("storage")} ${esc(st.name)}</h4>
        <div class="kpi-row" style="margin-top:0"><div class="kpi"><b>${fmt(st.total)} TB</b><span>Capacidad total</span></div><div class="kpi ${stPct >= 85 ? "bad" : stPct >= 75 ? "warn" : ""}"><b>${fmt(st.used)} TB</b><span>Utilizada (${fmt(stPct, 1)} %)</span></div><div class="kpi"><b>${st.growth != null ? fmt(st.growth * 1000) + " GB" : "Sin dato"}</b><span>Crecimiento mensual</span></div></div>
        <div class="stor-bar"><i style="width:${stPct}%"></i></div>
        <p class="hint">${esc(st.note)}</p></div>
      ${tierCardHtml(c)}
      <div class="card span-6"><h4>${icon("backup")} Backup</h4>${list(d.backup, "backup")}</div>
      <div class="card span-6"><h4>${icon("wan")} Red y conectividad</h4>${list(d.network, "lan")}</div>
      <div class="card span-6"><h4>${icon("shield")} Seguridad</h4>${list(d.security, "shield")}</div>
      <div class="card span-6"><h4>${icon("users")} Equipo de TI · ${teamTotal} personas</h4><div class="chart-box"><canvas id="ch-team"></canvas></div>${d.teamNote ? `<p class="hint">${esc(d.teamNote)}</p>` : ""}</div>
      <div class="card span-6"><h4>${icon("ticket")} Forma actual de operación</h4>${list(d.operation, "arrow")}</div>
    </div>`;
    tierCardBind(body, c);
    const srv = d.servers.filter((s) => s[2] != null);
    makeChart($("#ch-inv"), { type: "bar", data: { labels: srv.map((s) => s[0]), datasets: [
      { label: "vCPU", data: srv.map((s) => s[2]), backgroundColor: alpha("#38bdf8", .75), borderRadius: 5, yAxisID: "y" },
      { label: "RAM (GB)", data: srv.map((s) => s[3]), backgroundColor: alpha("#a78bfa", .75), borderRadius: 5, yAxisID: "y1" }] },
      options: { maintainAspectRatio: false, scales: { y: { title: { display: true, text: "vCPU" } }, y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "RAM GB" } } } } }, wsCharts);
    makeChart($("#ch-team"), { type: "bar", data: { labels: d.team.map((t) => t[0]), datasets: [{ data: d.team.map((t) => t[1]), backgroundColor: alpha(c.color, .7), borderRadius: 5 }] },
      options: { maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { ticks: { stepSize: 1 } } } } }, wsCharts);
  }

  /* ---- Métricas ---- */
  const CALC_FIELDS = [
    ["av", "Disponibilidad", "%", "(T − Tcaída) / T × 100"],
    ["mttr", "MTTR", "h", "Tiempo total de recuperación / Nº de incidentes"],
    ["mtbf", "MTBF", "h", "(T − Tcaída) / Nº de incidentes"],
    ["months", "Meses hasta llenar el almacenamiento", "meses", "(Capacidad total − utilizada) / crecimiento mensual"],
  ];
  // Qué cálculos aplican al caso. Sin valores: el servidor compara con la clave y responde solo «correcto» o «revisa».
  function calcAvailable(c) { return { av: true, mttr: true, mtbf: true, months: !!(c.data.storage || {}).growth }; }
  const CALC_OK = "¡Correcto! Ahora interpreta el resultado: ¿es aceptable para este negocio?";
  function calcLeft(row, d) {
    const p = $(".calc-left", row); if (!p) return;
    if (d.disponible === false) p.textContent = "Verificador no disponible: tu docente aún no cargó la clave de este cálculo.";
    else if (d.restantes <= 0) p.textContent = `Sin verificaciones disponibles (usaste ${d.max}). Pide una revisión al Mentor o consulta a tu docente.`;
    else p.textContent = `Te quedan ${d.restantes} de ${d.max} verificaciones para este cálculo (repetir un valor ya verificado no gasta intentos).`;
  }
  async function verifyCalc(c, k, v, row, btn) {
    const msg = $(".calc-msg", row);
    if (!API_BASE || !teamSession()) { row.className = "calc-row"; msg.textContent = "Ingresa con el código de tu equipo para verificar tus cálculos."; return; }
    btn.disabled = true;
    try {
      const r = await fetch(`${API_BASE}/api/calc/verify`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ case_id: c.case_id, item: k, value: v }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { row.className = "calc-row" + (r.status === 429 ? " bad" : ""); msg.textContent = d.error || "No fue posible verificar. Intenta de nuevo."; if (d.max != null) calcLeft(row, d); return; }
      const ok = d.resultado === "correcto";
      row.className = "calc-row " + (ok ? "ok" : "bad"); msg.textContent = d.mensaje; calcLeft(row, d);
      const sv = store.get(c.case_id + ":calc", {}); sv[k] = v; sv[k + "_ok"] = ok; store.set(c.case_id + ":calc", sv);
      if (ok && !d.repetido) toast("¡Cálculo correcto!");
    } catch { msg.textContent = "No fue posible contactar al servidor. Intenta de nuevo (no se gastó ningún intento)."; }
    finally { btn.disabled = false; }
  }

  function tabMetricas(body, c) {
    const d = c.data, s = d.service, st = d.storage;
    const avail = calcAvailable(c);
    const saved = store.get(c.case_id + ":calc", {});
    const blocks = d.blocks;
    const chartBlocks = (tag) => blocks.filter((b) => b.rows.some((r) => r[3] === tag));
    const hasLat = chartBlocks("latAvg").length, hasConn = chartBlocks("connAvg").length, hasCpu = chartBlocks("cpuAvg").length;
    const evLab = { c: ["Completa", "green"], p: ["Parcial", "amber"], f: ["Faltante", "red"], n: ["No reportada", ""] };
    const fmtVal = (v, u) => (Array.isArray(v) ? v.map((x) => fmt(x) + (u ? " " + u : "")).join(" → ") : typeof v === "number" ? fmt(v) + (u ? " " + u : "") : esc(v));

    body.innerHTML = `<div class="ws-grid">
      <div class="span-12 notice info">${icon("info")}<span><b>Datos oficiales del caso · servicio: ${esc(s.name)}</b>. Aquí están los datos crudos. <b>Disponibilidad, MTTR y MTBF no se muestran: los calculas tú</b> y el verificador te dice si tu resultado es correcto, sin revelarlo.${d.dataNote ? "<br>" + esc(d.dataNote) : ""}</span></div>
      <div class="span-12 kpi-row" style="margin-top:0">
        ${[[s.window + " h", "Periodo observado"], [fmt(s.down) + " h", "Tiempo total fuera de servicio"], [s.inc, "Número de incidentes"], [fmt(s.rec) + " h", "Tiempo total de recuperación"], ...s.extra.map(([l, v]) => [v, l])].map(([v, l]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}
      </div>
      <div class="card span-7"><h4>${icon("flask")} Verificador de cálculos</h4>
        <p class="muted" style="margin-top:-6px">Escribe tu resultado (usa punto o coma decimal) y pulsa Verificar.</p>
        <div class="calc-list">${CALC_FIELDS.filter(([k]) => avail[k]).map(([k, l, u, f]) => { const r = saved[k + "_ok"] ? { state: "ok", msg: CALC_OK } : { state: "", msg: "" }; return `
          <div class="calc-row ${r.state}" data-calc="${k}">
            <label><span>${esc(l)} <span class="muted">(${u})</span></span><input type="text" inputmode="decimal" value="${saved[k] != null ? esc(String(saved[k]).replace(".", ",")) : ""}" placeholder="?"></label>
            <button class="btn btn-sm" data-verify="${k}">Verificar</button>
            <button class="icon-btn" data-hint="${k}" title="Ver fórmula">${icon("info")}</button>${mentorBtn("calc." + k, l)}
            <p class="calc-msg">${r.msg}</p><p class="calc-left"></p>${twBadge("calc." + k) ? `<p class="calc-ed">${twBadge("calc." + k)}</p>` : ""}<p class="calc-hint" hidden>Fórmula: <code>${esc(f)}</code></p></div>`; }).join("")}</div>
        ${s.partial ? `<p class="hint" style="color:#fbbf24">Datos parciales: solo 5 de 7 incidentes tienen hora exacta. Declara tus supuestos al calcular.</p>` : ""}</div>
      <div class="card span-5"><h4>${icon("gauge")} Caída real vs. caída permitida (${s.window} h)</h4><div class="chart-box tall"><canvas id="ch-target"></canvas></div>
        <p class="hint">¿Qué nivel de servicio (SLA) sería realista proponer para ${esc(s.name)}?</p></div>
      ${hasCpu ? `<div class="card span-${hasLat ? 6 : 12}"><h4>${icon("server")} Uso de CPU y RAM</h4><div class="chart-box"><canvas id="ch-cpu"></canvas></div><p class="hint">Compara el promedio con el pico. ¿Es saturación permanente o picos de demanda?</p></div>` : ""}
      ${hasLat ? `<div class="card span-${hasCpu ? 6 : 12}"><h4>${icon("zap")} Latencia / tiempo de respuesta</h4><div class="chart-box"><canvas id="ch-lat"></canvas></div><p class="hint">¿Cuántas veces aumenta la latencia en el pico? ¿Qué lo provoca en este negocio?</p></div>` : ""}
      ${hasConn ? `<div class="card span-6"><h4>${icon("database")} Conexiones a la base de datos</h4><div class="chart-box"><canvas id="ch-conn"></canvas></div></div>` : ""}
      ${d.special ? `<div class="card span-6"><h4>${icon("chart")} ${esc(d.special.title)}</h4><div class="chart-box"><canvas id="ch-special"></canvas></div></div>` : ""}
      <div class="card span-6"><h4>${icon("storage")} Simulador de almacenamiento · ${esc(st.name)}</h4>
        ${st.growth ? `<label><span>Proyectar a <b id="proj-m">6</b> meses</span><input type="range" id="proj" min="1" max="24" value="6"></label>
        <div class="kpi-row" id="proj-out"></div><div class="stor-bar"><i id="proj-bar"></i><em style="left:80%"></em></div>
        <p class="hint">La marca indica el umbral del 80 %. El dato exacto de meses hasta llenarse lo calculas en el verificador.</p>`
        : `<div class="notice">${icon("alert")}<span>No hay serie histórica de crecimiento: no es posible proyectar. ¿Qué tendrías que medir y durante cuánto tiempo?</span></div>`}</div>
      ${blocks.map((b) => `<div class="card span-4"><h4>${icon("activity" in window.ICONS ? "activity" : "monitor")} ${esc(b.title)}</h4>
        ${b.cols ? `<p class="hint" style="margin-top:-6px">${esc(b.cols.join(" → "))}</p>` : ""}
        <table class="metric-table">${b.rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${fmtVal(r[1], r[2])}</td></tr>`).join("")}</table></div>`).join("")}
      <div class="card span-6"><h4>${icon("search")} Calidad de la evidencia (documento oficial)</h4>
        <ul class="m-list">${EVIDENCE_DOMAINS.map((dd) => { const [l, k] = evLab[c.evidence[dd]]; return `<li style="justify-content:space-between"><span>${dd}</span><span class="pill ${k}">${l}</span></li>`; }).join("")}</ul></div>
      <div class="card span-6"><h4>${icon("target")} Perfil de exposición vs. promedio</h4><div class="chart-box"><canvas id="ch-radar"></canvas></div><p class="hint">Índice textual (0-10) derivado del expediente; orientativo.</p></div>
    </div>`;

    // verificador
    body.addEventListener("click", (e) => {
      const h = e.target.closest("[data-hint]"); if (h) { const p = $(".calc-hint", h.closest(".calc-row")); p.hidden = !p.hidden; return; }
      const b = e.target.closest("[data-verify]"); if (!b) return;
      const row = b.closest(".calc-row"), k = b.dataset.verify;
      const v = parseFloat($("input", row).value.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
      if (!isFinite(v)) { row.className = "calc-row"; $(".calc-msg", row).textContent = "Escribe un número."; return; }
      verifyCalc(c, k, v, row, b);
    });
    // intentos restantes por cálculo (los guarda el servidor por equipo)
    if (API_BASE && teamSession()) fetch(`${API_BASE}/api/calc/status?case_id=${encodeURIComponent(c.case_id)}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) Object.entries(d.items).forEach(([k, st]) => { const row = $(`.calc-row[data-calc="${k}"]`, body); if (row) calcLeft(row, st); }); }).catch(() => {});
    body.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.closest(".calc-row input")) $("[data-verify]", e.target.closest(".calc-row")).click(); });

    // caída real vs permitida
    const tg = [["Real", s.down], ["Meta 99 %", s.window * .01], ["Meta 99,5 %", s.window * .005], ["Meta 99,9 %", s.window * .001]];
    makeChart($("#ch-target"), { type: "bar", data: { labels: tg.map((t) => t[0]), datasets: [{ data: tg.map((t) => +t[1].toFixed(2)), backgroundColor: ["rgba(244,63,94,.75)", "rgba(251,191,36,.6)", "rgba(163,230,53,.6)", "rgba(52,211,153,.6)"], borderRadius: 8 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => ` ${fmt(x.raw)} h de caída` } } }, scales: { y: { title: { display: true, text: "horas" } } } } }, wsCharts);

    // series por componente (bloques con cols se expanden en dos grupos)
    const series = (tags) => {
      const labels = [], sets = tags.map(() => []);
      blocks.forEach((b) => {
        if (!b.rows.some((r) => tags.includes(r[3]))) return;
        const n = b.cols ? b.cols.length : 1;
        for (let i = 0; i < n; i++) {
          labels.push(b.cols ? `${b.title.split(" ")[0]} · ${b.cols[i]}` : b.title);
          tags.forEach((t, ti) => { const r = b.rows.find((x) => x[3] === t); sets[ti].push(r ? (b.cols ? r[1][i] : r[1]) : null); });
        }
      });
      return { labels, sets };
    };
    if (hasCpu) { const { labels, sets } = series(["cpuAvg", "cpuPeak", "ramAvg"]);
      makeChart($("#ch-cpu"), { type: "bar", data: { labels, datasets: [["CPU promedio", "#38bdf8"], ["CPU pico", "#f43f5e"], ["RAM promedio", "#a78bfa"]].map(([l, col], i) => ({ label: l, data: sets[i], backgroundColor: alpha(col, .75), borderRadius: 5 })) },
        options: { maintainAspectRatio: false, scales: { y: { min: 0, max: 100, title: { display: true, text: "%" } } } } }, wsCharts); }
    if (hasLat) { const { labels, sets } = series(["latAvg", "latPeak"]);
      const isCols = blocks.some((b) => b.cols && b.rows.some((r) => r[3] === "latAvg"));
      makeChart($("#ch-lat"), { type: "bar", data: { labels, datasets: [{ label: "Promedio", data: sets[0], backgroundColor: alpha("#38bdf8", .75), borderRadius: 5 }, ...(sets[1].some((v) => v != null) ? [{ label: "Pico", data: sets[1], backgroundColor: alpha("#f43f5e", .75), borderRadius: 5 }] : [])] },
        options: { maintainAspectRatio: false, indexAxis: "y", scales: { x: { title: { display: true, text: "ms" } } }, plugins: { legend: { display: !isCols || sets[1].some((v) => v != null) } } } }, wsCharts); }
    if (hasConn) { const { labels, sets } = series(["connAvg", "connPeak"]);
      makeChart($("#ch-conn"), { type: "bar", data: { labels, datasets: [{ label: "Promedio", data: sets[0], backgroundColor: alpha("#34d399", .75), borderRadius: 5 }, { label: "Pico", data: sets[1], backgroundColor: alpha("#fb923c", .75), borderRadius: 5 }] },
        options: { maintainAspectRatio: false } }, wsCharts); }
    if (d.special) {
      const sp = d.special;
      const cfg = sp.type === "donut"
        ? { type: "doughnut", data: { labels: sp.labels, datasets: [{ data: sp.values, backgroundColor: [alpha(c.color, .8), "rgba(148,163,184,.2)"], borderWidth: 0 }] }, options: { maintainAspectRatio: false, cutout: "65%" } }
        : sp.type === "range"
        ? { type: "bar", data: { labels: sp.labels, datasets: [{ label: "Rango observado", data: sp.ranges, backgroundColor: alpha("#fbbf24", .6), borderRadius: 6 }] }, options: { maintainAspectRatio: false, indexAxis: "y", scales: { x: { min: 0, max: 100, title: { display: true, text: sp.unit } } }, plugins: { tooltip: { callbacks: { label: (x) => ` ${x.raw[0]}–${x.raw[1]} ${sp.unit}` } } } } }
        : { type: "bar", data: { labels: sp.labels, datasets: [{ label: sp.unit, data: sp.values, backgroundColor: sp.labels.map((_, i) => alpha(["#38bdf8", "#f43f5e", "#a78bfa", "#34d399"][i % 4], .75)), borderRadius: 6 },
            ...(sp.line ? [{ type: "line", label: "Referencia", data: sp.labels.map(() => sp.line), borderColor: "#fbbf24", borderDash: [6, 4], pointRadius: 0 }] : [])] },
            options: { maintainAspectRatio: false, indexAxis: sp.type === "hbars" ? "y" : "x", plugins: { legend: { display: !!sp.line } }, scales: sp.type === "hbars" ? { x: { min: 0, max: 100 } } : {} } };
      makeChart($("#ch-special"), cfg, wsCharts);
    }
    if (st.growth) {
      const upd = () => { const m = +$("#proj").value; const u = st.used + st.growth * m; const p = u / st.total * 100;
        $("#proj-m").textContent = m;
        $("#proj-out").innerHTML = `<div class="kpi ${p >= 100 ? "bad" : p >= 80 ? "warn" : "good"}"><b>${fmt(u, 1)} TB</b><span>Uso proyectado</span></div><div class="kpi ${p >= 100 ? "bad" : p >= 80 ? "warn" : "good"}"><b>${p >= 100 ? "¡Lleno!" : fmt(p, 1) + " %"}</b><span>Ocupación</span></div>`;
        $("#proj-bar").style.width = Math.min(100, p) + "%"; $("#proj-bar").classList.toggle("full", p >= 100); };
      $("#proj").addEventListener("input", upd); upd();
    }
    const dims = Object.keys(EXPOSURE);
    const avg = dims.map((dd) => +(CASES.reduce((sum, x) => sum + x.expNorm[dd], 0) / CASES.length).toFixed(1));
    makeChart($("#ch-radar"), { type: "radar", data: { labels: dims, datasets: [
      { label: c.title, data: dims.map((dd) => c.expNorm[dd]), backgroundColor: alpha(c.color, .25), borderColor: c.color, pointBackgroundColor: c.color },
      { label: "Promedio", data: avg, backgroundColor: "rgba(148,163,184,.08)", borderColor: "rgba(148,163,184,.6)", borderDash: [4, 4], pointRadius: 0 }] },
      options: { maintainAspectRatio: false, scales: { r: { min: 0, max: 10, ticks: { display: false }, grid: { color: "rgba(148,163,184,.15)" }, angleLines: { color: "rgba(148,163,184,.15)" }, pointLabels: { color: "#cdd7e8", font: { size: 11 } } } } } }, wsCharts);
  }

  /* ---- Incidentes ---- */
  const INC_COLORS = { Disponibilidad: "#f43f5e", Capacidad: "#fbbf24", Cambios: "#a78bfa", Backup: "#60a5fa", Seguridad: "#fb7185", Proveedor: "#f472b6", Monitoreo: "#34d399", Integración: "#2dd4bf", Conectividad: "#22d3ee", Rendimiento: "#fb923c", Costos: "#a3e635", Gobierno: "#e879f9" };
  // Clasificación por incidente: { A: { itil, cobit, iso } } (acepta el formato antiguo con solo texto ITIL).
  const getInc = (id) => { const v = store.get(id + ":itil", {}); Object.keys(v).forEach((k) => { if (typeof v[k] === "string") v[k] = { itil: v[k] }; }); return v; };
  const fwSelect = (fw, attr, sel) => `<select ${attr}><option value="">— Elige —</option>${Object.entries(window.FRAMEWORKS[fw].groups).map(([g, o]) => `<optgroup label="${esc(g)}">${o.map((x) => `<option ${x === sel ? "selected" : ""}>${esc(x)}</option>`).join("")}</optgroup>`).join("")}</select>`;
  function tabIncidentes(body, c) {
    const inc = c.data.incidents; const saved = getInc(c.case_id);
    const known = inc.filter((i) => i[3] != null);
    const cats = {}; inc.forEach((i) => (cats[i[4]] = (cats[i[4]] || 0) + 1));
    body.innerHTML = `<div class="ws-grid">
      <div class="card span-7"><h4>${icon("clock" in window.ICONS ? "clock" : "alert")} Duración de los incidentes documentados</h4><div class="chart-box"><canvas id="ch-inc"></canvas></div>
        <p class="hint">${inc.length - known.length} incidentes no tienen duración documentada. ¿Qué dice eso de la gestión de incidentes?</p></div>
      <div class="card span-5"><h4>${icon("layers")} Tipos de incidente</h4><div class="chart-box"><canvas id="ch-cat"></canvas></div></div>
      <div class="span-12 notice info">${icon("puzzle")}<span><b>Actividad (ITIL · COBIT · ISO 27001):</b> para cada incidente elige la práctica ITIL, el objetivo COBIT y el control ISO/IEC 27001 que más ayudarían a evitarlo o gestionarlo. Varios pueden aplicar: escoge el principal y defiéndelo en tus matrices. Usa el botón <b>Mentor</b> de cada incidente para pedir pistas y revisar tu clasificación.</span></div>
      <div class="span-12 inc-list">${inc.map(([id, t, txt, dur, cat]) => `
        <article class="inc" style="--c:${INC_COLORS[cat] || "#94a3b8"}">
          <div class="inc-id">${id}</div>
          <div class="inc-body"><h5>${esc(t)} <span class="pill" style="border-color:${INC_COLORS[cat] || "#94a3b8"}">${esc(cat)}</span>${dur ? `<span class="pill">${dur >= 60 ? fmt(dur / 60, 2) + " h" : dur + " min"}</span>` : `<span class="pill amber">duración no documentada</span>`}</h5>
            <p>${linkTerms(txt)}</p>
            <div class="inc-sels">
              <label>Práctica ITIL 4${fwSelect("itil", `data-inc="${id}" data-fw="itil"`, saved[id]?.itil)}</label>
              <label>Objetivo COBIT 2019${fwSelect("cobit", `data-inc="${id}" data-fw="cobit"`, saved[id]?.cobit)}</label>
              <label>Control ISO/IEC 27001:2022${fwSelect("iso", `data-inc="${id}" data-fw="iso"`, saved[id]?.iso)}</label></div>
            <div class="inc-mentor">${twBadge("inc." + id)}${mentorBtn("inc." + id, `Incidente ${id} · ${t}`, txt, "Mentor: revisar mi clasificación")}</div></div>
        </article>`).join("")}</div>
    </div>`;
    makeChart($("#ch-inc"), { type: "bar", data: { labels: known.map((i) => `${i[0]} · ${i[1]}`), datasets: [{ data: known.map((i) => i[3]), backgroundColor: known.map((i) => alpha(INC_COLORS[i[4]] || "#94a3b8", .75)), borderRadius: 6 }] },
      options: { maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => ` ${x.raw} min (${fmt(x.raw / 60, 2)} h)` } } }, scales: { x: { title: { display: true, text: "minutos" } }, y: { ticks: { callback: function (v) { const l = this.getLabelForValue(v); return l.length > 28 ? l.slice(0, 26) + "…" : l; } } } } } }, wsCharts);
    makeChart($("#ch-cat"), { type: "doughnut", data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: Object.keys(cats).map((k) => alpha(INC_COLORS[k] || "#94a3b8", .8)), borderWidth: 0 }] }, options: { maintainAspectRatio: false, cutout: "60%", plugins: { legend: { position: "right" } } } }, wsCharts);
    body.addEventListener("change", (e) => { const t = e.target; if (!t.dataset.inc) return; const v = getInc(c.case_id); v[t.dataset.inc] = { ...(v[t.dataset.inc] || {}), [t.dataset.fw]: t.value }; store.set(c.case_id + ":itil", v); });
  }

  /* ---- Retos ---- */
  function tabRetos(body, c) {
    const d = c.data; const st = store.get(c.case_id + ":q", {});
    body.innerHTML = `<div class="ws-grid">
      <div class="card span-12 central" style="--c:${c.color}"><h4>${icon("target")} Pregunta central del caso</h4><p class="central-q">${esc(d.central)}</p>
        ${d.reasoning.length ? `<h4 style="margin-top:18px">${icon("lightbulb")} Preguntas de razonamiento (del documento oficial)</h4>${list(d.reasoning, "search", "q")}` : ""}
        <div class="analogy" style="margin-top:16px">${icon("book")}<span><b>Principio del caso:</b> ${esc(d.principle)}</span></div></div>
      <div class="card span-6"><h4>${icon("alert")} Restricciones</h4>${list(d.restrictions, "alert", "bad")}</div>
      <div class="card span-6"><h4>${icon("flame")} Condiciones especiales</h4>${list(c.conditions, "zap")}
        <p class="hint">Una alternativa que ignore una restricción no es viable, por buena que sea técnicamente. Recuerda la regla de sustentación: <b>problema → evidencia → impacto → decisión → métrica</b>.</p></div>
      <div class="card span-12"><h4>${icon("target")} Preguntas guía <span class="pill" id="q-count" style="margin-left:auto"></span></h4>
        <p class="muted" style="margin-top:-6px">Responde en borrador aquí. Se guarda en tu navegador y se incluye al exportar la matriz.</p>
        <ol class="q-list">${c.questions.map((q, i) => { const s = st[i] || {}; return `<li class="q-item ${s.done ? "done" : ""}" data-q="${i}"><input type="checkbox" ${s.done ? "checked" : ""} aria-label="Marcar como respondida"><div class="q-text">${linkTerms(q)}</div><textarea placeholder="Tu respuesta o hipótesis…">${esc(s.a || "")}</textarea><div class="q-mentor">${twBadge("q." + i)}${mentorBtn("q." + i, `Pregunta guía ${i + 1}`, q, "Mentor: pista o revisión")}</div></li>`; }).join("")}</ol></div>
    </div>`;
    const count = () => { const s = store.get(c.case_id + ":q", {}); $("#q-count").textContent = `${Object.values(s).filter((x) => x && x.done).length}/${c.questions.length} respondidas`; };
    const save = (li) => { const s = store.get(c.case_id + ":q", {}); s[li.dataset.q] = { done: $("input", li).checked, a: $("textarea", li).value }; store.set(c.case_id + ":q", s); li.classList.toggle("done", $("input", li).checked); count(); };
    body.addEventListener("input", (e) => { const li = e.target.closest("[data-q]"); if (li) save(li); });
    count();
  }

  /* ---- BMM: Business Motivation Model (guiado con opciones del caso) ---- */
  const uid = () => Math.random().toString(36).slice(2, 9);
  // fields: [campo, placeholder, tipo]  tipo: "text" | "kpi" | "plazo"
  // refs:   [campo, lista | "@services" | "@framework", etiqueta]
  const BMM_LISTS = {
    metas:        { title: "Metas", one: "Meta", hint: "Estado deseado, cualitativo y de largo plazo.", fields: [] },
    objetivos:    { title: "Objetivos", one: "Objetivo", hint: "Medibles (SMART): qué se mejora, con qué indicador, qué valor y en qué plazo.", fields: [["m", "Indicador (KPI)", "kpi"], ["v", "Meta numérica (tú la defines)", "text"], ["p", "Plazo", "plazo"]], refs: [["meta", "metas", "Meta que concreta"], ["srv", "@services", "Servicio crítico"]] },
    estrategias:  { title: "Estrategias", one: "Estrategia", hint: "Curso de acción de largo alcance que canaliza esfuerzos hacia una meta.", fields: [], refs: [["meta", "metas", "Meta que apoya"]] },
    tacticas:     { title: "Tácticas", one: "Táctica", hint: "Acciones concretas que implementan una estrategia, logran un objetivo y se apoyan en un marco de referencia.", fields: [], refs: [["est", "estrategias", "Estrategia"], ["obj", "objetivos", "Objetivo"], ["srv", "@services", "Servicio"], ["fw", "@framework", "Marco de referencia"]] },
    politicas:    { title: "Políticas de negocio", one: "Política", hint: "Directrices que orientan o restringen los medios.", fields: [], refs: [["fw", "@framework", "Marco de referencia"]] },
    reglas:       { title: "Reglas de negocio", one: "Regla", hint: "Derivadas de las políticas y verificables (con un umbral o condición concreta).", fields: [], refs: [["pol", "politicas", "Política"]] },
    fortalezas:   { title: "Fortalezas", one: "Fortaleza", hint: "Interno · positivo", fields: [], refs: [["inf", "influenciadores", "Influenciador"]] },
    debilidades:  { title: "Debilidades", one: "Debilidad", hint: "Interno · negativo", fields: [], refs: [["inf", "influenciadores", "Influenciador"]] },
    oportunidades:{ title: "Oportunidades", one: "Oportunidad", hint: "Externo · positivo", fields: [], refs: [["inf", "influenciadores", "Influenciador"]] },
    amenazas:     { title: "Amenazas", one: "Amenaza", hint: "Externo · negativo", fields: [], refs: [["inf", "influenciadores", "Influenciador"]] },
  };
  const INF_CATS = ["Regulación / cumplimiento", "Presupuesto", "Clientes / usuarios", "Proveedores / socios", "Tecnología existente", "Infraestructura", "Capacidades del equipo", "Cultura / hábitos", "Crecimiento / demanda", "Competencia / mercado", "Seguridad / riesgo"];

  /* Opciones que ofrece el caso para cada campo (la guía; el estudiante elige y redacta). */
  function caseFacts(c) {
    const d = c.data;
    return [
      ["Datos del negocio", d.facts.map(([l, v]) => `${l}: ${v}`)],
      ["Backup", d.backup], ["Red y conectividad", d.network], ["Seguridad", d.security], ["Operación de TI", d.operation],
      ["Equipo de TI", [...d.team.map(([r, n]) => `${r}: ${n}`), d.teamNote].filter(Boolean)],
      ["Incidentes", d.incidents.map(([id, t, txt]) => `${id}. ${t}: ${txt}`)],
      ["Restricciones", d.restrictions],
    ];
  }
  function kpiOptions(c) {
    const d = c.data;
    return [["Del caso", [`Disponibilidad de ${d.service.name}`, `MTTR de ${d.service.name}`, `MTBF de ${d.service.name}`, `Ocupación de ${d.storage.name}`,
      ...d.blocks.flatMap((b) => b.rows.filter((r) => typeof r[1] === "number" || Array.isArray(r[1])).map((r) => `${r[0]} · ${b.title}`))]], ["Indicadores de gestión (guía)", window.BMM_GUIDE.kpis]];
  }
  const shortOpt = (t, n = 95) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
  const optgroups = (groups, sel) => groups.filter(([, o]) => o.length).map(([g, o]) => `<optgroup label="${esc(g)}">${o.map((t) => `<option value="${esc(t)}" ${t === sel ? "selected" : ""}>${esc(shortOpt(t))}</option>`).join("")}</optgroup>`).join("");
  const frameworkGroups = () => Object.values(window.FRAMEWORKS).flatMap((fw) => Object.entries(fw.groups).map(([g, o]) => [`${fw.name} — ${g}`, o]));
  function getBmm(c) {
    const b = store.get(c.case_id + ":bmm", null);
    if (b) return b;
    const base = { vision: "", mision: "", influenciadores: [] };
    Object.keys(BMM_LISTS).forEach((k) => (base[k] = []));
    const seen = new Set();
    [...c.data.restrictions.map((t) => ["Restricción", t]), ...c.conditions.map((t) => ["Condición", t])].forEach(([src, t]) => {
      if (seen.has(t)) return; seen.add(t);
      base.influenciadores.push({ id: uid(), t, src, fixed: true, o: "", cat: "" });
    });
    return base;
  }

  function bmmChecks(c, b) {
    const srv = window.CASE_SERVICES[c.case_id].rows;
    const critical = srv.map((r, i) => ({ r, i })).filter(({ r }) => critWeight(r[3]) >= 5);
    const covered = new Set(b.objetivos.map((o) => o.srv).filter((x) => x !== undefined && x !== ""));
    const out = [];
    const add = (ok, t) => out.push({ ok, t });
    add(b.vision.trim().length > 20, "La visión está redactada");
    add(b.mision.trim().length > 20, "La misión está redactada");
    add(b.metas.length >= 2, `Al menos 2 metas (${b.metas.length})`);
    const smart = b.objetivos.filter((o) => o.t && o.m && o.v && o.p).length;
    add(b.objetivos.length >= 3 && smart === b.objetivos.length, `Objetivos SMART completos: ${smart}/${b.objetivos.length} (mínimo 3)`);
    add(b.objetivos.length > 0 && b.objetivos.every((o) => o.meta), "Cada objetivo concreta una meta");
    add(b.estrategias.length > 0 && b.estrategias.every((e) => e.meta), "Cada estrategia apoya una meta");
    add(b.tacticas.length > 0 && b.tacticas.every((t) => t.est && t.obj), "Cada táctica implementa una estrategia y logra un objetivo");
    add(b.tacticas.length > 0 && b.tacticas.every((t) => t.fw), "Cada táctica se apoya en un marco (ITIL, COBIT, ISO 27001 o Tier)");
    const unsup = b.objetivos.filter((o) => !b.tacticas.some((t) => t.obj === o.id));
    add(b.objetivos.length > 0 && !unsup.length, `Objetivos sin tácticas que los logren: ${unsup.length}`);
    const miss = critical.filter(({ i }) => !covered.has(String(i)));
    add(!miss.length, miss.length ? `Servicios críticos sin objetivo asociado: ${miss.map(({ r }) => r[0]).join(", ")}` : "Todos los servicios críticos tienen al menos un objetivo");
    const uncls = b.influenciadores.filter((f) => !f.o || !f.cat).length;
    add(!uncls, `Influenciadores sin clasificar (origen y categoría): ${uncls}`);
    add(["fortalezas", "debilidades", "oportunidades", "amenazas"].every((k) => b[k].length), "La evaluación DOFA tiene los cuatro cuadrantes");
    add(b.politicas.length > 0 && b.reglas.length > 0, "Hay al menos una política y una regla de negocio");
    return out;
  }

  const normalizeTxt = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  /* Constructor guiado del BMM: pasos + banco de evidencias + constructores de frases. */
  const BMM_STEPS = [
    { k: "infl", icon: "zap", t: "Influenciadores", d: "¿Qué afecta a la organización?",
      help: "Un influenciador es algo que puede afectar el logro de los fines o el uso de los medios. Los internos vienen de la organización (infraestructura, equipo, presupuesto); los externos, del entorno (regulación, clientes, proveedores, demanda).",
      ex: "«Backups en el mismo sitio que producción» → Interno · Infraestructura." },
    { k: "dofa", icon: "search", t: "Evaluación DOFA", d: "¿Cómo impacta cada hecho?",
      help: "Evalúa cada hecho: ¿es interno o externo? ¿Ayuda o perjudica? Fortaleza = interno positivo, Debilidad = interno negativo, Oportunidad = externo positivo, Amenaza = externo negativo.",
      ex: "«Existen dos enlaces de Internet» → Fortaleza. «Un único firewall» → Debilidad." },
    { k: "fines", icon: "target", t: "Fines", d: "Visión, metas y objetivos",
      help: "La visión es el futuro deseado. Las metas son cualitativas y de largo plazo. Los objetivos cuantifican una meta: indicador, valor y plazo (SMART), ligados a un servicio crítico.",
      ex: "Meta: «Garantizar la continuidad del portal» → Objetivo: «Alcanzar disponibilidad mensual de __ % en el portal en 6 meses»." },
    { k: "medios", icon: "compass", t: "Medios", d: "Misión, estrategias y tácticas",
      help: "La misión dice qué hace la organización día a día. Una estrategia es el enfoque general hacia una meta; una táctica es la acción concreta que logra un objetivo, apoyada en un marco (ITIL, COBIT, ISO 27001, Tier).",
      ex: "Estrategia «Resiliencia y continuidad» → Táctica «Implementar monitoreo centralizado» (ITIL · Monitoreo y gestión de eventos)." },
    { k: "direct", icon: "book", t: "Directivas", d: "Políticas y reglas",
      help: "Las políticas orientan o restringen cómo se actúa; las reglas de negocio las vuelven verificables con una condición o un umbral concreto.",
      ex: "Política «Gestión de cambios» → Regla «Todo cambio en producción requiere plan de reversa aprobado»." },
    { k: "mapa", icon: "sitemap", t: "Mapa y revisión", d: "Coherencia y trazabilidad",
      help: "Revisa que todo esté conectado: cada objetivo con su meta, su servicio y al menos una táctica; cada táctica con su estrategia y su marco.", ex: "" },
  ];
  const META_VERBS = ["Garantizar", "Mejorar", "Fortalecer", "Asegurar", "Optimizar"];
  const META_TOPICS = ["la continuidad", "la disponibilidad", "la seguridad de la información", "la capacidad", "el control de costos", "la experiencia de los usuarios", "el cumplimiento regulatorio", "el gobierno de TI"];
  const OBJ_VERBS = ["Alcanzar", "Aumentar", "Reducir", "Mantener"];
  const RULE_TEMPLATES = ["Todo cambio en producción requiere ___ antes de ejecutarse.", "El RPO de ___ no superará ___.", "Las copias de seguridad de ___ se prueban cada ___.",
    "Las cuentas de ___ se revisan cada ___ y se desactivan en máximo ___ tras un retiro.", "Todo acceso remoto o administrativo exige ___.", "La ocupación de ___ no debe superar ___ % sin plan de ampliación.",
    "Todo proveedor crítico debe tener SLA con ___."];
  const BMM_DRAFT = {};

  function tabBmm(body, c) {
    const b = getBmm(c);
    const services = window.CASE_SERVICES[c.case_id].rows;
    const D = (BMM_DRAFT[c.case_id] = BMM_DRAFT[c.case_id] || { step: store.get(c.case_id + ":bmmstep", 0), bankTab: 0, bankQ: "", meta: {}, obj: {}, est: {}, tac: {}, pol: {}, reg: {}, fw: { tab: "itil", q: "" }, kpiQ: "" });
    const persist = () => store.set(c.case_id + ":bmm", b);
    const chip = (attr, label, on, extra = "") => `<button type="button" class="bchip ${on ? "on" : ""}" ${attr} ${extra}>${esc(label)}</button>`;
    const refLabel = (list, id) => { const i = b[list].findIndex((x) => x.id === id); return i < 0 ? "" : `#${i + 1} ${b[list][i].t || "(sin texto)"}`; };
    const selRef = (list, val, attr, ph = "— Elige —") => `<select ${attr}><option value="">${ph}</option>${b[list].map((x, i) => `<option value="${x.id}" ${x.id === val ? "selected" : ""}>#${i + 1} ${esc(shortOpt(x.t || "(sin texto)", 70))}</option>`).join("")}</select>`;
    const selSrv = (val, attr) => `<select ${attr}><option value="">— Servicio —</option>${services.map((r, i) => `<option value="${i}" ${String(val) === String(i) ? "selected" : ""}>${esc(r[0])} (${esc(r[3])})</option>`).join("")}</select>`;
    const critSrv = services.map((r, i) => ({ r, i })).filter(({ r }) => critWeight(r[3]) >= 4);

    /* ---------- banco de evidencias (contextual por paso) ---------- */
    const BANK_ROLE = {
      infl: { hint: "Convierte en influenciador cualquier hecho del caso que afecte a la organización.", tab: "Red y conectividad" },
      dofa: { hint: "Clasifica tus influenciadores y los hechos del caso con F · D · O · A.", tab: "Mis influenciadores" },
      fines: { hint: "Elige servicios para el ámbito de las metas o para los objetivos. El resto de hechos te sirve de evidencia al redactar.", tab: "Servicios" },
      medios: { hint: "Usa alternativas candidatas o incidentes como acción de una táctica.", tab: "Alternativas candidatas" },
      direct: { hint: "Cita incidentes, restricciones o hechos de seguridad y backup como motivación de una política.", tab: "Incidentes" },
    };
    const bankGroups = () => {
      const g = [
        ["Servicios", services.map((r, i) => ({ t: `${r[0]} · criticidad ${r[3]} · ${r[2]}`, srv: i, name: r[0] }))],
        ...caseFacts(c).map(([n, it]) => [n, it.map((t) => ({ t }))]),
        ["Alternativas candidatas", c.alternatives.map((k) => ({ t: PATTERNS[k].name }))],
      ];
      if (BMM_STEPS[D.step].k === "dofa") g.unshift(["Mis influenciadores", b.influenciadores.map((f) => ({ t: f.t, infid: f.id }))]);
      return g;
    };
    const DOFA_BTNS = (it) => ["F", "D", "O", "A"].map((q, i) => `<button class="bk-act q${q}" data-bk="dofa" data-q="${["fortalezas", "debilidades", "oportunidades", "amenazas"][i]}" ${it.infid ? `data-infid="${it.infid}"` : ""} title="${["Fortaleza", "Debilidad", "Oportunidad", "Amenaza"][i]}">${q}</button>`).join("");
    const bankActions = (it, group) => {
      const step = BMM_STEPS[D.step].k;
      if (step === "infl") return group === "Restricciones" ? `<span class="muted" style="font-size:11.5px">Ya precargada</span>` : `<button class="bk-act" data-bk="inf">+ Influenciador</button>`;
      if (step === "dofa") return DOFA_BTNS(it);
      if (step === "fines" && group === "Servicios") return `<button class="bk-act" data-bk="scope" data-name="${esc(it.name)}">Ámbito de meta</button><button class="bk-act" data-bk="osrv" data-srv="${it.srv}">Servicio del objetivo</button>`;
      if (step === "medios" && (group === "Alternativas candidatas" || group === "Incidentes")) return `<button class="bk-act" data-bk="tac">Usar como acción</button>`;
      if (step === "direct" && ["Incidentes", "Restricciones", "Seguridad", "Backup", "Operación de TI"].includes(group)) return `<button class="bk-act" data-bk="pol">Citar en política</button>`;
      return "";
    };
    const bankHtml = () => {
      const groups = bankGroups(); const q = normalizeTxt(D.bankQ); const role = BANK_ROLE[BMM_STEPS[D.step].k];
      const g = groups[Math.min(D.bankTab, groups.length - 1)];
      const items = (q ? groups.flatMap(([gn, it]) => it.map((x) => [gn, x])) : g[1].map((x) => [g[0], x])).filter(([, x]) => !q || normalizeTxt(x.t).includes(q));
      return `<div class="bank"><h4>${icon("layers")} Banco de evidencias del caso</h4>
        <p class="bank-role">${icon("lightbulb")}<span>${esc(role.hint)}</span></p>
        <input type="search" class="bank-q" placeholder="Buscar en todo el caso…" value="${esc(D.bankQ)}">
        ${q ? "" : `<div class="bank-tabs">${groups.map(([gn, it], i) => `<button class="${i === Math.min(D.bankTab, groups.length - 1) ? "on" : ""}" data-banktab="${i}">${esc(gn)} <small>${it.length}</small></button>`).join("")}</div>`}
        <div class="bank-list">${items.map(([gn, x]) => { const acts = bankActions(x, gn); return `<div class="bk ${acts ? "" : "ref"}" data-text="${esc(x.t)}">${q ? `<small class="muted">${esc(gn)}</small>` : ""}<p>${esc(x.t)}</p>${acts ? `<div class="bk-acts">${acts}</div>` : ""}</div>`; }).join("") || `<p class="muted">Sin coincidencias.</p>`}</div></div>`;
    };
    const goStep = (i) => {
      D.step = i; store.set(c.case_id + ":bmmstep", i); D.bankQ = "";
      const role = BANK_ROLE[BMM_STEPS[i].k];
      if (role) { const idx = bankGroups().findIndex(([n]) => n === role.tab); D.bankTab = idx < 0 ? 0 : idx; }
    };

    /* ---------- selector de marco ---------- */
    const fwPicker = (current) => {
      const tabs = [["itil", "ITIL 4"], ["cobit", "COBIT 2019"], ["iso", "ISO 27001"], ["tier", "Tier"]];
      const q = normalizeTxt(D.fw.q);
      const opts = Object.entries(window.FRAMEWORKS[D.fw.tab].groups).flatMap(([, o]) => o).filter((x) => !q || normalizeTxt(x).includes(q));
      return `<div class="fwp"><div class="fwp-tabs">${tabs.map(([k, l]) => `<button type="button" class="${D.fw.tab === k ? "on" : ""}" data-fwtab="${k}">${l}</button>`).join("")}<input type="search" data-fwq placeholder="Filtrar…" value="${esc(D.fw.q)}"></div>
        <div class="fwp-list">${opts.map((o) => chip(`data-fwpick="${esc(o)}"`, o, o === current)).join("")}</div></div>`;
    };

    /* ---------- lista editable de ítems ---------- */
    const itemCard = (list, x, i, extra = "") => `<div class="bitem" data-list="${list}" data-id="${x.id}"><span class="bmm-n">${i + 1}</span>
      <div class="bitem-body"><input type="text" data-f="t" value="${esc(x.t || "")}">${extra}</div><button class="rm" data-del="${list}" title="Eliminar">×</button></div>`;
    const items = (list, extraFn = () => "") => b[list].length ? `<div class="bitems">${b[list].map((x, i) => itemCard(list, x, i, extraFn(x))).join("")}</div>` : `<p class="muted empty">Aún no hay ${BMM_LISTS[list].title.toLowerCase()}.</p>`;

    /* ---------- pasos ---------- */
    const stepInfl = () => `
      <div class="card"><h4>${icon("zap")} Influenciadores de ${esc(c.data.org)}</h4>
        <p class="hint" style="margin-top:-6px">Precargados desde las restricciones y condiciones del caso. Marca su origen y su categoría; agrega más desde el banco.</p>
        <div class="infl2">${b.influenciadores.map((f, i) => `<div class="infl2-row" data-inf="${f.id}"><span class="bmm-n">${i + 1}</span>
          <div class="infl2-t">${f.fixed ? `<span class="pill">${esc(f.src)}</span> ${esc(f.t)}` : `<input type="text" data-if="t" value="${esc(f.t)}">`}</div>
          <div class="seg seg-sm">${["Interno", "Externo"].map((o) => `<button type="button" class="${f.o === o ? "on" : ""}" data-io="${o}">${o}</button>`).join("")}</div>
          <select data-if="cat"><option value="">Categoría…</option>${INF_CATS.map((o) => `<option ${f.cat === o ? "selected" : ""}>${o}</option>`).join("")}</select>
          ${f.fixed ? "<span></span>" : `<button class="rm" data-delinf="${f.id}">×</button>`}</div>`).join("")}</div></div>`;

    const stepDofa = () => `
      <div class="card"><h4>${icon("search")} Matriz DOFA</h4>
        <p class="hint" style="margin-top:-6px">En el banco (a la derecha) empieza por <b>Mis influenciadores</b> y clasifícalos con <b>F · D · O · A</b>; luego revisa los hechos del inventario. Después ajusta cada frase con tus palabras.</p>
        <div class="quad">${[["fortalezas", "Fortalezas", "Interno · +"], ["debilidades", "Debilidades", "Interno · −"], ["oportunidades", "Oportunidades", "Externo · +"], ["amenazas", "Amenazas", "Externo · −"]].map(([k, t, s]) => `
          <div class="quad-cell q-${k}"><h5>${t} <small>${s}</small> <span class="pill">${b[k].length}</span></h5>${items(k)}</div>`).join("")}</div></div>`;

    const metaPreview = () => { const m = D.meta; return m.verb && m.topic ? `${m.verb} ${m.topic}${m.scope ? ` de ${m.scope}` : ""}` : ""; };
    const objPreview = () => {
      const o = D.obj; if (!o.verb || !o.kpi) return "";
      const srv = o.srv !== undefined && o.srv !== "" ? services[+o.srv][0] : "";
      const kpi = /^.[A-ZÁÉÍÓÚ0-9]/.test(o.kpi) ? o.kpi : o.kpi.charAt(0).toLowerCase() + o.kpi.slice(1); // respeta siglas (MTTR, RPO…)
      const what = kpi + (srv && !normalizeTxt(kpi).includes(normalizeTxt(srv)) ? ` en ${srv}` : "");
      const v = o.v || "___";
      const when = !o.p ? "" : /^antes/i.test(o.p) ? ` ${o.p.charAt(0).toLowerCase() + o.p.slice(1)}` : o.verb === "Mantener" ? ` durante ${o.p}` : ` en ${o.p}`;
      return { Alcanzar: `Alcanzar ${v} en ${what}`, Aumentar: `Aumentar ${what} hasta ${v}`, Reducir: `Reducir ${what} hasta ${v}`, Mantener: `Mantener ${what} en ${v}` }[o.verb] + when;
    };
    const kpiList = () => { const all = kpiOptions(c); const q = normalizeTxt(D.kpiQ);
      return all.map(([g, o]) => [g, o.filter((x) => !q || normalizeTxt(x).includes(q))]).filter(([, o]) => o.length).map(([g, o]) => `<div class="chips-group"><small>${esc(g)}</small>${o.map((x) => chip(`data-okpi="${esc(x)}"`, x, D.obj.kpi === x)).join("")}</div>`).join(""); };

    const stepFines = () => `
      <div class="card"><h4>${icon("target")} Visión</h4>
        <textarea data-top="vision" placeholder="¿Cómo se ve ${esc(c.data.org)} en el futuro si le va bien?">${esc(b.vision)}</textarea>
        <p class="hint">Ingredientes: ${esc(c.data.org)} · ${esc(c.sector)} · servicios críticos: ${esc(critSrv.filter(({ r }) => critWeight(r[3]) >= 5).map(({ r }) => r[0]).join(", "))}.</p></div>
      <div class="card builder"><h4>${icon("flag" in window.ICONS ? "flag" : "target")} Constructor de metas</h4>
        <div class="bstep"><b>1. Verbo</b><div class="chips">${META_VERBS.map((v) => chip(`data-mverb="${v}"`, v, D.meta.verb === v)).join("")}</div></div>
        <div class="bstep"><b>2. Tema</b><div class="chips">${META_TOPICS.map((v) => chip(`data-mtopic="${v}"`, v, D.meta.topic === v)).join("")}</div></div>
        <div class="bstep"><b>3. Ámbito</b> <small class="muted">(opcional)</small><div class="chips">${chip(`data-mscope=""`, "Toda la organización", !D.meta.scope)}${critSrv.map(({ r }) => chip(`data-mscope="${esc(r[0])}"`, r[0], D.meta.scope === r[0])).join("")}</div></div>
        <div class="preview">${metaPreview() ? esc(metaPreview()) : `<span class="muted">Elige verbo y tema…</span>`}</div>
        <button class="btn btn-sm btn-primary" data-addmeta ${metaPreview() ? "" : "disabled"}>+ Agregar meta</button>
        ${items("metas")}</div>
      <div class="card builder"><h4>${icon("gauge")} Constructor de objetivos SMART</h4>
        <div class="bgrid">
          <label>Meta que concreta${selRef("metas", D.obj.meta, "data-oref=meta")}</label>
          <label>Servicio crítico${selSrv(D.obj.srv, "data-oref=srv")}</label>
        </div>
        <div class="bstep"><b>Verbo</b><div class="chips">${OBJ_VERBS.map((v) => chip(`data-overb="${v}"`, v, D.obj.verb === v)).join("")}</div></div>
        <div class="bstep"><b>Indicador (KPI)</b> <input type="search" class="mini-q" data-kpiq placeholder="Filtrar indicadores…" value="${esc(D.kpiQ)}"><div class="kpi-chips">${kpiList()}</div></div>
        <div class="bgrid">
          <label>Valor meta <small class="muted">(lo defines tú con base en el caso)</small><input type="text" data-ov value="${esc(D.obj.v || "")}" placeholder="p. ej. 99,5 % · 2 h · 80 %"></label>
          <div><b style="font-size:13px">Plazo</b><div class="chips">${window.BMM_GUIDE.plazos.map((p) => chip(`data-oplazo="${esc(p)}"`, p, D.obj.p === p)).join("")}</div></div>
        </div>
        <div class="preview" id="obj-prev">${objPreview() ? esc(objPreview()) : `<span class="muted">Elige verbo e indicador…</span>`}</div>
        <button class="btn btn-sm btn-primary" data-addobj>+ Agregar objetivo</button>
        ${items("objetivos", (x) => `<small class="muted">${esc([refLabel("metas", x.meta) && "Meta " + refLabel("metas", x.meta).split(" ")[0], x.srv !== undefined && x.srv !== "" ? services[+x.srv]?.[0] : "", x.m, x.v, x.p].filter(Boolean).join(" · "))}</small>`)}</div>`;

    const stepMedios = () => `
      <div class="card"><h4>${icon("compass")} Misión</h4>
        <textarea data-top="mision" placeholder="¿Qué hace ${esc(c.data.org)} cada día, para quién y cómo?">${esc(b.mision)}</textarea>
        <p class="hint">Ingredientes: ${esc(c.data.facts.slice(0, 4).map(([l, v]) => `${l}: ${v}`).join(" · "))}.</p></div>
      <div class="card builder"><h4>${icon("layers")} Constructor de estrategias</h4>
        <label>Meta que apoya${selRef("metas", D.est.meta, "data-eref=meta")}</label>
        <div class="bstep"><b>Enfoque</b><div class="chips">${window.BMM_GUIDE.estrategias.map((v) => chip(`data-estfam="${esc(v)}"`, v, D.est.t === v)).join("")}</div></div>
        <input type="text" data-estt value="${esc(D.est.t || "")}" placeholder="…o escribe tu propia estrategia">
        <button class="btn btn-sm btn-primary" data-addest style="margin-top:8px">+ Agregar estrategia</button>
        ${items("estrategias", (x) => x.meta ? `<small class="muted">Apoya: ${esc(refLabel("metas", x.meta))}</small>` : `<small class="pill amber">sin meta</small>`)}</div>
      <div class="card builder"><h4>${icon("zap")} Constructor de tácticas</h4>
        <div class="bgrid">
          <label>Objetivo que logra${selRef("objetivos", D.tac.obj, "data-tref=obj")}</label>
          <label>Estrategia que implementa${selRef("estrategias", D.tac.est, "data-tref=est")}</label>
        </div>
        <div class="bstep"><b>Acción</b> <small class="muted">(desde las alternativas del caso o escrita por ti)</small>
          <div class="chips">${c.alternatives.map((k) => chip(`data-tact="${esc(PATTERNS[k].name)}"`, PATTERNS[k].name, D.tac.t === PATTERNS[k].name)).join("")}</div>
          <input type="text" data-tactt value="${esc(D.tac.t || "")}" placeholder="Describe la acción concreta…"></div>
        <div class="bstep"><b>Marco de referencia</b> ${D.tac.fw ? `<span class="pill">${esc(D.tac.fw)}</span>` : ""}${fwPicker(D.tac.fw)}</div>
        <button class="btn btn-sm btn-primary" data-addtac>+ Agregar táctica</button>
        ${items("tacticas", (x) => `<small class="muted">${esc([x.obj && "Objetivo " + refLabel("objetivos", x.obj).split(" ")[0], x.est && "Estrategia " + refLabel("estrategias", x.est).split(" ")[0], x.fw].filter(Boolean).join(" · ") || "sin vínculos")}</small>`)}</div>`;

    const stepDirect = () => `
      <div class="card builder"><h4>${icon("book")} Constructor de políticas</h4>
        <div class="bstep"><b>Área</b><div class="chips">${window.BMM_GUIDE.politicas.map((v) => chip(`data-polarea="${esc(v)}"`, v, D.pol.area === v)).join("")}</div></div>
        <input type="text" data-polt value="${esc(D.pol.t || "")}" placeholder="Enunciado de la política (qué orienta o restringe)…">
        <div class="bstep"><b>Marco de referencia</b> ${D.pol.fw ? `<span class="pill">${esc(D.pol.fw)}</span>` : ""}${fwPicker(D.pol.fw)}</div>
        <button class="btn btn-sm btn-primary" data-addpol>+ Agregar política</button>
        ${items("politicas", (x) => x.fw ? `<small class="muted">${esc(x.fw)}</small>` : "")}</div>
      <div class="card builder"><h4>${icon("check")} Constructor de reglas de negocio</h4>
        <label>Política de la que se deriva${selRef("politicas", D.reg.pol, "data-rref=pol")}</label>
        <div class="bstep"><b>Plantillas</b> <small class="muted">(completa los ___ con datos del caso)</small><div class="chips">${RULE_TEMPLATES.map((v) => chip(`data-regtpl="${esc(v)}"`, v, false)).join("")}</div></div>
        <input type="text" data-regt value="${esc(D.reg.t || "")}" placeholder="Regla verificable…">
        <button class="btn btn-sm btn-primary" data-addreg style="margin-top:8px">+ Agregar regla</button>
        ${items("reglas", (x) => x.pol ? `<small class="muted">De: ${esc(refLabel("politicas", x.pol))}</small>` : `<small class="pill amber">sin política</small>`)}</div>`;

    const stepMapa = () => {
      const ch = bmmChecks(c, b); const ok = ch.filter((x) => x.ok).length; const pct = Math.round(ok / ch.length * 100);
      return `<div class="ws-grid">
        <div class="card span-4"><h4>${icon("check")} Coherencia del modelo</h4>
          <div class="kpi ${pct >= 80 ? "good" : pct >= 50 ? "warn" : "bad"}" style="margin-bottom:10px"><b>${pct} %</b><span>${ok} de ${ch.length} verificaciones</span></div>
          <ul class="check-list">${ch.map((x) => `<li class="${x.ok ? "ok" : ""}">${icon(x.ok ? "check" : "alert")}<span>${esc(x.t)}</span></li>`).join("")}</ul>
          <div class="row-actions"><button class="btn btn-sm btn-primary" data-go="tutor">${icon("zap")} Pedir retroalimentación al Tutor IA</button></div></div>
        <div class="card span-8"><h4>${icon("sitemap")} Mapa BMM</h4>
          <div class="bmm-canvas">
            <div class="bc ends"><b>FINES</b><div><i>Visión</i> ${esc(shortOpt(b.vision || "—", 140))}</div>${b.metas.map((m) => `<div class="bc-meta"><i>Meta</i> ${esc(m.t)}${b.objetivos.filter((o) => o.meta === m.id).map((o) => `<div class="bc-obj"><i>Objetivo</i> ${esc(o.t)}</div>`).join("")}</div>`).join("")}</div>
            <div class="bc means"><b>MEDIOS</b><div><i>Misión</i> ${esc(shortOpt(b.mision || "—", 140))}</div>${b.estrategias.map((e) => `<div class="bc-meta"><i>Estrategia</i> ${esc(e.t)}${b.tacticas.filter((t) => t.est === e.id).map((t) => `<div class="bc-obj"><i>Táctica</i> ${esc(t.t)}${t.fw ? ` <span class="pill">${esc(t.fw.split(" ")[0])}</span>` : ""}</div>`).join("")}</div>`).join("")}</div>
            <div class="bc infl"><b>INFLUENCIADORES</b><div>${b.influenciadores.filter((f) => f.o).length}/${b.influenciadores.length} clasificados · ${b.influenciadores.filter((f) => f.o === "Interno").length} internos · ${b.influenciadores.filter((f) => f.o === "Externo").length} externos</div></div>
            <div class="bc eval"><b>DOFA</b><div>F ${b.fortalezas.length} · D ${b.debilidades.length} · O ${b.oportunidades.length} · A ${b.amenazas.length}</div></div>
          </div></div>
        <div class="card span-12"><h4>${icon("layers")} Trazabilidad objetivo → servicio → tácticas</h4>${b.objetivos.length ? `<div class="heat-scroll"><table class="rubric inv"><thead><tr><th>Objetivo</th><th>Meta</th><th>Servicio</th><th>Tácticas y marco</th></tr></thead><tbody>${b.objetivos.map((o) => { const tac = b.tacticas.filter((t) => t.obj === o.id);
          return `<tr><td><b>${esc(o.t)}</b></td><td>${esc(refLabel("metas", o.meta) || "—")}</td><td>${o.srv !== undefined && o.srv !== "" ? esc(services[+o.srv]?.[0]) : `<span class="pill amber">sin servicio</span>`}</td><td>${tac.length ? tac.map((t) => `${esc(t.t)}${t.fw ? ` <span class="pill">${esc(t.fw)}</span>` : ""}`).join("<br>") : `<span class="pill red">ninguna</span>`}</td></tr>`; }).join("")}</tbody></table></div>` : `<p class="muted">Aún no hay objetivos.</p>`}</div></div>`;
    };

    /* ---------- render ---------- */
    function render() {
      const st = BMM_STEPS[D.step];
      const counts = [b.influenciadores.filter((f) => f.o && f.cat).length + "/" + b.influenciadores.length,
        ["fortalezas", "debilidades", "oportunidades", "amenazas"].reduce((s, k) => s + b[k].length, 0), b.metas.length + b.objetivos.length,
        b.estrategias.length + b.tacticas.length, b.politicas.length + b.reglas.length, Math.round(bmmChecks(c, b).filter((x) => x.ok).length / bmmChecks(c, b).length * 100) + "%"];
      const main = { infl: stepInfl, dofa: stepDofa, fines: stepFines, medios: stepMedios, direct: stepDirect }[st.k];
      body.innerHTML = `
        <div class="stepper">${BMM_STEPS.map((s, i) => `<button class="stp ${i === D.step ? "on" : ""} ${i < D.step ? "done" : ""}" data-step="${i}"><span class="stp-n">${i + 1}</span><span><b>${s.t}</b><small>${s.d}</small></span><em>${counts[i]}</em></button>`).join("")}</div>
        <div class="step-help"><div>${icon(st.icon)}</div><p><b>${st.t}.</b> ${esc(st.help)}${st.ex ? `<br><span class="muted">Ejemplo genérico: ${esc(st.ex)}</span>` : ""}</p>
          <button class="btn btn-sm btn-ghost" id="bmm-help">${icon("info")} ¿Qué es el BMM?</button></div>
        ${(() => { const L = { infl: ["influenciadores"], dofa: ["fortalezas", "debilidades", "oportunidades", "amenazas"], fines: ["vision", "mision", "metas", "objetivos"], medios: ["estrategias", "tacticas"], direct: ["politicas", "reglas"] }[st.k] || [];
          return L.length ? twBadges(L.map((k) => "bmm." + k), L.map((k) => BMM_LISTS[k]?.title || (k === "vision" ? "Visión" : k === "mision" ? "Misión" : k))) : ""; })()}
        ${st.k === "mapa" ? stepMapa() : `<div class="bmm-layout"><div class="bmm-main-col">${main()}</div><aside class="bmm-side">${bankHtml()}</aside></div>`}
        <div class="step-nav">${D.step > 0 ? `<button class="btn btn-sm btn-ghost" data-step="${D.step - 1}">← ${BMM_STEPS[D.step - 1].t}</button>` : "<span></span>"}
          ${D.step < BMM_STEPS.length - 1 ? `<button class="btn btn-sm btn-primary" data-step="${D.step + 1}">${BMM_STEPS[D.step + 1].t} →</button>` : ""}</div>`;
      hydrate(body);
    }
    const setPreview = () => { const el = $("#obj-prev", body); if (el) el.innerHTML = objPreview() ? esc(objPreview()) : `<span class="muted">Elige verbo e indicador…</span>`; };
    const add = (list, obj) => { b[list].push({ id: uid(), ...obj }); persist(); };
    const need = (cond, msg) => { if (!cond) toast(msg); return cond; };

    body.addEventListener("click", (e) => {
      const t = e.target.closest("button"); if (!t) return;
      const ds = t.dataset;
      if (ds.step !== undefined) { goStep(+ds.step); render(); body.scrollTop = 0; return; }
      if (t.id === "bmm-help") return openModal(`<div class="m-head"><div class="m-ico">${icon("compass")}</div><div><div class="kick">Business Motivation Model (OMG)</div><h2 id="modal-title">¿Qué es el BMM?</h2></div></div>
        <div class="bmm-diagram"><div class="bd ends"><b>FINES</b><span>Visión</span><span>Metas</span><span>Objetivos medibles</span></div><div class="bd means"><b>MEDIOS</b><span>Misión</span><span>Estrategias → Tácticas</span><span>Políticas → Reglas</span></div>
        <div class="bd infl"><b>INFLUENCIADORES</b><span>Internos</span><span>Externos</span></div><div class="bd eval"><b>EVALUACIONES</b><span>DOFA</span></div></div>
        <div class="m-sec"><p>Conecta <b>por qué</b> existe la organización (fines) con <b>cómo</b> lo logra (medios), considerando lo que la <b>influye</b> y cómo lo <b>evalúa</b>. En este taller, cada objetivo se liga a un servicio crítico y cada táctica a un marco (ITIL, COBIT, ISO/IEC 27001 o Tier): así se justifican las decisiones de infraestructura.</p></div>`, "#a78bfa");
      if (ds.banktab !== undefined) { D.bankTab = +ds.banktab; render(); return; }
      // Banco → paso actual
      if (ds.bk) {
        const text = t.closest(".bk").dataset.text;
        if (ds.bk === "inf") { b.influenciadores.push({ id: uid(), t: text, src: "Del caso", fixed: false, o: "", cat: "" }); persist(); toast("Influenciador agregado: marca su origen y categoría"); }
        if (ds.bk === "dofa") { add(ds.q, { t: text, inf: ds.infid || "" }); toast(`Agregado a ${ds.q}`); }
        if (ds.bk === "scope") { D.meta.scope = ds.name; toast("Ámbito elegido en el constructor de metas"); }
        if (ds.bk === "osrv") { D.obj.srv = ds.srv; toast("Servicio elegido en el constructor de objetivos"); }
        if (ds.bk === "tac") { D.tac.t = text.replace(/^[A-E]\.\s*/, "").split(":")[0]; toast("Acción cargada en el constructor de tácticas"); }
        if (ds.bk === "pol") { D.pol.t = `${(D.pol.t || "").trim()}${D.pol.t ? " " : ""}(motivada por: ${text.length > 90 ? text.slice(0, 89) + "…" : text})`; toast("Motivación agregada a la política"); }
        render(); return;
      }
      if (ds.io) { const f = b.influenciadores.find((x) => x.id === t.closest("[data-inf]").dataset.inf); f.o = ds.io; persist(); render(); return; }
      if (ds.delinf) { b.influenciadores = b.influenciadores.filter((f) => f.id !== ds.delinf); persist(); render(); return; }
      if (ds.del) { const it = t.closest("[data-id]"); b[ds.del] = b[ds.del].filter((x) => x.id !== it.dataset.id); persist(); render(); return; }
      // Constructores
      if ("mverb" in ds) { D.meta.verb = ds.mverb; render(); return; }
      if ("mtopic" in ds) { D.meta.topic = ds.mtopic; render(); return; }
      if ("mscope" in ds) { D.meta.scope = ds.mscope; render(); return; }
      if ("addmeta" in ds) { add("metas", { t: metaPreview() }); D.meta = {}; render(); return; }
      if ("overb" in ds) { D.obj.verb = ds.overb; render(); return; }
      if ("okpi" in ds) { D.obj.kpi = ds.okpi; render(); return; }
      if ("oplazo" in ds) { D.obj.p = ds.oplazo; render(); return; }
      if ("addobj" in ds) {
        if (!need(D.obj.verb && D.obj.kpi, "Elige verbo e indicador") || !need(D.obj.v, "Escribe el valor meta") || !need(D.obj.p, "Elige el plazo")) return;
        add("objetivos", { t: objPreview(), m: D.obj.kpi, v: D.obj.v, p: D.obj.p, meta: D.obj.meta || "", srv: D.obj.srv ?? "" });
        D.obj = { meta: D.obj.meta, srv: D.obj.srv }; render(); return; }
      if ("estfam" in ds) { D.est.t = ds.estfam; render(); return; }
      if ("addest" in ds) { if (!need(D.est.t, "Elige o escribe la estrategia")) return; add("estrategias", { t: D.est.t, meta: D.est.meta || "" }); D.est = { meta: D.est.meta }; render(); return; }
      if ("tact" in ds) { D.tac.t = ds.tact; render(); return; }
      if ("fwtab" in ds) { D.fw.tab = ds.fwtab; D.fw.q = ""; render(); return; }
      if ("fwpick" in ds) { const target = BMM_STEPS[D.step].k === "direct" ? D.pol : D.tac; target.fw = ds.fwpick; render(); return; }
      if ("addtac" in ds) {
        if (!need(D.tac.t, "Elige o describe la acción") || !need(D.tac.obj, "Elige el objetivo que logra")) return;
        const o = b.objetivos.find((x) => x.id === D.tac.obj);
        add("tacticas", { t: D.tac.t, obj: D.tac.obj, est: D.tac.est || "", fw: D.tac.fw || "", srv: o?.srv ?? "" }); D.tac = {}; render(); return; }
      if ("polarea" in ds) { D.pol.area = ds.polarea; if (!D.pol.t) D.pol.t = `Política de ${ds.polarea.toLowerCase()}: `; render(); return; }
      if ("addpol" in ds) { if (!need(D.pol.t || D.pol.area, "Elige el área o escribe la política")) return; add("politicas", { t: D.pol.t || `Política de ${D.pol.area}`, fw: D.pol.fw || "" }); D.pol = {}; render(); return; }
      if ("regtpl" in ds) { D.reg.t = ds.regtpl; render(); const inp = $("[data-regt]", body); inp.focus(); inp.setSelectionRange(inp.value.indexOf("___"), inp.value.indexOf("___") + 3); return; }
      if ("addreg" in ds) { if (!need(D.reg.t && !D.reg.t.includes("___"), "Completa los ___ de la regla")) return; add("reglas", { t: D.reg.t, pol: D.reg.pol || "" }); D.reg = { pol: D.reg.pol }; render(); return; }
    });
    body.addEventListener("input", (e) => {
      const t = e.target, ds = t.dataset;
      if (ds.top) { b[ds.top] = t.value; persist(); return; }
      if (t.classList.contains("bank-q")) { D.bankQ = t.value; const pos = t.selectionStart; render(); const q = $(".bank-q", body); q.focus(); q.setSelectionRange(pos, pos); return; }
      if ("fwq" in ds) { D.fw.q = t.value; const pos = t.selectionStart; render(); const q = $("[data-fwq]", body); q.focus(); q.setSelectionRange(pos, pos); return; }
      if ("kpiq" in ds) { D.kpiQ = t.value; const pos = t.selectionStart; render(); const q = $("[data-kpiq]", body); q.focus(); q.setSelectionRange(pos, pos); return; }
      if ("ov" in ds) { D.obj.v = t.value; setPreview(); return; }
      if ("estt" in ds) { D.est.t = t.value; return; }
      if ("tactt" in ds) { D.tac.t = t.value; return; }
      if ("polt" in ds) { D.pol.t = t.value; return; }
      if ("regt" in ds) { D.reg.t = t.value; return; }
      if (ds.f === "t") { const it = t.closest("[data-id]"); b[it.dataset.list].find((x) => x.id === it.dataset.id).t = t.value; persist(); return; }
      if (ds.if === "t") { b.influenciadores.find((f) => f.id === t.closest("[data-inf]").dataset.inf).t = t.value; persist(); }
    });
    body.addEventListener("change", (e) => {
      const t = e.target, ds = t.dataset;
      if (ds.if === "cat") { b.influenciadores.find((f) => f.id === t.closest("[data-inf]").dataset.inf).cat = t.value; persist(); render(); return; }
      if (ds.oref) { D.obj[ds.oref] = t.value; setPreview(); return; }
      if (ds.eref) { D.est[ds.eref] = t.value; return; }
      if (ds.tref) { D.tac[ds.tref] = t.value; return; }
      if (ds.rref) { D.reg[ds.rref] = t.value; return; }
    });
    if (!D.bankInit) { goStep(D.step); D.bankInit = true; }
    render();
  }

  /* ---- Tutor IA (vía backend del curso) ---- */
  const API_BASE = ((window.INFRALAB_CONFIG || {}).API_BASE || "").replace(/\/+$/, "");
  const LEVELS = ["Insuficiente", "En desarrollo", "Satisfactorio", "Excelente"];
  const levelClass = (l) => ({ Insuficiente: "red", "En desarrollo": "amber", Satisfactorio: "green", Excelente: "green" }[l] || "");
  const TUTOR_SECTIONS = [
    ["preguntas", "Preguntas guía"], ["bmm", "BMM"], ["calculos", "Cálculos del verificador"], ["itil", "Incidentes: ITIL · COBIT · ISO"], ["tier", "Redundancia e instalación"],
    ["laboratorio", "Laboratorio (cadenas de servicios)"], ["matriz", "Matriz de decisión"], ["libre", "Mi propuesta / pregunta"],
  ];
  function getStudent() {
    let s = store.get("student", null);
    if (!s) { s = { id: (crypto.randomUUID ? crypto.randomUUID() : uid() + uid()), name: "", group: "", email: "" }; store.set("student", s); }
    return s;
  }
  function tutorContent(c, sections, free) {
    const q = store.get(c.case_id + ":q", {}), calc = store.get(c.case_id + ":calc", {}), itil = getInc(c.case_id);
    const out = {};
    if (sections.includes("preguntas")) out.preguntas = c.questions.map((qq, i) => ({ pregunta: qq, respuesta: q[i]?.a || "", marcada: !!q[i]?.done }));
    if (sections.includes("bmm")) { const b = store.get(c.case_id + ":bmm", null); if (b) out.bmm = b; }
    if (sections.includes("calculos")) out.calculos = CALC_FIELDS.map(([k, l, u]) => ({ indicador: l, valor_estudiante: calc[k] ?? null, unidad: u, verificado_correcto: !!calc[k + "_ok"] }));
    if (sections.includes("itil")) out.clasificacion_incidentes = c.data.incidents.map(([id, t]) => ({ incidente: `${id}. ${t}`, itil: itil[id]?.itil || "", cobit: itil[id]?.cobit || "", iso27001: itil[id]?.iso || "" }));
    if (sections.includes("tier")) { const tr = store.get(c.case_id + ":tier", null); if (tr) out.tier = RD.norm(tr); }
    if (sections.includes("laboratorio")) out.laboratorio = labChainsFor(c.case_id);
    if (sections.includes("matriz")) { const m = store.get(c.case_id + ":matrix", null); if (m) out.matriz = m; }
    if (sections.includes("libre") && free.trim()) out.propuesta_libre = free.trim();
    return out;
  }
  const tutorContext = (c) => ({
    caso: c.case_id, titulo: c.title, organizacion: c.data.org, sector: c.sector, reto: c.challenge_type,
    pregunta_central: c.data.central, preguntas_razonamiento: c.data.reasoning, principio: c.data.principle,
    restricciones: c.data.restrictions, servicios: window.CASE_SERVICES[c.case_id].rows.map((r) => ({ servicio: r[0], criticidad: r[3] })),
    servicio_medido: { nombre: c.data.service.name, periodo_h: c.data.service.window, caida_h: c.data.service.down, incidentes: c.data.service.inc, recuperacion_h: c.data.service.rec },
    incidentes: c.data.incidents.map(([id, t]) => `${id}. ${t}`),
  });

  const SRC = {};
  const openSource = (f) => openModal(`<div class="m-head"><div class="m-ico">${icon("book")}</div><div><div class="kick">${esc(f.framework)} · ${esc(f.id)}</div><h2 id="modal-title">${esc(f.title)}</h2></div></div>
    <div class="m-sec"><p>${esc(f.text)}</p></div><p class="hint">Resumen académico de la base de conocimiento del curso, no el texto oficial de la norma o el marco.</p>`, "#a78bfa");
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-src]"); if (b && SRC[b.dataset.src]) openSource(SRC[b.dataset.src]); });
  function feedbackHtml(fb, when) {
    if (!fb) return "";
    return `<div class="fb">
      <div class="fb-head"><span class="pill ${levelClass(fb.nivel_global)}">${esc(fb.nivel_global || "—")}</span>${when ? `<span class="muted">${esc(when)}</span>` : ""}</div>
      ${fb.alerta ? `<div class="notice" style="margin:10px 0">${icon("alert")}<span>${esc(fb.alerta)}</span></div>` : ""}
      ${fb.resumen ? `<p class="fb-sum">${esc(fb.resumen)}</p>` : ""}
      ${(fb.criterios || []).length ? `<div class="heat-scroll"><table class="rubric inv fb-table"><thead><tr><th>Criterio</th><th>Nivel</th><th>Comentario</th></tr></thead><tbody>${fb.criterios.map((k) => `<tr><td>${esc(k.criterio)}</td><td><span class="pill ${levelClass(k.nivel)}">${esc(k.nivel)}</span></td><td>${esc(k.comentario)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <div class="m-two">
        ${(fb.fortalezas || []).length ? `<div><h5>${icon("check")} Fortalezas</h5>${list(fb.fortalezas, "check")}</div>` : ""}
        ${(fb.mejoras || []).length ? `<div><h5>${icon("alert")} Para mejorar</h5>${list(fb.mejoras, "alert", "bad")}</div>` : ""}
      </div>
      ${(fb.preguntas_guia || []).length ? `<h5>${icon("search")} Preguntas para seguir pensando</h5>${list(fb.preguntas_guia, "search", "q")}` : ""}
      ${(fb._fuentes || []).length ? `<h5>${icon("book")} Fuentes consultadas (RAG)</h5><div class="src-chips">${fb._fuentes.map((f) => { SRC[f.id] = f; return `<button class="src-chip ${f.cited ? "cited" : ""}" data-src="${esc(f.id)}" title="${esc(f.framework)}">${esc(f.id)} · ${esc(f.title.slice(0, 40))}</button>`; }).join("")}</div><p class="hint">Resaltadas: las que el tutor citó. Toca una fuente para leerla.</p>` : ""}
    </div>`;
  }

  function tabTutor(body, c) {
    const st = getStudent();
    const qDone = Object.values(store.get(c.case_id + ":q", {})).filter((x) => x && x.a).length;
    const counts = { preguntas: `${qDone}/${c.questions.length} con respuesta`, bmm: store.get(c.case_id + ":bmm", null) ? "con avance" : "sin iniciar",
      calculos: `${CALC_FIELDS.filter(([k]) => store.get(c.case_id + ":calc", {})[k + "_ok"]).length} verificados`, itil: `${Object.values(getInc(c.case_id)).filter((v) => v.itil || v.cobit || v.iso).length}/${c.data.incidents.length} clasificados`, tier: RD.done(store.get(c.case_id + ":tier", null)) ? "completo" : tierGet(c.case_id).actual ? "en desarrollo" : "sin responder",
      laboratorio: `${labChainsFor(c.case_id).length} servicios analizados`, matriz: `${(store.get(c.case_id + ":matrix", null)?.alts || []).length} alternativas`, libre: "" };
    const lastSel = store.get("tutor:sections", ["preguntas", "bmm", "libre"]);
    body.innerHTML = `<div class="ws-grid">
      <div class="span-12 notice info">${icon("lightbulb")}<span><b>Mentor y Tutor IA con RAG.</b> El <b>Mentor</b> te acompaña ítem por ítem (pistas y revisión de cada respuesta) y el <b>Tutor</b> hace una revisión integral: revisa lo que has trabajado en este caso y te da retroalimentación formativa apoyada en ISO/IEC 27001:2022, ITIL 4, COBIT 2019, Tier, BMM y el expediente del caso, citando las fuentes. <b>No te dará la solución</b>: su trabajo es ayudarte a sustentar mejor (problema → evidencia → impacto → decisión → métrica). Para usarlo ingresa con el código de tu equipo. Tus respuestas se envían al servidor del curso y a un servicio externo de modelo de lenguaje para generar la retroalimentación, y tu docente puede consultarlas.</span></div>
      ${API_BASE ? "" : `<div class="span-12 notice">${icon("alert")}<span><b>El servidor del curso no está disponible.</b> Avisa a tu docente. Mientras tanto puedes seguir trabajando: todo se guarda en tu navegador.</span></div>`}
      <div class="card span-12 mentor-card"><h4>${icon("lightbulb")} Mentor IA · seguimiento de tu caso</h4>
        <p class="muted" style="margin-top:-6px">El avance del <b>trabajo del equipo</b> (el mismo para todos los integrantes). El Mentor trabaja ítem por ítem: <b>dónde buscar</b>, <b>pistas graduadas</b> y <b>revisión</b> con el porqué, sin darte la solución. También lo encuentras junto a cada ítem.</p>
        <p id="mentor-note"></p><div id="mentor-panel"></div></div>
      <div class="card span-4"><h4>${icon("users")} Mi equipo</h4><div class="team-card">${teamCardHtml()}</div>
        <p class="hint" id="api-status">${API_BASE ? "Comprobando conexión con el servidor…" : ""}</p></div>
      <div class="card span-8"><h4>${icon("chart")} Revisiones integrales del tutor</h4>
        <p class="muted" style="margin-top:-6px">La revisión integral se pide desde el panel <b>Mentor IA · seguimiento de tu caso</b> cuando el equipo llega al 80 % y ninguna sección está en cero. Cada equipo tiene <b>2 por caso</b>.</p>
        <div class="chart-box short"><canvas id="ch-tutor"></canvas></div><div id="tutor-hist"></div></div>
      <div class="card span-12"><h4>${icon("book")} Biblioteca de conocimiento (RAG)</h4>
        <p class="muted" style="margin-top:-6px">La misma base en la que se apoya el tutor: ISO/IEC 27001:2022, ITIL 4, COBIT 2019, Tier, BMM, la metodología del curso y el expediente de este caso. Consultarla no gasta solicitudes al tutor.</p>
        <div class="kb-bar"><input type="search" id="kb-q" placeholder="p. ej. copias de seguridad, gestión de cambios, Tier III, objetivos SMART…">
          <select id="kb-fw"><option value="">Todas las fuentes</option>${["ISO/IEC 27001:2022", "ITIL 4", "COBIT 2019", "Tier (Uptime Institute)", "Business Motivation Model", "Metodología del curso"].map((f) => `<option>${f}</option>`).join("")}</select>
          <button class="btn btn-sm" id="kb-go" ${API_BASE ? "" : "disabled"}>Buscar</button></div>
        <div class="kb-results" id="kb-out"></div></div>
    </div>`;

    const saveStudent = () => { const t = teamSession(); if (t) { st.name = `${t.member.firstname} ${t.member.lastname} · ${t.team.name}`; st.group = `NRC ${t.team.nrc}`; st.email = t.member.email; store.set("student", st); } };

    let histChart = null;
    const renderHistory = (items) => {
      store.set("tutor:" + c.case_id, items.slice(0, 30));
      $("#tutor-hist").innerHTML = items.length ? items.map((h, i) => `<details class="hist" ${i === 0 ? "open" : ""}><summary><span class="pill ${levelClass(h.level)}">${esc(h.level || "—")}</span> ${esc(new Date(h.created_at).toLocaleString("es-CO"))} · ${esc((h.sections || []).join(", "))}</summary>${feedbackHtml(h.feedback)}</details>`).join("")
        : `<p class="muted">Aún no has solicitado retroalimentación en este caso.</p>`;
      hydrate($("#tutor-hist"));
      const pts = [...items].reverse();
      const data = { labels: pts.map((_, i) => "Intento " + (i + 1)), datasets: [{ label: "Nivel global", data: pts.map((h) => LEVELS.indexOf(h.level) + 1), borderColor: c.color, backgroundColor: alpha(c.color, .2), fill: true, tension: .3 }] };
      if (histChart) { histChart.data = data; histChart.update(); }
      else histChart = makeChart($("#ch-tutor"), { type: "line", data, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 4, ticks: { stepSize: 1, callback: (v) => LEVELS[v - 1] || "" } } } } }, wsCharts);
    };
    renderHistory(store.get("tutor:" + c.case_id, []));
    refreshMentorPanel();

    if (API_BASE) {
      fetch(API_BASE + "/api/health").then((r) => r.json()).then((h) => { $("#api-status").innerHTML = h.ok && h.llm_configured ? `<span class="pill green">Servidor conectado</span>` : `<span class="pill amber">Servidor sin acceso al modelo de lenguaje</span>`; })
        .catch(() => { $("#api-status").innerHTML = `<span class="pill red">No se pudo contactar el servidor</span>`; });
      if (teamSession()) fetch(`${API_BASE}/api/history?case_id=${c.case_id}`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && d.items) renderHistory(d.items); }).catch(() => {});
    }

    const kbSearch = async () => {
      const q = $("#kb-q").value.trim(); if (!q || !API_BASE) return;
      $("#kb-out").innerHTML = `<p class="muted">Buscando…</p>`;
      try {
        const r = await fetch(`${API_BASE}/api/knowledge/search?q=${encodeURIComponent(q)}&framework=${encodeURIComponent($("#kb-fw").value)}&case_id=${c.case_id}`);
        const d = await r.json();
        $("#kb-out").innerHTML = d.items.length ? d.items.map((f) => { SRC[f.id] = f; return `<div class="kb-item"><b>[${esc(f.id)}]</b> <span class="pill">${esc(f.framework)}</span> <b style="color:var(--text)">${esc(f.title)}</b><p style="margin:6px 0 0">${esc(f.text.length > 420 ? f.text.slice(0, 419) + "…" : f.text)}</p><button class="btn btn-sm btn-ghost" data-src="${esc(f.id)}" style="margin-top:6px">Leer completo</button></div>`; }).join("") : `<p class="muted">Sin resultados. Prueba con otras palabras.</p>`;
      } catch { $("#kb-out").innerHTML = `<p class="muted">No se pudo consultar la biblioteca.</p>`; }
    };
    $("#kb-go").addEventListener("click", kbSearch);
    $("#kb-q").addEventListener("keydown", (e) => { if (e.key === "Enter") kbSearch(); });

  }

  /* ---- Alternativas ---- */
  function tabAlternativas(body, c) {
    body.innerHTML = `<div class="ws-grid">
      <div class="span-12 notice">${icon("puzzle")}<span><b>Alternativas candidatas para ${esc(c.title)}.</b> No es la solución: algunas <b>no aplican</b>, otras son <b>insuficientes por sí solas</b> y otras violan una restricción. Tu tarea es seleccionar, combinar, descartar y justificar. También puedes proponer alternativas propias en la matriz.</span></div>
      <div class="span-12 pattern-grid">${c.alternatives.map((k) => patCard(k, c.case_id)).join("")}</div>
      <div class="card span-12"><h4>${icon("lightbulb")} Para armar una alternativa completa</h4>
        ${list(["Una alternativa suele combinar 2 a 4 patrones (tecnología + proceso + personas).", "Cada alternativa debe atacar al menos un SPOF o riesgo concreto del caso: nómbralo.", "Estima el costo relativo y el tiempo de implementación: ¿cabe en el presupuesto y en las ventanas de cambio?", "Declara qué riesgo nuevo introduce (nuevo SPOF, dependencia de proveedor, complejidad).", "Diferencia bien tus alternativas: p. ej. una conservadora, una intermedia y una transformadora."], "check")}
        <div class="row-actions"><button class="btn btn-primary" data-go="matriz">Ir a mi matriz de decisión ${icon("arrow")}</button></div></div>
    </div>`;
  }

  /* ---- Registro de hallazgos: la base de la matriz ----
     Sale del trabajo del equipo (redundancia, cálculos, incidentes, BMM, parte B). El equipo confirma, descarta con una
     razón y marca sus 3 más críticos. Estado del equipo en «<caso>:findings» (ítem mat.findings). */
  const FD = window.FINDINGS;
  const fdState = (cid) => { const s = store.get(cid + ":findings", null) || {}; return { st: s.st || {}, seen: s.seen || null, links: s.links || {}, lk: s.lk || {}, rows: s.rows || [] }; };
  // Filas del registro tal como se guardan en el servidor: de ahí salen el progreso y lo que revisa el Tutor.
  const fdRows = (rows) => rows.map((r) => ({ id: r.id, t: fdText(r), l: r.layer || "", k: r.kind, o: r.origin.join(" · "), m: r.manual || [], i: r.incs || [], c: r.comp || [] }));
  function fdBuild(c) {
    const cid = c.case_id, mc = mentorCache(cid);
    return FD.build(c, window.CASE_SERVICES[cid]?.rows || [], { tier: tierGet(cid), calc: store.get(cid + ":calc", {}), inc: getInc(cid), bmm: store.get(cid + ":bmm", null),
      bad: Object.keys(mc).filter((k) => k.startsWith("calc.") && mc[k]?.best === "incorrecto"), lab: labChainsFor(cid).length, links: fdState(cid).links });
  }
  const fdText = (r) => r.text + (r.effects.length ? " → " + r.effects.join(" y ") : "");
  function findingsCardHtml(c) {
    const cid = c.case_id, res = fdBuild(c), fs = fdState(cid), okN = res.pieces.filter((p) => p.ok).length;
    const live = res.rows.map((r) => ({ ...r, s: fs.st[r.id] || {} }));
    const crit = live.filter((r) => r.s.crit && r.s.s !== "d").length;
    // Qué cambió desde la última vez que el equipo vio el registro (porque corrigió un punto anterior).
    let changes = [];
    if (fs.seen) {
      const now = Object.fromEntries(res.rows.map((r) => [r.id, fdText(r)]));
      changes = [...Object.keys(now).filter((id) => !(id in fs.seen)).map((id) => `Nuevo: ${now[id]}`),
        ...Object.keys(now).filter((id) => id in fs.seen && fs.seen[id] !== now[id]).map((id) => `Cambió: ${now[id]}`),
        ...Object.keys(fs.seen).filter((id) => !(id in now)).map((id) => `Ya no aplica: ${fs.seen[id]}`)];
    }
    const piece = (p) => p.ok ? `<span class="pill green">${icon("check")} ${esc(p.label)}</span>`
      : `<a href="#" class="pill ${p.required ? "red" : "amber"}" data-pgo="${p.tab}">${esc(p.label)}${p.detail ? ` · ${esc(p.detail)}` : ""} →</a>`;
    const layerSel = (r, cur) => `<select class="fd-layer" data-fdlayer="${esc(r.id)}" data-orig="${r.layer || ""}"><option value="">Elige la capa…</option>${Object.entries(FD.LAYERS).map(([k, l]) => `<option value="${k}" ${cur === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    // La capa la propone el sistema; el equipo puede reasignarla con una línea de razón (queda registrada).
    const layerCell = (r) => !r.layer ? layerSel(r, r.s.layer)
      : r.s.layer || r.s.re ? `${layerSel(r, r.s.layer || r.layer)}${r.s.layer && r.s.layer !== r.layer ? `<label class="fd-lwhy">¿Por qué otra capa?<input type="text" data-fdlwhy="${esc(r.id)}" value="${esc(r.s.lwhy || "")}" placeholder="una línea"></label>` : ""}`
        : `<span class="pill fd-l-${r.layer}">${esc(FD.LAYERS[r.layer])}</span><button type="button" class="fd-re" data-fdre>cambiar capa</button>`;
    const verdict = (inc) => { const v = fs.lk[inc]; if (!v || v.c !== fs.links[inc]) return "";
      return v.ok ? `<p class="fd-v ok">${icon("check")} ${esc(v.msg || "Coincide con el relato del incidente.")}</p>` : `<p class="fd-v no">${icon("alert")} ${esc(v.msg || "")}</p>`; };
    const causeSel = (inc, cur) => `<label class="fd-cause">¿Qué componente o capa lo causó?<select data-fdcause="${esc(inc)}"><option value="">— Elige —</option>
        <optgroup label="Componentes de tu inventario">${res.causes.filter(([v]) => v.startsWith("c:")).map(([v, l]) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</optgroup>
        <optgroup label="No es un componente">${res.causes.filter(([v]) => !v.startsWith("c:")).map(([v, l]) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</optgroup></select></label>`;
    const row = (r) => `<div class="fd-row ${r.s.s === "c" ? "ok" : r.s.s === "d" ? "off" : ""} ${r.s.crit && r.s.s !== "d" ? "crit" : ""}" data-fd="${esc(r.id)}">
        <div class="fd-layerc">${layerCell(r)}</div>
        <div class="fd-main"><p class="fd-t">${esc(r.text)}${r.effects.map((e) => ` <span class="fd-arrow">→</span> <b>${esc(e)}</b>`).join(" y")}</p>
          ${r.sub ? `<p class="fd-sub">${esc(r.sub)}</p>` : ""}
          <p class="fd-origin">${icon("search")} ${r.origin.map(esc).join(" · ")} <a href="#" data-pgo="${r.tab}">ver</a></p>
          ${r.ask ? causeSel(r.ask, r.cause) + verdict(r.ask) : ""}
          ${(r.manual || []).map((inc) => `${verdict(inc)}<p class="fd-unlink">La unión con el incidente ${esc(inc)} la hizo tu equipo. <button type="button" class="fd-re" data-fdunlink="${esc(inc)}">separar</button></p>`).join("")}
          ${r.s.s === "d" ? `<label class="fd-why">¿Por qué lo descartan? (una línea)<input type="text" data-fdwhy="${esc(r.id)}" value="${esc(r.s.why || "")}" placeholder="p. ej. ya se resolvió con el cambio de…"></label>` : ""}</div>
        <div class="fd-act"><button type="button" class="btn btn-sm ${r.s.s === "c" ? "btn-primary" : "btn-ghost"}" data-fdset="c">${icon("check")} Confirmar</button>
          <button type="button" class="btn btn-sm ${r.s.s === "d" ? "" : "btn-ghost"}" data-fdset="d">Descartar</button>
          <button type="button" class="btn btn-sm btn-ghost fd-star ${r.s.crit ? "on" : ""}" data-fdcrit title="Marcar como uno de los 3 más críticos" ${r.s.s === "d" ? "disabled" : ""}>★ Crítico</button></div></div>`;
    return `<div class="card span-12 fd-card"><h4>${icon("search")} Antes de la matriz · Registro de hallazgos</h4>
      <p class="muted" style="margin-top:-6px">Sale de lo que tu equipo ya respondió: no es la solución ni viene del docente. Confirma los hallazgos que son ciertos, descarta con una razón los que no, y marca tus <b>3 más críticos</b>.</p>
      <div class="fd-pieces"><b>Tu decisión se apoya en ${okN} de ${res.pieces.length} piezas</b>${res.pieces.map(piece).join("")}</div>
      ${changes.length ? `<div class="notice info fd-changes">${icon("info")}<span><b>El registro cambió porque tu equipo corrigió un punto anterior:</b><br>${changes.slice(0, 6).map(esc).join("<br>")}${changes.length > 6 ? `<br>… y ${changes.length - 6} más` : ""} <button type="button" class="btn btn-sm" data-fdseen>Entendido</button></span></div>` : ""}
      ${res.notices.map((n) => `<div class="notice">${icon("alert")}<span>${esc(n.text)} <a href="#" data-pgo="${n.tab}">Ir</a></span></div>`).join("")}
      ${!res.open ? `<div class="notice info">${icon("info")}<span><b>El registro se abre con tres piezas:</b> la parte A de redundancia, al menos dos cálculos y la mitad de los incidentes clasificados. Completa lo que está en rojo; el BMM, la parte B y el laboratorio suman, pero no bloquean.</span></div>`
        : live.length ? `<div class="fd-list">${live.map(row).join("")}</div>
          <p class="fd-count" id="fd-count">${live.filter((r) => r.s.s === "c").length} confirmados · ${live.filter((r) => r.s.s === "d").length} descartados · ${live.filter((r) => !r.s.s).length} por revisar · <b>${crit} de 3 críticos</b></p>`
        : `<div class="notice info">${icon("info")}<span>Con lo que tu equipo ha respondido todavía no sale ningún hallazgo. Revisa qué componentes marcaste como únicos y clasifica los incidentes.</span></div>`}
      ${twBadges(["mat.findings"], ["Registro de hallazgos"])}</div>`;
  }
  function findingsBind(body, c) {
    const cid = c.case_id;
    const put = (fn) => {
      const fs = fdState(cid); fn(fs); store.set(cid + ":findings", fs);
      const rows = fdBuild(c).rows; if (!fs.seen) fs.seen = Object.fromEntries(rows.map((r) => [r.id, fdText(r)]));
      fs.rows = fdRows(rows);
      store.set(cid + ":findings", fs);
    };
    // Compara en el servidor la causa elegida con la relación esperada (sin revelarla). Solo con sesión del equipo.
    const checkCause = async (inc, cause) => {
      if (!cause || !apiBase() || !teamSession() || !tw.on || tw.cid !== cid) return;
      try {
        const r = await fetch(apiBase() + "/api/mentor/cause", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ case_id: cid, incident: inc, cause }) });
        const d = await r.json(); if (!r.ok || !d.disponible) return;
        put((fs) => { if (fs.links[inc] === cause) fs.lk[inc] = { c: cause, ok: !!d.coincide, msg: d.mensaje || "" }; });
        if (currentTab === "matriz" && currentCase?.case_id === cid) renderTab();
      } catch { /* sin conexión: la elección queda guardada y se compara después */ }
    };
    const idOf = (el) => el.closest("[data-fd]")?.dataset.fd;
    body.addEventListener("click", (e) => {
      if (e.target.closest("[data-fdseen]")) { put((fs) => { fs.seen = Object.fromEntries(fdBuild(c).rows.map((r) => [r.id, fdText(r)])); }); return renderTab(); }
      const un = e.target.closest("[data-fdunlink]"); if (un) { put((fs) => { delete fs.links[un.dataset.fdunlink]; delete fs.lk[un.dataset.fdunlink]; }); return renderTab(); }
      if (e.target.closest("[data-fdre]")) { const rid = idOf(e.target); put((fs) => { (fs.st[rid] = fs.st[rid] || {}).re = true; }); return renderTab(); }
      const set = e.target.closest("[data-fdset]"), star = e.target.closest("[data-fdcrit]"); if (!set && !star) return;
      const id = idOf(e.target); if (!id) return;
      if (set) put((fs) => { const x = (fs.st[id] = fs.st[id] || {}); x.s = x.s === set.dataset.fdset ? "" : set.dataset.fdset; if (x.s === "d") x.crit = false; });
      else {
        const fs = fdState(cid), ids = new Set(fdBuild(c).rows.map((r) => r.id));
        const n = Object.entries(fs.st).filter(([k, v]) => ids.has(k) && v.crit && v.s !== "d" && k !== id).length;
        if (!fs.st[id]?.crit && n >= 3) return toast("Ya marcaste 3 críticos: quita uno para marcar otro");
        put((s) => { const x = (s.st[id] = s.st[id] || {}); x.crit = !x.crit; if (x.crit && !x.s) x.s = "c"; });
      }
      renderTab();
    });
    body.addEventListener("change", (e) => {
      const d = e.target.dataset;
      if (d.fdcause) { const inc = d.fdcause, v = e.target.value; put((fs) => { if (v) fs.links[inc] = v; else delete fs.links[inc]; delete fs.lk[inc]; }); renderTab(); return void checkCause(inc, v); }
      if (d.fdlayer) {
        const id = d.fdlayer, v = e.target.value, orig = d.orig || "";
        put((fs) => { const x = (fs.st[id] = fs.st[id] || {}); if (orig && (!v || v === orig)) { delete x.layer; delete x.lwhy; delete x.re; } else x.layer = v; });
        if (orig) renderTab();
      }
    });
    body.addEventListener("input", (e) => {
      const d = e.target.dataset;
      if (d.fdwhy) put((fs) => { (fs.st[d.fdwhy] = fs.st[d.fdwhy] || {}).why = e.target.value; });
      if (d.fdlwhy) put((fs) => { (fs.st[d.fdlwhy] = fs.st[d.fdlwhy] || {}).lwhy = e.target.value; });
    });
  }

  /* ---- Matriz de decisión ----
     Seis criterios fijos (más uno propio del equipo) con peso propuesto y trazable. El equipo confirma o ajusta cada peso
     con una razón, responde las preguntas de coherencia, puntúa sus alternativas y escribe su decisión. */
  const MX = window.MATRIX;
  const DEFAULT_CRITERIA = MX.CRITERIA.map(([, n]) => [n, 0]);
  const SCR = window.SCORING;
  // Tabla «qué resuelve cada patrón» y función de cada componente: las publica el servidor del curso (no es la clave).
  let SOLVES = store.get("solves", null), solvesAsked = false;
  function loadSolves() {
    if (solvesAsked || !apiBase()) return; solvesAsked = true;
    fetch(apiBase() + "/api/patterns/solves").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d || !d.patterns) return; const changed = JSON.stringify(d) !== JSON.stringify(SOLVES); SOLVES = d; _storeSet("solves", d);
      if (changed && currentTab === "matriz" && currentCase) renderTab();
    }).catch(() => { /* sin conexión: se usa la última tabla guardada */ });
  }
  const mxCtx = (c) => { const cid = c.case_id, fs = fdState(cid);
    return { c, sector: c.sector, regulated: /fintech|banca|financ|salud|gobierno|smart city/i.test(c.sector || ""), fn: SOLVES?.functions?.[cid]?.map, tier: tierGet(cid), calc: store.get(cid + ":calc", {}),
      inc: getInc(cid), bmm: store.get(cid + ":bmm", null), rows: fdBuild(c).rows, st: fs.st }; };
  // Lo que falta para marcar una alternativa como revisada: explicar cada advertencia y, si se cambió un puntaje validado, decir por qué.
  function mxNeeds(a) {
    const pr = a._p, out = []; if (!pr) return out;
    if ([...pr.rojas, ...pr.naranjas].some((w) => MX.words(a.hold[w.id]) < 3)) out.push("explica cómo manejarías cada advertencia");
    if (pr.validado && a.t.some(Boolean) && MX.words(a.sr) < 3) out.push("escribe por qué cambiaste puntajes propuestos");
    return out;
  }
  // Sensibilidad: para cada criterio, el cambio de peso más pequeño (los demás se reparten en proporción) que cambia la ganadora.
  function mxSensitivity(m) {
    if (m.alts.length < 2) return null;
    const win = (w) => { const sum = w.reduce((a, b) => a + b, 0) || 1; const t = m.alts.map((a) => m.criteria.reduce((s, _, i) => s + w[i] * (a.s[i] || 0), 0) / sum); return t.indexOf(Math.max(...t)); };
    const w0 = m.criteria.map((k) => +k.w || 0), base = win(w0), out = [];
    m.criteria.forEach((k, ci) => {
      const rest = w0.reduce((a, b, i) => a + (i === ci ? 0 : b), 0); let hit = null;
      for (let d = 1; d <= 100 && !hit; d++) for (const v of [w0[ci] + d, w0[ci] - d]) {
        if (v < 0 || v > 100 || hit) continue;
        const w = w0.map((x, i) => (i === ci ? v : rest ? x * (100 - v) / rest : 0)), who = win(w);
        if (who !== base) hit = { crit: (k.n || "Criterio propio").split(" (")[0], from: w0[ci], to: v, alt: m.alts[who].name };
      }
      if (hit) out.push(hit);
    });
    return { winner: m.alts[base].name, flips: out.sort((a, b) => Math.abs(a.to - a.from) - Math.abs(b.to - b.from)).slice(0, 3) };
  }
  // Lo que se guarda de la matriz (sin los cálculos de pantalla).
  const mxClean = (m) => { const x = { ...m, alts: m.alts.map(({ _p, ...a }) => (_p ? { ...a, warn: [..._p.rojas, ..._p.naranjas].map((w) => ({ id: w.id, text: w.text })) } : a)) }; delete x.movedNote; return x; };
  const E3_MARCOS = ["ITIL", "COBIT", "ISO", "Tier"], E3_EXEC = [["rec", "Decisión recomendada", "Recomendamos … (en una o dos frases, para un directivo)"], ["riesgos", "Riesgos y mitigación", "El principal riesgo es … y lo mitigamos con …"],
    ["costo", "Costo y plazo aproximados", "Inversión aproximada … en un plazo de …"], ["pasos", "Próximos pasos", "1) … 2) … 3) …"]];
  const e3Words = (m) => MX.words(m.decision.text) + E3_EXEC.reduce((n, [k]) => n + MX.words((m.exec || {})[k]), 0);
  // Matriz en la forma nueva. Una matriz anterior se traslada sin perder nada (queda en «matriz anterior»).
  function getMatrix(id) {
    const raw = store.get(id + ":matrix", null), c = byId[id];
    let m = raw && raw.v === 2 ? raw : null;
    if (!m) { const mg = MX.migrate(raw || {}); m = { v: 2, criteria: [], alts: mg.alts, old: mg.old, wok: false, coh: {}, decision: { alt: "", text: "" }, prev: raw?.prev || null }; }
    // Entrega 3: hallazgos de la Entrega 2, condiciones del TO-BE y recomendación ejecutiva.
    m.tobe = m.tobe || raw?.tobe || {}; m.tobe.e2 = m.tobe.e2 || []; m.tobe.cond = m.tobe.cond || []; m.exec = m.exec || raw?.exec || {};
    const ctx = c ? mxCtx(c) : null;
    const prop = c ? MX.propose(ctx) : MX.CRITERIA.map(([cid, n]) => ({ id: cid, n, wp: 0, why: [], active: true }));
    const cur = Object.fromEntries((m.criteria || []).map((k) => [k.id, k]));
    const own = cur.own || null;
    let moved = [];
    m.criteria = prop.map((p) => { const k = cur[p.id];
      if (k && k.wp != null && k.wp !== p.wp) moved.push(`${p.n.split(" (")[0]}: de ${k.wp} % a ${p.wp} %`);
      return { id: p.id, n: p.n, wp: p.wp, why: p.why, active: p.active, w: k && k.touched ? k.w : p.wp, touched: !!(k && k.touched), reason: (k && k.reason) || "" }; });
    if (own) m.criteria.push({ id: "own", n: own.n || "", wp: 0, why: ["Criterio propio del equipo"], active: true, w: +own.w || 0, touched: true, reason: own.reason || "" });
    // Alternativas: de 1 a 3 patrones del catálogo (o propia, sin patrones). El puntaje propuesto llena lo que el equipo no ha tocado.
    m.alts = (m.alts || []).map((a) => {
      const pats = Array.isArray(a.pats) ? a.pats.filter((k) => PATTERNS[k]).slice(0, 3) : PATTERNS[a.id] ? [a.id] : [];
      const pr = ctx && SOLVES && pats.length ? SCR.score(pats, SOLVES.patterns, ctx) : null;
      const kept = !Array.isArray(a.t) && (a.s || []).some((v) => +v !== 3);  // matriz hecha antes: sus puntajes se respetan como ajustes del equipo
      const t = m.criteria.map((k, i) => (Array.isArray(a.t) ? !!a.t[i] : kept) && !!(pr && pr.s[k.id] != null));
      const s = m.criteria.map((k, i) => { const p = pr && pr.s[k.id]; return p != null && !t[i] ? p : Math.max(1, Math.min(5, +a.s?.[i] || 3)); });
      const x = { ...a, pats, s, t, hold: a.hold || {}, sr: a.sr || "", _p: pr };
      x.ok = !!a.ok && !mxNeeds(x).length;  // si aparece una advertencia nueva, deja de contar como revisada hasta que el equipo la explique
      return x;
    });
    m.coh = m.coh || {}; m.decision = m.decision || { alt: "", text: "" };
    if (moved.length && m.wok) { m.wok = false; m.movedNote = moved; }
    return m;
  }
  function addAlt(caseId, id, name) {
    const m = getMatrix(caseId);
    if (m.alts.length >= 4 || (id && m.alts.some((a) => a.id === id))) return false;
    m.alts.push({ id, name, pats: PATTERNS[id] ? [id] : [], s: m.criteria.map(() => 3), t: [], j: "", ok: false }); store.set(caseId + ":matrix", mxClean(m)); return true;
  }
  function tabMatriz(body, c) {
    loadSolves();
    const cid = c.case_id, m = getMatrix(cid), ctx = mxCtx(c);
    const sumW = m.criteria.reduce((s, k) => s + (+k.w || 0), 0);
    const total = (a) => m.criteria.reduce((s, k, i) => s + (+k.w || 0) * (a.s[i] || 0), 0) / ((sumW || 1) * 5) * 100;
    const best = m.alts.length ? Math.max(...m.alts.map(total)) : 0;
    const coh = MX.coherence(ctx, m.criteria);
    const needReason = m.criteria.filter((k) => k.id !== "own" && k.w !== k.wp && MX.words(k.reason) < 3);
    const ownBad = m.criteria.some((k) => k.id === "own" && (!k.n.trim() || MX.words(k.reason) < 3));
    const cohOpen = coh.filter((q) => MX.words(m.coh[q.id]) < 3);
    const canConfirm = sumW === 100 && !needReason.length && !ownBad && !cohOpen.length;
    const hasOwn = m.criteria.some((k) => k.id === "own");
    const prev = m.prev || {}, done1 = m.wok && m.alts.length >= 2 && m.alts.every((a) => a.ok), done2 = !!m.decision.alt && MX.words(m.decision.text) >= 15;
    body.innerHTML = `<div class="ws-grid">
      ${findingsCardHtml(c)}
      ${(prev.p1 || prev.p2) && !(done1 && done2) ? `<div class="span-12 notice info">${icon("check")}<span><b>La matriz que tu equipo ya había hecho sigue contando para el progreso.</b> La matriz cambió: ahora los pesos salen de su trabajo. Sus alternativas y justificaciones se conservaron; revisen los pesos, confirmen los puntajes y escriban la decisión cuando puedan.${m.old ? ` <button type="button" class="btn btn-sm btn-ghost" id="mx-old">Ver la matriz anterior</button>` : ""}</span></div>` : ""}
      <div class="card span-12" id="e3-card"><h4>${icon("book")} Entrega 3 · Evaluación de alternativas y decisión técnica <span class="h4-r"><span class="pill">25 % de la nota</span></span></h4>
        <p class="muted" style="margin-top:-6px">La entrega oficial es el PDF que genera esta plataforma al final. Orden: condiciones del TO-BE → matriz con al menos 2 alternativas → recomendación ejecutiva → cerrar la decisión → mirada de la consultora → reflexión y declaración de uso de IA → descargar el PDF.</p>
        <div id="e3-out"><p class="muted">${tw.on && tw.cid === cid ? "Cargando el estado de tu entrega…" : "Ingresa con el código de tu equipo para ver qué te falta y la fecha límite."}</p></div>
        <details class="mx-combo"><summary>Ver la rúbrica con la que se califica (8 criterios)</summary><div id="e3-rubric"><p class="muted">Cargando la rúbrica…</p></div></details></div>
      <div class="card span-12" id="e3-tobe"><h4>${icon("target")} 0 · Condiciones del TO-BE (Entrega 2) <span class="h4-r">${mentorBtn("e3.tobe", "Condiciones del TO-BE", "", "Pistas")}</span></h4>
        <p class="muted" style="margin-top:-6px">Copia aquí lo que tu equipo ya definió en la Entrega 2: sus hallazgos priorizados y las condiciones que debe cumplir la solución futura. Esto lo escribe tu equipo; el Mentor solo da pistas.</p>
        <p class="mx-grp">Hallazgos priorizados en tu Entrega 2</p>
        ${m.tobe.e2.map((x, i) => `<div class="e3-row"><input type="text" class="e3-id" value="${esc(x.id || "")}" data-e2id="${i}" placeholder="H01" maxlength="6"><input type="text" value="${esc(x.t || "")}" data-e2t="${i}" placeholder="Título del hallazgo, como está en tu Entrega 2">
          <button class="rm" data-e2rm="${i}" title="Quitar">×</button>
          <details class="e3-links"><summary>Vincular con el registro de la plataforma (opcional) · ${(x.links || []).length}</summary><div class="rd-checks">${fdBuild(c).rows.filter((r) => fdState(cid).st?.[r.id]?.s !== "d").map((r) => `<label class="rd-chk"><input type="checkbox" data-e2l="${i}|${esc(r.id)}" ${(x.links || []).includes(r.id) ? "checked" : ""}><span>${esc(fdText(r))}</span></label>`).join("")}</div></details></div>`).join("")}
        <div class="row-actions"><button class="btn btn-sm btn-ghost" id="e2-add">+ hallazgo de la Entrega 2</button></div>
        <p class="mx-grp">Condiciones del TO-BE <span class="muted">· de 3 a 8 · llevas ${m.tobe.cond.length}</span></p>
        ${m.tobe.cond.map((x, i) => `<div class="e3-cond"><div class="e3-row"><b>C${i + 1}</b><input type="text" value="${esc(x.t || "")}" data-cdt="${i}" placeholder="Título (por ejemplo: Gestión de capacidad)"><button class="rm" data-cdrm="${i}" title="Quitar">×</button></div>
          <textarea data-cdd="${i}" placeholder="Qué debe cumplir la solución futura (no cuál es la solución)">${esc(x.d || "")}</textarea>
          <div class="e3-row"><span class="muted">Hallazgos que la originan:</span>${m.tobe.e2.filter((h) => (h.id || "").trim()).map((h) => `<label class="chk"><input type="checkbox" data-cdh="${i}|${esc(h.id.trim())}" ${(x.h || []).includes(h.id.trim()) ? "checked" : ""}> ${esc(h.id.trim())}</label>`).join("") || `<span class="hint">escribe primero tus hallazgos</span>`}
            <label class="chk"><input type="checkbox" data-cdtr="${i}" ${x.tr ? "checked" : ""}> Transversal</label></div>
          ${x.tr ? `<input type="text" value="${esc(x.trw || "")}" data-cdtrw="${i}" placeholder="¿Por qué aplica a todo? (una línea)" class="${MX.words(x.trw) < 3 ? "mx-need" : ""}">` : ""}
          <div class="e3-row"><span class="muted">Marcos (opcional):</span>${E3_MARCOS.map((k) => `<label class="chk"><input type="checkbox" data-cdm="${i}|${k}" ${(x.m || []).includes(k) ? "checked" : ""}> ${k}</label>`).join("")}
            <input type="text" value="${esc(x.mt || "")}" data-cdmt="${i}" placeholder="Práctica o control (por ejemplo: COBIT BAI04; ISO A.8.6)"></div></div>`).join("")}
        <div class="row-actions">${m.tobe.cond.length < 8 ? `<button class="btn btn-sm btn-ghost" id="cd-add">+ condición</button>` : `<span class="hint">Máximo 8 condiciones.</span>`}</div>
        ${twBadges(["mat.tobe"], ["Condiciones del TO-BE"])}</div>
      <div class="card span-12"><h4>${icon("chart")} 1 · Criterios y pesos <span class="h4-r">${m.wok ? `<span class="pill green">${icon("check")} pesos confirmados</span>` : `<span class="pill amber">por confirmar</span>`}</span></h4>
        <p class="muted" style="margin-top:-6px">Los pesos salen de lo que tu equipo ya respondió. Puedes cambiarlos: si cambias uno, escribe por qué. Deben sumar 100 %.</p>
        ${m.movedNote ? `<div class="notice info">${icon("info")}<span><b>Los pesos propuestos cambiaron porque tu equipo corrigió un punto anterior:</b> ${m.movedNote.map(esc).join("; ")}. Revísalos y confirma de nuevo.</span></div>` : ""}
        <div class="heat-scroll"><table class="matrix mx-w"><thead><tr><th>Criterio</th><th>Por qué (de tu trabajo)</th><th>Propuesto</th><th>Tu peso %</th><th>Si lo cambias, ¿por qué?</th></tr></thead>
        <tbody>${m.criteria.map((k, i) => `<tr class="${k.active ? "" : "mx-off"}"><td>${k.id === "own" ? `<input type="text" value="${esc(k.n)}" data-mxown="n" placeholder="Nombre de tu criterio"> <button class="rm" data-mxownrm title="Quitar criterio propio">×</button>` : `<b>${esc(k.n)}</b>`}</td>
          <td><ul class="mx-why">${k.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></td><td class="mx-n">${k.id === "own" ? "—" : k.wp + " %"}</td>
          <td><input type="number" min="0" max="100" value="${k.w}" data-mxw="${i}" class="${k.id !== "own" && k.w !== k.wp ? "mx-ch" : ""}"></td>
          <td><input type="text" value="${esc(k.reason)}" data-mxr="${i}" placeholder="${k.id === "own" ? "¿Por qué hace falta este criterio?" : k.w !== k.wp ? "Obligatorio: una línea" : "Solo si cambias el peso"}" class="${(k.id !== "own" && k.w !== k.wp && MX.words(k.reason) < 3) || (k.id === "own" && MX.words(k.reason) < 3) ? "mx-need" : ""}"></td></tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="3">Suma de los pesos</td><td class="mx-n" id="mx-sum" style="color:${sumW === 100 ? "#34d399" : "#fbbf24"}">${sumW} %</td><td>${sumW === 100 ? "" : `<span class="hint" style="color:#fbbf24">Deben sumar 100 %: ${sumW < 100 ? "faltan " + (100 - sumW) : "sobran " + (sumW - 100)} puntos.</span>`}</td></tr></tfoot></table></div>
        ${coh.length ? `<div class="mx-coh"><b>${icon("alert")} Preguntas de coherencia</b><p class="muted">Tus pesos no cuadran con algo que tu equipo respondió antes. Responde cada una en una línea (o ajusta el peso).</p>
          ${coh.map((q) => `<label>${esc(q.text)}<input type="text" data-mxcoh="${q.id}" value="${esc(m.coh[q.id] || "")}" placeholder="Tu respuesta en una línea" class="${MX.words(m.coh[q.id]) < 3 ? "mx-need" : ""}"></label>`).join("")}</div>` : ""}
        ${twBadges(["mat.criteria"], ["Criterios y pesos"])}
        <div class="row-actions">${hasOwn ? "" : `<button class="btn btn-sm btn-ghost" id="mx-own">+ criterio propio</button>`}<button class="btn btn-sm btn-ghost" id="mx-reset">Volver a los pesos propuestos</button>
          <button class="btn btn-sm btn-primary" id="mx-ok" ${canConfirm ? "" : "disabled"}>${icon("check")} ${m.wok ? "Pesos confirmados" : "Confirmar pesos"}</button>
          ${canConfirm ? "" : `<span class="hint">Para confirmar: ${[sumW !== 100 ? "los pesos deben sumar 100 %" : "", needReason.length ? "escribe la razón de cada peso que cambiaste" : "", ownBad ? "completa tu criterio propio" : "", cohOpen.length ? "responde las preguntas de coherencia" : ""].filter(Boolean).join("; ")}.</span>`}</div></div>
      <div class="card span-12"><h4>${icon("puzzle")} 2 · Arma hasta 4 alternativas</h4>
        <p class="muted" style="margin-top:-6px">Una alternativa puede ser un patrón del catálogo o una combinación de 2 o 3. Al combinar, lo que resuelven se une; el costo, la complejidad y el plazo son los del patrón más exigente.</p>
        <p class="mx-grp">Sugeridas para tu caso</p>
        <div class="pick-list">${c.alternatives.map((k) => `<button class="pick ${m.alts.some((a) => a.id === k) ? "on" : ""}" data-pick="${k}">${esc(PATTERNS[k].name)}</button>`).join("")}</div>
        <p class="mx-grp">Otros patrones del catálogo <span class="muted">· no están entre las sugeridas, pero puedes usarlos si tus hallazgos lo piden</span></p>
        <div class="pick-list">${mxOthers(c).map((k) => `<button class="pick ${m.alts.some((a) => a.id === k) ? "on" : ""}" data-pick="${k}">${esc(PATTERNS[k].name)}</button>`).join("")}</div>
        <details class="mx-combo"><summary>Combinar 2 o 3 patrones en una alternativa</summary>
          <p class="mx-grp">Sugeridas para tu caso</p>
          <div class="rd-checks">${c.alternatives.map((k) => `<label class="rd-chk"><input type="checkbox" data-cmb="${k}"><span>${esc(PATTERNS[k].name)}</span></label>`).join("")}</div>
          <p class="mx-grp">Otros patrones del catálogo</p>
          <div class="rd-checks">${mxOthers(c).map((k) => `<label class="rd-chk"><input type="checkbox" data-cmb="${k}"><span>${esc(PATTERNS[k].name)}</span></label>`).join("")}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><input type="text" id="cmb-name" placeholder="Nombre de la alternativa (opcional)" style="flex:1 1 280px"><button class="btn btn-sm" id="cmb-add">Agregar combinación</button></div></details>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><input type="text" id="custom-alt" placeholder="…o escribe una alternativa propia, fuera del catálogo" style="flex:1 1 320px"><button class="btn btn-sm" id="add-custom">Agregar</button></div></div>
      ${m.alts.length ? `
      <div class="card span-7"><h4>${icon("chart")} 3 · Puntajes (1,0 = peor, 5,0 = mejor)</h4>
        <p class="muted" style="margin-top:-6px">Llegan propuestos según cuántos de tus hallazgos atiende cada alternativa. Puedes ajustarlos, con enteros o decimales.</p>
        <div class="heat-scroll"><table class="matrix"><thead><tr><th>Criterio</th><th>Peso %</th>${m.alts.map((a, i) => `<th class="alt-h">${esc(a.name)} <button class="rm" data-rmalt="${i}" title="Quitar">×</button>
            ${a._p ? (a._p.validado ? `<span class="pill green mx-tag">propuesto</span>` : `<span class="pill amber mx-tag">estimación sin validar</span>`) : `<span class="pill mx-tag">a mano</span>`}${twBadge("mat.alt." + (a.id || "u-" + twHash(a.name)))}</th>`).join("")}</tr></thead>
        <tbody>${m.criteria.map((k, ci) => `<tr><td>${esc(k.n || "Criterio propio")}</td><td class="mx-n">${k.w}</td>
          ${m.alts.map((a, ai) => { const pr = a._p && a._p.s[k.id]; return `<td><input type="number" class="mx-s ${a.t[ci] ? "mx-ch" : ""}" min="1" max="5" step="0.1" value="${a.s[ci]}" data-s="${ai}-${ci}">${a.t[ci] && pr != null ? `<small class="mx-prop">propuesto ${fmt(pr, 1)}</small>` : ""}</td>`; }).join("")}</tr>`).join("")}</tbody>
        <tfoot><tr><td>Puntaje ponderado</td><td class="muted" style="font:500 12px var(--mono)">Σ ${sumW}%</td>${m.alts.map((a) => `<td style="${total(a) === best ? "color:#34d399" : ""}">${fmt(total(a), 1)}</td>`).join("")}</tr>
          <tr><td colspan="2">¿Puntajes revisados?</td>${m.alts.map((a, i) => { const need = mxNeeds(a); return `<td><label class="chk-line" title="${esc(need.join("; "))}"><input type="checkbox" data-aok="${i}" ${a.ok && !need.length ? "checked" : ""} ${need.length ? "disabled" : ""}> ${need.length ? "falta abajo" : "sí"}</label></td>`; }).join("")}</tr></tfoot></table></div>
        <p class="hint">Marca «sí» cuando tu equipo haya revisado esa alternativa. Si tiene advertencias o cambiaste un puntaje propuesto, primero completa lo que se pide abajo. Hacen falta al menos dos alternativas revisadas.</p></div>
      <div class="card span-5"><h4>${icon("target")} Comparación visual</h4><div class="chart-box tall"><canvas id="ch-matrix"></canvas></div></div>
      <div class="card span-12"><h4>${icon("book")} 4 · Evidencia, advertencias y justificación</h4>
        ${m.alts.map((a, i) => { const pr = a._p, warns = pr ? [...pr.rojas.map((w) => ({ ...w, c: "red" })), ...pr.naranjas.map((w) => ({ ...w, c: "orange" }))] : [], adj = pr && pr.validado && a.t.some(Boolean);
          return `<div class="mx-alt"><h5>${esc(a.name)}${a.pats.length > 1 ? ` <span class="muted">· ${a.pats.map((k) => esc(PATTERNS[k].name.split(" (")[0])).join(" + ")}</span>` : ""}</h5>
          ${pr ? `<p class="mx-res"><b>${esc(pr.resumen)}.</b>${pr.validado ? "" : ` <span class="pill amber">estimación sin validar por tu docente: ajústala con tu criterio</span>`}</p>
            ${mxCrit(pr).sin.length ? `<p class="mx-crit">${icon("alert")} Deja sin cubrir ${mxCrit(pr).sin.length} de tus ${mxCrit(pr).total} hallazgos críticos: ${mxCrit(pr).sin.map((x) => `${esc(x.text)} <span class="muted">(deja ${esc(x.deja)})</span>`).join("; ")}.</p>` : ""}
            <ul class="mx-evl">${MX.CRITERIA.map(([id, n]) => `<li><b>${esc(n.split(" (")[0])} · ${fmt(pr.s[id], 1)}:</b> ${esc(pr.ev[id])}</li>`).join("")}</ul>`
            : `<p class="muted">${a.pats.length ? "Sin conexión con el servidor del curso: no hay puntajes propuestos. Puntúala a mano." : "Alternativa propia, fuera del catálogo: puntúala a mano y explica en la justificación qué hallazgos atiende."}</p>`}
          ${warns.map((w) => `<div class="mx-warn ${w.c}">${icon("alert")}<div><b>${esc(w.text)}</b><span class="muted"> Baja un punto de viabilidad. Puedes sostener la alternativa si explicas cómo lo manejarías.</span>
            <input type="text" data-hold="${i}|${esc(w.id)}" value="${esc(a.hold[w.id] || "")}" placeholder="¿Cómo lo manejarías?" class="${MX.words(a.hold[w.id]) < 3 ? "mx-need" : ""}"></div></div>`).join("")}
          ${adj ? `<label class="mx-sr">Cambiaste puntajes propuestos de esta alternativa: ¿por qué? (una línea)<input type="text" data-sr="${i}" value="${esc(a.sr)}" class="${MX.words(a.sr) < 3 ? "mx-need" : ""}"></label>` : ""}
          ${pr && a.t.some(Boolean) ? `<button type="button" class="btn btn-sm btn-ghost" data-useprop="${i}">Volver a los puntajes propuestos</button>` : ""}
          ${m.tobe.cond.length ? `<div class="e3-row" style="margin-top:8px"><span class="muted">Condiciones del TO-BE que cumple:</span>${m.tobe.cond.map((x, ci) => `<label class="chk" title="${esc(x.t || "")}"><input type="checkbox" data-acond="${i}|${esc(x.id)}" ${(a.cond || []).includes(x.id) ? "checked" : ""}> C${ci + 1}</label>`).join("")}
            <label class="chk"><input type="checkbox" data-acnone="${i}" ${Array.isArray(a.cond) && !a.cond.length ? "checked" : ""}> Ninguna</label>${Array.isArray(a.cond) ? "" : `<span class="hint" style="color:#fbbf24">marca las que cumple, o «Ninguna»</span>`}</div>` : ""}
          <label style="margin-top:10px">Justificación<textarea data-j="${i}" placeholder="¿Cuáles de tus hallazgos atiende? ¿Qué deja sin resolver? ¿Qué riesgo nuevo introduce?">${esc(a.j || "")}</textarea></label></div>`; }).join("")}</div>
      <div class="card span-12"><h4>${icon("target")} 5 · Recomendación ejecutiva <span class="h4-r">${mentorBtn("e3.exec", "Recomendación ejecutiva", "", "Pistas")} ${mentorBtn("mat", "Matriz de decisión", "", "Mentor")} ${done2 ? `<span class="pill green">${icon("check")} escrita</span>` : `<span class="pill amber">pendiente</span>`}</span></h4>
        <div class="lab-ctx rd-two"><label>Alternativa que eligen<select id="mx-dalt"><option value="">— Elige —</option>${m.alts.map((a) => `<option value="${esc(a.id || a.name)}" ${m.decision.alt === (a.id || a.name) ? "selected" : ""}>${esc(a.name)} · ${fmt(total(a), 1)}</option>`).join("")}</select></label>
          <p class="hint" style="align-self:end">La de mayor puntaje no siempre es la mejor decisión: si eligen otra, expliquen qué pesó más.</p></div>
        <label>${E3_EXEC[0][1]}<textarea id="mx-xrec" data-xk="rec" placeholder="${E3_EXEC[0][2]}">${esc(m.exec.rec || "")}</textarea></label>
        <label>Por qué responde al caso · ¿por qué esta y no las otras? (mínimo 15 palabras; nombra los hallazgos que atiende y lo que deja sin resolver)<textarea id="mx-dtext" placeholder="Elegimos … porque atiende … Deja sin resolver … y lo aceptamos porque …">${esc(m.decision.text || "")}</textarea></label>
        <p class="hint" id="mx-dcount">${MX.words(m.decision.text)} de 15 palabras</p>
        ${E3_EXEC.slice(1).map(([k, label, ph]) => `<label>${label}<textarea data-xk="${k}" placeholder="${ph}">${esc(m.exec[k] || "")}</textarea></label>`).join("")}
        <p class="hint" id="mx-xcount" style="color:${e3Words(m) > 400 ? "#fbbf24" : ""}">Recomendación ejecutiva: ${e3Words(m)} palabras (unas 400 como máximo). La escribe tu equipo: la plataforma no la redacta.</p>
        ${twBadges(["mat.exec"], ["Recomendación ejecutiva"])}
        ${(() => { const mine = m.alts.find((a) => (a.id || a.name) === m.decision.alt), sin = mine ? mxCrit(mine._p).sin : [];
          return sin.length ? `<div class="mx-warn red">${icon("alert")}<div><b>La alternativa que eligieron deja sin cubrir ${sin.length} de sus hallazgos críticos:</b> ${sin.map((x) => esc(x.text)).join("; ")}.
            <span class="muted"> Pueden mantenerla, pero expliquen por qué aceptan ese riesgo (el Mentor lo revisa).</span>
            <input type="text" id="mx-dcrit" value="${esc(m.decision.crit_why || "")}" placeholder="Aceptamos dejarlo sin cubrir porque…" class="${MX.words(m.decision.crit_why) < 8 ? "mx-need" : ""}"></div></div>` : ""; })()}
        ${(() => { const sv = sumW === 100 ? mxSensitivity(m) : null; if (!sv) return ""; const mine = m.alts.find((a) => (a.id || a.name) === m.decision.alt);
          return `<div class="mx-sens"><b>${icon("chart")} Ranking y sensibilidad</b>
            ${(() => { const rk = mxRank(m.alts.map((a) => ({ a, total: total(a), sin: mxCrit(a._p).sin.length, crit: mxCrit(a._p).total }))), any = rk.some((x) => x.sin), first = rk[0].a;
              return `${any ? `<p class="muted">Primero van las alternativas que cubren todos tus hallazgos críticos; después, las que dejan alguno, aunque tengan más puntaje.</p>` : ""}
            <ol>${rk.map((x) => `<li>${esc(x.a.name)} · <b>${fmt(x.total, 1)}</b>${x.sin ? ` <span class="pill red">deja ${x.sin} ${x.sin === 1 ? "crítico" : "críticos"} sin cubrir</span>` : x.crit && any ? ` <span class="pill green">cubre tus críticos</span>` : ""}${mine && mine === x.a ? ` <span class="pill green">la que eligieron</span>` : ""}</li>`).join("")}</ol>
            ${mine && mine !== first ? `<p class="mx-sens-n">Eligieron una alternativa que no es la primera del orden (${esc(first.name)}): expliquen en la decisión qué pesó más.</p>` : ""}`; })()}
            ${sv.flips.length ? `<p>Con un solo cambio de peso ganaría otra alternativa:</p><ul>${sv.flips.map((f) => `<li>Si <b>${esc(f.crit.toLowerCase())}</b> ${f.to > f.from ? "sube" : "baja"} de ${f.from} % a ${f.to} %, gana <b>${esc(f.alt)}</b>.</li>`).join("")}</ul>
              <p class="muted">${Math.abs(sv.flips[0].to - sv.flips[0].from) <= 5 ? "La decisión es sensible: un ajuste pequeño la cambia. Sustenten bien ese peso." : "La decisión es estable ante ajustes pequeños."}</p>`
              : `<p class="muted">La decisión es estable: ningún cambio de un solo peso hace ganar a otra alternativa.</p>`}</div>`; })()}
        <div class="row-actions"><button class="btn btn-primary" id="dl-md">${icon("download")} <span class="lbl">Descargar informe (.md)</span></button><button class="btn" id="cp-md">${icon("copy")} <span class="lbl">Copiar al portapapeles</span></button></div></div>
      ${m.decision.alt ? `<div class="card span-12" id="mx-replay"><h4>${icon("refresh" in window.ICONS ? "refresh" : "target")} 6 · Si hubieran tenido esta alternativa: repetición de los incidentes <span class="h4-r"><button type="button" class="btn btn-sm btn-ghost" id="mx-replay-go">Actualizar</button></span></h4>
        <div id="mx-replay-out"><p class="muted">${tw.on && tw.cid === cid ? "Calculando en el servidor con el trabajo guardado de tu equipo…" : "Ingresa con el código de tu equipo: este cálculo lo hace el servidor con el trabajo guardado."}</p></div></div>
      <div class="card span-12" id="mx-dec"><h4>${icon("lightbulb")} 7 · ¿Tu decisión atiende tus hallazgos? Revisión de la Tutora</h4>
        <div id="mx-dec-out"><p class="muted">${tw.on && tw.cid === cid ? "Cargando la trazabilidad de tu decisión…" : "Ingresa con el código de tu equipo: la trazabilidad se calcula en el servidor con el trabajo guardado."}</p></div></div>
      <div class="card span-12" id="e3-fin"><h4>${icon("download")} 8 · Declaración de uso de IA y Entrega 3 en PDF</h4>
        <div id="e3-fin-out"><p class="muted">Se activa cuando tu equipo cierre la decisión y escriba la reflexión sobre el contraste.</p></div></div>` : ""}`
      : `<div class="span-12 notice info">${icon("info")}<span>Aún no tienes alternativas en la matriz. Elige al menos dos para comparar.</span></div>`}
    </div>`;

    // Repetición de incidentes: la calcula el servidor con el trabajo guardado (espera a que termine de guardarse lo último).
    const replay = async () => {
      const out = $("#mx-replay-out", body); if (!out || !tw.on || tw.cid !== cid || !apiBase()) return;
      try {
        const r = await fetch(`${apiBase()}/api/matrix/replay?case_id=${cid}`, { headers: authHeaders() }), d = await r.json();
        if (!$("#mx-replay-out", body)) return;
        if (!r.ok || !d.disponible) { out.innerHTML = `<p class="muted">${esc(d.motivo || d.error || "No se pudo calcular.")}</p>`; return; }
        const P = { evitado: ["green", "Se evita"], reducido: ["amber", "Se reduce"], igual: ["red", "Sigue igual"] }, f4 = (x) => fmt(x, 4);
        out.innerHTML = `<p><b>${esc(d.alternativa)}</b>${d.validado ? "" : ` <span class="pill amber">estimación sin validar por tu docente</span>`} · ${d.resumen.evitados} incidente(s) se evitan, ${d.resumen.reducidos} se reducen y ${d.resumen.iguales} siguen igual${d.resumen.minutos_evitados ? ` · ${d.resumen.minutos_evitados} min de caída evitados` : ""}.</p>
          <div class="heat-scroll"><table class="rubric inv"><thead><tr><th>Incidente</th><th>Qué lo causó</th><th>Con la alternativa</th><th>Por qué</th></tr></thead><tbody>
            ${d.incidentes.map((i) => `<tr><td><b>${esc(i.id)}</b> · ${esc(i.titulo)}${i.minutos != null ? ` (${i.minutos} min)` : ""}</td><td>${esc(i.causa || "sin definir")}</td><td><span class="pill ${P[i.estado][0]}">${P[i.estado][1]}</span></td><td>${esc(i.porque)}</td></tr>`).join("")}</tbody></table></div>
          <div class="mx-rep2"><div><h5>Componentes únicos</h5>
              <p>${d.unicos_resueltos.length ? `Dejan de serlo: <b>${d.unicos_resueltos.map(esc).join(", ")}</b>.` : "La alternativa no elimina ninguno de los que marcó tu equipo."}</p>
              <p>${d.unicos_que_quedan.length ? `<span class="mx-left">Quedan: ${d.unicos_que_quedan.map((u) => `<b>${esc(u.componente)}</b> (${esc(u.funcion)})`).join(", ")}.</span>` : "No queda ninguno de los que marcó tu equipo."}</p>
              <p>${d.capas_expuestas.length ? `<span class="mx-left">Capa expuesta: <b>${d.capas_expuestas.map(esc).join(" y ")}</b>.</span> Tu equipo tiene hallazgos ahí que la alternativa no atiende.` : "No deja capas expuestas."}</p></div>
            <div><h5>Disponibilidad antes y después</h5>
              ${d.cadenas.length ? `<table class="rubric inv"><thead><tr><th>Servicio (tu cadena del laboratorio)</th><th>Antes</th><th>Después</th><th>Caída al año</th></tr></thead><tbody>
                ${d.cadenas.map((k) => `<tr><td>${esc(k.servicio)}${k.con_respaldo_nuevo.length ? `<br><span class="muted">gana respaldo: ${k.con_respaldo_nuevo.map(esc).join(", ")}</span>` : `<br><span class="muted">la alternativa no cambia esta cadena</span>`}${k.instalacion ? `<br><span class="muted">incluye tu supuesto de la instalación, que no cambia</span>` : ""}</td>
                  <td>${f4(k.antes)} %</td><td><b>${f4(k.despues)} %</b></td><td>${fmt(k.horas_antes, 1)} h → <b>${fmt(k.horas_despues, 1)} h</b></td></tr>`).join("")}</tbody></table>
                <p class="hint">Serie y paralelo con las disponibilidades que tu equipo puso en el laboratorio: a cada componente que la alternativa respalda se le agrega una copia en paralelo.</p>`
                : `<p class="muted">Tu equipo aún no ha armado cadenas en el laboratorio. Ármalas para ver cómo cambia la disponibilidad. <a href="#" data-pgo="lab">Ir al laboratorio</a></p>`}</div></div>`;
        hydrate(out);
      } catch { out.innerHTML = `<p class="muted">Sin conexión con el servidor: no se pudo calcular.</p>`; }
    };
    // ---- Revisión de la decisión: trazabilidad (sin gastar revisión), revisión de la Tutora, cierre y reflexión
    const DEC_ST = { si: ["green", "Sí"], parcial: ["amber", "Parcial"], no: ["red", "No"], na: ["", "No se evalúa"] };
    const decTable = (t) => `<div class="heat-scroll"><table class="rubric inv dec-t"><thead><tr><th></th><th>Hallazgo</th><th>Capa</th><th>¿Lo atiende?</th><th>Evidencia</th></tr></thead><tbody>
      ${t.filas.map((r) => `<tr class="${r.critico ? "dec-crit" : ""}"><td><b>${esc(r.h)}</b>${r.critico ? " ★" : ""}</td><td>${esc(r.hallazgo)}</td><td>${esc(r.capa)}</td><td><span class="pill ${DEC_ST[r.estado][0]}">${DEC_ST[r.estado][1]}</span></td><td class="muted">${esc(r.evidencia)}</td></tr>`).join("")}</tbody></table></div>`;
    const decSum = (t) => `Atiende <b>${t.resumen.criticos_atendidos} de ${t.resumen.criticos}</b> hallazgos críticos y ${t.resumen.atendidos} de ${t.resumen.evaluables} hallazgos evaluables${t.resumen.parciales ? ` (${t.resumen.parciales} a medias)` : ""}${t.resumen.capas_expuestas.length ? `; deja expuesta(s): <b>${t.resumen.capas_expuestas.map(esc).join(" y ")}</b>` : "; no deja capas expuestas"}.`;
    const decReview = (rv, n) => { const r = rv.respuesta, src = (ids) => (ids || []).length ? ` <span class="dec-src">[${ids.map(esc).join("] [")}]</span>` : "", hs = (ids) => (ids || []).length ? `<b>${ids.map(esc).join(", ")}</b> · ` : "";
      const sec = (title, items) => (items.length ? `<h5>${title}</h5><ul class="dec-l">${items.join("")}</ul>` : "");
      return `<div class="dec-rev"><div class="m-card-h"><span class="pill">Revisión ${n}</span><span class="muted">${esc(new Date(rv.at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }))}${rv.quien ? ` · la pidió ${esc(rv.quien)}` : ""}</span></div>
        ${sec("Bien atendidos", (r.bien_atendidos || []).map((x) => `<li><b>${esc(x.hallazgo)}</b> · ${esc(x.comentario)}${src(x.fuentes)}</li>`))}
        ${sec("Sin resolver", (r.sin_resolver || []).map((x) => `<li><b>${esc(x.hallazgo)}</b> <span class="pill ${x.prioridad === "alta" ? "red" : x.prioridad === "media" ? "amber" : ""}">${esc(x.prioridad)}</span> ${esc(x.comentario)}${src(x.fuentes)}</li>`))}
        ${sec("Revisa tu priorización", (r.mal_priorizados || []).map((x) => `<li>${esc(x.comentario)}${src(x.fuentes)}</li>`))}
        ${sec("Riesgos de la decisión", (r.riesgos || []).map((x) => `<li>${hs(x.hallazgos)}${esc(x.texto)}${src(x.fuentes)}</li>`))}
        ${r.coherencia_bmm && r.coherencia_bmm.texto ? `<h5>Coherencia con tu BMM</h5><p>${hs(r.coherencia_bmm.hallazgos)}${esc(r.coherencia_bmm.texto)}${src(r.coherencia_bmm.fuentes)}</p>` : ""}
        ${sec("Tres preguntas para mejorar", (r.preguntas || []).map((q) => `<li>${esc(q)}</li>`))}
        ${mentorChunks(r.fuentes, "Fuentes citadas")}</div>`; };
    function decRender(d) {
      const out = $("#mx-dec-out", body); if (!out) return;
      const t = d.trazabilidad, cons = d.consultora;
      out.innerHTML = `${t ? `<p class="dec-sum">${decSum(t)}${t.validado ? "" : ` <span class="pill amber">estimación sin validar por tu docente</span>`}</p>${decTable(t)}
          <p class="hint">Esta tabla la calcula el servidor con tu registro de hallazgos y lo que resuelve cada patrón. Verla no gasta revisiones. ★ = hallazgo que tu equipo marcó como crítico.</p>`
          : `<p class="muted">${esc(d.motivo || "Aún no hay trazabilidad.")}</p>`}
        ${d.revisiones.map((rv, i) => decReview(rv, i + 1)).join("")}
        ${d.cerrada ? `<div class="notice info">${icon("check")}<span><b>Tu equipo cerró la decisión.</b> La matriz quedó fijada.</span></div>` : `
          <div class="row-actions"><button type="button" class="btn btn-primary" data-decreview ${d.habilitada && d.quedan > 0 && t ? "" : "disabled"}>${icon("lightbulb")} ${d.quedan > 0 ? `Pedir la revisión de la Tutora · quedan ${d.quedan} de ${d.max}` : `Revisiones agotadas (${d.usadas} de ${d.max})`}</button>
            ${d.puede_cerrar ? `<button type="button" class="btn" data-decclose>Cerrar y ver la mirada de la consultora</button>` : ""}
            ${!d.habilitada && d.motivo ? `<span class="hint">${esc(d.motivo)}</span>` : ""}</div>
          <div class="notice dec-confirm" hidden>${icon("alert")}<span><b>Al ver la mirada de la consultora tu decisión queda fijada. ¿Continuar?</b> Ya no podrán cambiar la matriz ni pedir más revisiones.
            <button type="button" class="btn btn-sm btn-primary" data-decclose2>Sí, cerrar la decisión</button> <button type="button" class="btn btn-sm btn-ghost" data-deccancel>Todavía no</button></span></div>`}
        ${cons ? `<div class="dec-cons"><h5>${icon("users")} La mirada de la consultora</h5><p><b>Recomendaría: ${esc(cons.alternativa)}</b></p><p>${esc(cons.porque)}</p></div>
          ${d.reflexion ? `<h5>La reflexión de tu equipo</h5><blockquote class="m-quote">${esc(d.reflexion)}</blockquote>`
            : `<label class="dec-refl">Reflexión sobre el contraste: ¿por qué su decisión coincide o difiere de la mirada de la consultora, y la sostienen? (unas 150 palabras; mínimo 15). Se califica argumentar, no coincidir.<textarea id="dec-refl" placeholder="Nuestra decisión coincide en … y difiere en … porque … La sostenemos (o la ajustaríamos) porque …"></textarea></label>
               <div class="row-actions"><button type="button" class="btn btn-primary" data-decrefl>Guardar la reflexión</button></div>`}
          ${cons.trazabilidad && t ? `<h5>Las dos decisiones, lado a lado</h5><div class="dec-side"><div><p><b>La de tu equipo:</b> ${esc(d.decision.alternativa)}</p><p class="dec-sum">${decSum(t)}</p>${decTable(t)}</div>
            <div><p><b>La de la consultora:</b> ${esc(cons.alternativa)}</p><p class="dec-sum">${decSum(cons.trazabilidad)}</p>${decTable(cons.trazabilidad)}</div></div>` : ""}` : ""}`;
      hydrate(out);
      if (d.cerrada) $$("input, select, textarea, button", body).forEach((el) => { if (!el.closest("#mx-dec") && !el.closest("#mx-replay") && !el.closest("#e3-fin") && !el.closest("#e3-card") && !el.closest(".mentor-btn") && !/dl-md|cp-md/.test(el.id)) el.disabled = true; });
      e3Load();
    }
    // ---- Entrega 3: estado, lo que falta, declaración de uso de IA y PDF (todo lo calcula y lo guarda el servidor)
    const e3Fetch = async (path, payload) => {
      const r = await fetch(apiBase() + path, payload ? { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ case_id: cid, ...payload }) } : { headers: authHeaders() });
      return { ok: r.ok, d: await r.json() };
    };
    function e3Paint(s) {
      const out = $("#e3-out", body), fin = $("#e3-fin-out", body);
      if (out) out.innerHTML = `<p><b>Fecha límite:</b> ${s.fecha_limite.texto ? esc(s.fecha_limite.texto) : "tu docente aún no la ha definido"}${s.fecha_limite.vencida ? ` <span class="pill red">vencida</span>` : ""}
          <span class="muted">· cuenta la última versión del PDF generada antes de esa fecha</span></p>
        <div class="e3-steps">${s.pasos.map((p, i) => `<span class="pill ${p.ok ? "green" : ""}">${p.ok ? icon("check") : i + 1 + "."} ${esc(p.nombre)}</span>`).join("")}</div>
        ${s.falta.length ? `<p class="mx-grp">Te falta</p><ul class="mx-evl">${s.falta.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<div class="notice info">${icon("check")}<span><b>Todo listo.</b> Ya puedes generar el PDF de la Entrega 3 al final de esta pestaña.</span></div>`}`;
      if (fin) fin.innerHTML = !s.cerrada ? `<p class="muted">Se activa cuando tu equipo cierre la decisión. La declaración y el PDF van después de ver la mirada de la consultora.</p>` : `
        <p class="muted">Registro de la plataforma para tu equipo en este caso: ${s.uso_ia.pistas} pistas y ${s.uso_ia.revisiones} revisiones del Mentor, ${s.uso_ia.tutor_integral} revisiones integrales del Tutor y ${s.uso_ia.revisiones_de_decision} revisiones de la decisión. Este resumen sale en el PDF junto a tu declaración.</p>
        <label>Declaración de uso de IA: cómo usaron el Mentor y el Tutor, y qué verificaron por su cuenta (unas 100 palabras; mínimo 15). La escribe tu equipo.<textarea id="e3-ai" placeholder="Usamos el Mentor para … y la Tutora para … Verificamos por nuestra cuenta …">${esc(s.declaracion_ia || "")}</textarea></label>
        <div class="row-actions"><button type="button" class="btn" data-e3ai>Guardar la declaración</button>
          <button type="button" class="btn btn-primary" data-e3gen ${s.puede_generar ? "" : "disabled"}>${icon("download")} <span class="lbl">Generar y descargar Entrega 3 (PDF)</span></button>
          ${s.puede_generar ? "" : `<span class="hint">Te falta: ${esc(s.falta.join("; "))}.</span>`}</div>
        ${s.entregas.length ? `<p class="mx-grp">Versiones generadas</p><ul class="mx-evl">${s.entregas.map((e) => `<li><b>Versión ${e.version}</b> · ${esc(e.fecha)} · código <code>${esc(e.code)}</code>${e.late ? ` <span class="pill red">fuera de plazo</span>` : ""}${s.cuenta === e.version ? ` <span class="pill green">la que cuenta</span>` : ""}
          <button type="button" class="btn btn-sm btn-ghost" data-e3dl="${e.version}">Descargar</button></li>`).join("")}</ul>` : ""}`;
    }
    async function e3Load() {
      if (!$("#e3-card", body) || !tw.on || tw.cid !== cid || !apiBase()) return;
      try { const { ok, d } = await e3Fetch("/api/e3/state?case_id=" + cid); if (ok && $("#e3-card", body)) e3Paint(d); } catch { /* sin conexión: la tarjeta queda con su texto inicial */ }
    }
    async function e3Download(v) {
      try {
        const r = await fetch(`${apiBase()}/api/e3/pdf?case_id=${cid}${v ? "&v=" + v : ""}`, { headers: authHeaders() }); if (!r.ok) return toast("No se pudo descargar el PDF");
        const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = `Entrega3_${cid}${v ? "_v" + v : ""}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } catch { toast("Sin conexión con el servidor"); }
    }
    if ($("#e3-card", body)) {
      setTimeout(e3Load, 2300);
      fetch(apiBase() + "/api/e3/rubric").then((r) => r.json()).then((rb) => { const el = $("#e3-rubric", body); if (!el) return; const lv = rb.niveles.filter((n) => n.id !== "ausente");
        el.innerHTML = `<div class="heat-scroll"><table class="matrix e3-rb"><thead><tr><th>Criterio</th>${lv.map((n) => `<th>${esc(n.nombre)} (${n.valor} %)</th>`).join("")}</tr></thead><tbody>${rb.criterios.map((k) => `<tr><td><b>${k.n}. ${esc(k.nombre)}</b> (${k.peso} %)</td>${lv.map((n) => `<td>${esc(k.descriptores[n.id])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
          <p class="hint">Un criterio ausente vale 0 %. La nota se calcula sobre ${fmt(rb.nota_maxima, 1)} y equivale al ${rb.peso_en_la_nota} % de la asignatura. La califica tu docente sobre el PDF.</p>`; }).catch(() => {});
      body.addEventListener("click", async (e) => {
        if (e.target.closest("[data-e3ai]")) { const { ok, d } = await e3Fetch("/api/e3/ai-statement", { text: $("#e3-ai", body).value }); if (!ok) return toast(d.error || "No se pudo guardar"); toast("Declaración guardada"); return e3Load(); }
        if (e.target.closest("[data-e3gen]")) { const b = e.target.closest("[data-e3gen]"); b.disabled = true; toast("Generando el PDF…");
          const { ok, d } = await e3Fetch("/api/e3/generate", {}); if (!ok) { b.disabled = false; return toast(d.error || "No se pudo generar"); }
          toast(d.nueva ? `Versión ${d.version} generada · código ${d.codigo}` : `Sin cambios desde la versión ${d.version}`); await e3Download(d.version); return e3Load(); }
        const dl = e.target.closest("[data-e3dl]"); if (dl) return e3Download(dl.dataset.e3dl);
      });
    }
    const decCall = async (path, payload, busy) => {
      const out = $("#mx-dec-out", body); if (!out || !tw.on || tw.cid !== cid || !apiBase()) return;
      if (busy) out.insertAdjacentHTML("beforeend", `<p class="muted dec-busy"><span class="spinner"></span> ${busy}</p>`);
      try {
        const r = await fetch(apiBase() + path, payload ? { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ case_id: cid, ...payload }) } : { headers: authHeaders() });
        const d = await r.json(); if (!$("#mx-dec-out", body)) return;
        $$(".dec-busy", out).forEach((x) => x.remove());
        if (!r.ok) return toast(d.error || "No se pudo completar");
        decRender(d);
      } catch { $$(".dec-busy", out).forEach((x) => x.remove()); toast("Sin conexión con el servidor"); }
    };
    if ($("#mx-dec", body)) {
      setTimeout(() => decCall("/api/decision/state?case_id=" + cid), 2000);
      $("#mx-dec", body).addEventListener("click", (e) => {
        if (e.target.closest("[data-decreview]")) { e.target.closest("[data-decreview]").disabled = true; return void decCall("/api/decision/review", {}, "La Tutora está revisando tu decisión; puede tardar hasta dos minutos…"); }
        if (e.target.closest("[data-decclose]")) { $(".dec-confirm", body).hidden = false; return; }
        if (e.target.closest("[data-deccancel]")) { $(".dec-confirm", body).hidden = true; return; }
        if (e.target.closest("[data-decclose2]")) return void decCall("/api/decision/close", { confirm: true }, "Cerrando la decisión…");
        if (e.target.closest("[data-decrefl]")) return void decCall("/api/decision/reflection", { text: $("#dec-refl", body).value }, "Guardando…");
      });
    }
    if ($("#mx-replay", body)) { setTimeout(replay, 1800); $("#mx-replay-go", body).addEventListener("click", () => { $("#mx-replay-out", body).innerHTML = `<p class="muted">Calculando…</p>`; setTimeout(replay, 1500); }); }
    findingsBind(body, c);
    // Si el trabajo del equipo cambió, el registro guardado en el servidor se pone al día con las filas vigentes.
    if (tw.on && tw.cid === cid) { const fs0 = fdState(cid), now = fdRows(fdBuild(c).rows); if ((fs0.rows.length || Object.keys(fs0.st).length) && JSON.stringify(fs0.rows) !== JSON.stringify(now)) { fs0.rows = now; store.set(cid + ":findings", fs0); } }
    const clean = () => mxClean(m);
    const save = (rerender) => { store.set(cid + ":matrix", clean()); if (rerender) renderTab(); else updateTotals(); };
    const touchW = () => { m.wok = false; };
    const updateTotals = () => {
      const sw = m.criteria.reduce((s, k) => s + (+k.w || 0), 0) || 1;
      const tots = m.alts.map((a) => m.criteria.reduce((s, k, i) => s + (+k.w || 0) * (a.s[i] || 0), 0) / (sw * 5) * 100);
      const mx = Math.max(...tots);
      $$("table.matrix:not(.mx-w) tfoot tr:first-child td", body).slice(2).forEach((td, i) => { td.textContent = fmt(tots[i], 1); td.style.color = tots[i] === mx ? "#34d399" : ""; });
      if (radar) { radar.data.labels = m.criteria.map((k) => (k.n || "Propio").length > 22 ? k.n.slice(0, 20) + "…" : k.n || "Propio"); radar.data.datasets.forEach((d, i) => (d.data = m.alts[i].s.slice())); radar.update(); }
    };
    const cid6 = () => "c" + Date.now().toString(36);
    body.addEventListener("click", (e) => {
      if (e.target.closest("#e2-add")) { m.tobe.e2.push({ id: "H" + String(m.tobe.e2.length + 1).padStart(2, "0"), t: "", links: [] }); return save(true); }
      if (e.target.closest("[data-e2rm]")) { const gone = (m.tobe.e2.splice(+e.target.closest("[data-e2rm]").dataset.e2rm, 1)[0] || {}).id; m.tobe.cond.forEach((x) => { x.h = (x.h || []).filter((h) => h !== gone); }); return save(true); }
      if (e.target.closest("#cd-add")) { if (m.tobe.cond.length < 8) m.tobe.cond.push({ id: cid6(), t: "", d: "", h: [], m: [], mt: "" }); return save(true); }
      if (e.target.closest("[data-cdrm]")) { const gone = (m.tobe.cond.splice(+e.target.closest("[data-cdrm]").dataset.cdrm, 1)[0] || {}).id; m.alts.forEach((a) => { if (Array.isArray(a.cond)) a.cond = a.cond.filter((x) => x !== gone); }); return save(true); }
      const p = e.target.closest("[data-pick]");
      if (p) { const k = p.dataset.pick; const i = m.alts.findIndex((a) => a.id === k); if (i >= 0) m.alts.splice(i, 1); else if (m.alts.length < 4) m.alts.push({ id: k, name: PATTERNS[k].name, pats: [k], s: m.criteria.map(() => 3), t: [], j: "", ok: false }); else toast("Máximo 4 alternativas"); return save(true); }
      if (e.target.closest("#cmb-add")) {
        const pats = $$("[data-cmb]:checked", body).map((x) => x.dataset.cmb);
        if (pats.length < 2 || pats.length > 3) return toast("Elige 2 o 3 patrones para combinar");
        if (m.alts.length >= 4) return toast("Máximo 4 alternativas");
        const id = "k-" + twHash(pats.slice().sort().join("+")); if (m.alts.some((a) => a.id === id)) return toast("Esa combinación ya está en tu matriz");
        m.alts.push({ id, name: $("#cmb-name").value.trim() || pats.map((k) => PATTERNS[k].name.split(" (")[0]).join(" + "), pats, s: m.criteria.map(() => 3), t: [], j: "", ok: false }); return save(true);
      }
      const up = e.target.closest("[data-useprop]"); if (up) { const a = m.alts[+up.dataset.useprop]; a.t = []; a.sr = ""; a.ok = false; return save(true); }
      const r = e.target.closest("[data-rmalt]"); if (r) { m.alts.splice(+r.dataset.rmalt, 1); return save(true); }
      if (e.target.closest("#add-custom")) { const v = $("#custom-alt").value.trim(); if (!v) return; if (m.alts.length >= 4) return toast("Máximo 4 alternativas"); m.alts.push({ id: "u-" + twHash(v), name: v, pats: [], s: m.criteria.map(() => 3), t: [], j: "", ok: false }); return save(true); }
      if (e.target.closest("#mx-own")) { m.criteria.push({ id: "own", n: "", wp: 0, why: [], active: true, w: 0, touched: true, reason: "" }); m.alts.forEach((a) => a.s.push(3)); touchW(); return save(true); }
      if (e.target.closest("[data-mxownrm]")) { const i = m.criteria.findIndex((k) => k.id === "own"); if (i >= 0) { m.criteria.splice(i, 1); m.alts.forEach((a) => a.s.splice(i, 1)); } touchW(); return save(true); }
      if (e.target.closest("#mx-reset")) { m.criteria.forEach((k) => { if (k.id !== "own") { k.w = k.wp; k.touched = false; k.reason = ""; } }); touchW(); return save(true); }
      if (e.target.closest("#mx-ok")) { m.wok = true; toast("Pesos confirmados"); return save(true); }
      if (e.target.closest("#mx-old") && m.old) return openModal(`<h2 id="modal-title">Matriz anterior de tu equipo</h2><p class="muted">Se conserva tal como estaba. Sus puntajes se trasladaron a los criterios nuevos donde había equivalencia.</p>
        <div class="heat-scroll"><table class="rubric inv"><thead><tr><th>Criterio</th><th>Peso</th>${m.old.alts.map((a) => `<th>${esc(a.name)}</th>`).join("")}</tr></thead>
        <tbody>${m.old.criteria.map((k, i) => `<tr><td>${esc(k.n)}</td><td>${esc(k.w)}</td>${m.old.alts.map((a) => `<td>${esc(a.s?.[i] ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      if (e.target.closest("#dl-md")) { const blob = new Blob([exportMd(c, m)], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `InfraLab_${c.case_id}_matriz.md`; document.body.appendChild(a); a.click(); a.remove(); return; }
      if (e.target.closest("#cp-md")) { navigator.clipboard?.writeText(exportMd(c, m)).then(() => toast("Informe copiado"), () => toast("No se pudo copiar")); }
    });
    body.addEventListener("change", (e) => {
      const d = e.target.dataset, tog = (list, v, on) => { const s = new Set(list || []); if (on) s.add(v); else s.delete(v); return [...s]; };
      if (d.e2l) { const [i, rid] = d.e2l.split("|"); m.tobe.e2[+i].links = tog(m.tobe.e2[+i].links, rid, e.target.checked); return save(true); }
      if (d.cdh) { const [i, h] = d.cdh.split("|"); m.tobe.cond[+i].h = tog(m.tobe.cond[+i].h, h, e.target.checked); return save(true); }
      if (d.cdtr != null) { m.tobe.cond[+d.cdtr].tr = e.target.checked; return save(true); }
      if (d.cdm) { const [i, k] = d.cdm.split("|"); m.tobe.cond[+i].m = tog(m.tobe.cond[+i].m, k, e.target.checked); return save(true); }
      if (d.acond) { const [i, k] = d.acond.split("|"); m.alts[+i].cond = tog(m.alts[+i].cond, k, e.target.checked); return save(true); }
      if (d.acnone != null) { m.alts[+d.acnone].cond = e.target.checked ? [] : undefined; if (!e.target.checked) delete m.alts[+d.acnone].cond; return save(true); }
      if (d.e2id != null || d.e2t != null || d.cdt != null) return save(true);   // al salir del campo se actualizan las casillas que dependen de él
      if (d.s) { const [ai, ci] = d.s.split("-").map(Number), a = m.alts[ai], pr = a._p && a._p.s[m.criteria[ci].id];
        const v = Math.round(Math.max(1, Math.min(5, parseFloat(String(e.target.value).replace(",", ".")) || 1)) * 10) / 10;
        a.s[ci] = v; a.t = m.criteria.map((_, i) => !!a.t[i]); a.t[ci] = pr != null && v !== pr; a.ok = false; return save(true); }
      if (d.hold != null || d.sr != null) return save(true);  // al salir del campo se recalcula qué falta para marcarla como revisada
      if (d.mxw != null) { const k = m.criteria[+d.mxw]; k.w = Math.max(0, Math.min(100, Math.round(+e.target.value || 0))); k.touched = k.id === "own" || k.w !== k.wp; if (!k.touched) k.reason = ""; touchW(); return save(true); }
      if (d.mxr != null || d.mxcoh || d.mxown) return save(true);  // al salir del campo se recalcula qué falta para confirmar
      if (d.aok != null) { m.alts[+d.aok].ok = e.target.checked; return save(true); }
      if (e.target.id === "mx-dalt") { m.decision.alt = e.target.value; return save(true); }
      if (e.target.id === "mx-dtext" || e.target.id === "mx-dcrit") return save(true);
    });
    body.addEventListener("input", (e) => {
      const d = e.target.dataset, quiet = () => store.set(cid + ":matrix", clean());
      if (d.e2id != null) { const old = m.tobe.e2[+d.e2id].id, now = e.target.value.trim().toUpperCase(); m.tobe.cond.forEach((x) => { x.h = (x.h || []).map((h) => (h === old ? now : h)); }); m.tobe.e2[+d.e2id].id = now; return quiet(); }
      if (d.e2t != null) { m.tobe.e2[+d.e2t].t = e.target.value; return quiet(); }
      if (d.cdt != null) { m.tobe.cond[+d.cdt].t = e.target.value; return quiet(); }
      if (d.cdd != null) { m.tobe.cond[+d.cdd].d = e.target.value; return quiet(); }
      if (d.cdtrw != null) { m.tobe.cond[+d.cdtrw].trw = e.target.value; return quiet(); }
      if (d.cdmt != null) { m.tobe.cond[+d.cdmt].mt = e.target.value; return quiet(); }
      if (d.xk) { m.exec[d.xk] = e.target.value; const n = $("#mx-xcount", body); if (n) { n.textContent = `Recomendación ejecutiva: ${e3Words(m)} palabras (unas 400 como máximo). La escribe tu equipo: la plataforma no la redacta.`; n.style.color = e3Words(m) > 400 ? "#fbbf24" : ""; } return quiet(); }
      if (d.mxr != null) { m.criteria[+d.mxr].reason = e.target.value; m.wok = false; return quiet(); }
      if (d.mxcoh) { m.coh[d.mxcoh] = e.target.value; m.wok = false; return quiet(); }
      if (d.mxown === "n") { m.criteria.find((k) => k.id === "own").n = e.target.value; m.wok = false; return quiet(); }
      if (d.j != null) { m.alts[+d.j].j = e.target.value; return quiet(); }
      if (d.hold != null) { const [ai, wid] = d.hold.split("|"); m.alts[+ai].hold[wid] = e.target.value; return quiet(); }
      if (d.sr != null) { m.alts[+d.sr].sr = e.target.value; return quiet(); }
      if (e.target.id === "mx-dcrit") { m.decision.crit_why = e.target.value; return quiet(); }
      if (e.target.id === "mx-dtext") { m.decision.text = e.target.value; const n = $("#mx-dcount", body); if (n) n.textContent = `${MX.words(m.decision.text)} de 15 palabras`; return quiet(); }
    });
    const pal = ["#22d3ee", "#a78bfa", "#f472b6", "#fbbf24"];
    const radar = m.alts.length ? makeChart($("#ch-matrix"), { type: "radar", data: { labels: m.criteria.map((k) => (k.n || "Propio").length > 22 ? k.n.slice(0, 20) + "…" : k.n || "Propio"), datasets: m.alts.map((a, i) => ({ label: a.name.length > 28 ? a.name.slice(0, 26) + "…" : a.name, data: a.s.slice(), borderColor: pal[i], backgroundColor: alpha(pal[i], .15), pointBackgroundColor: pal[i] })) },
      options: { maintainAspectRatio: false, scales: { r: { min: 0, max: 5, ticks: { stepSize: 1, display: false }, grid: { color: "rgba(148,163,184,.15)" }, angleLines: { color: "rgba(148,163,184,.15)" }, pointLabels: { color: "#cdd7e8", font: { size: 11 } } } }, plugins: { legend: { position: "bottom" } } } }, wsCharts) : null;
  }

  function exportMd(c, m) {
    const sw = m.criteria.reduce((s, k) => s + (+k.w || 0), 0) || 1;
    const tot = (a) => (m.criteria.reduce((s, k, i) => s + (+k.w || 0) * a.s[i], 0) / (sw * 5) * 100).toFixed(1);
    const q = store.get(c.case_id + ":q", {});
    let md = `# InfraLab · ${c.case_id} — ${c.title}\n\n**Sector:** ${c.sector}  \n**Reto:** ${c.challenge_type}  \n**Fecha:** ${new Date().toLocaleDateString("es-CO")}\n\n## Matriz de decisión\n\n`;
    md += `| Criterio | Peso % | ${m.alts.map((a) => a.name).join(" | ")} |\n|---|---|${m.alts.map(() => "---").join("|")}|\n`;
    m.criteria.forEach((k, i) => (md += `| ${k.n || "Criterio propio"} | ${k.w} | ${m.alts.map((a) => a.s[i]).join(" | ")} |\n`));
    md += `| **Puntaje ponderado (0-100)** | ${sw} | ${m.alts.map((a) => `**${tot(a)}**`).join(" | ")} |\n\n## Justificación\n\n`;
    m.alts.forEach((a) => (md += `### ${a.name}\n\n${a.j || "_(pendiente)_"}\n\n`));
    md += `## Por qué pesa cada criterio\n\n${m.criteria.map((k) => `- **${k.n || "Criterio propio"} (${k.w} %)**: ${(k.why || []).join("; ")}${k.reason ? ` — ajuste del equipo: ${k.reason}` : ""}`).join("\n")}\n\n`;
    if (m.decision && (m.decision.alt || m.decision.text)) md += `## Decisión del equipo\n\n**${(m.alts.find((a) => (a.id || a.name) === m.decision.alt) || {}).name || "(sin elegir)"}**\n\n${m.decision.text || "_(pendiente)_"}\n\n`;
    const calc = store.get(c.case_id + ":calc", {}), itil = getInc(c.case_id);
    md += `## Cálculos (servicio: ${c.data.service.name})\n\n| Indicador | Mi resultado | Verificado |\n|---|---|---|\n`;
    CALC_FIELDS.forEach(([k, l, u]) => (md += `| ${l} | ${calc[k] != null ? calc[k] + " " + u : "—"} | ${calc[k + "_ok"] ? "✅" : "—"} |\n`));
    md += `\n## Incidentes: ITIL · COBIT · ISO/IEC 27001\n\n`;
    c.data.incidents.forEach(([id, t]) => (md += `- **${id}. ${t}** → ITIL: ${itil[id]?.itil || "—"} · COBIT: ${itil[id]?.cobit || "—"} · ISO: ${itil[id]?.iso || "—"}\n`));
    const tr = store.get(c.case_id + ":tier", null);
    if (tr) { const t = RD.norm(tr), lab = (list, ids) => ids.map((id) => (list.find((x) => x[0] === id) || [, id])[1]).join("; ") || "—";
      md += `\n## Redundancia de la arquitectura TI\n\n- Nivel actual: ${RD.levelLabel(t.actual) || "—"}\n- Nivel objetivo: ${RD.levelLabel(t.objetivo) || "—"}\n- Componentes únicos: ${tierComps(c).filter((n) => t.ev[n[0]] === "u").map((n) => n[1]).join(", ") || "—"}\n- Componentes con respaldo: ${tierComps(c).filter((n) => t.ev[n[0]] === "r").map((n) => n[1]).join(", ") || "—"}\n${t.just ? `- Matiz: ${t.just}\n` : ""}`;
      md += `\n## Tier de la instalación\n\n- Información que haría falta: ${lab(RD.info, t.b.info)}\n- A quién se pediría: ${lab(RD.who, t.b.who)}\n- La más importante: ${lab(RD.info, t.b.top ? [t.b.top] : [])}${t.b.why ? " — " + t.b.why : ""}\n`; }
    md += `\n`;
    const bm = store.get(c.case_id + ":bmm", null);
    if (bm) {
      md += `\n## BMM · ${c.data.org}\n\n**Visión:** ${bm.vision || "—"}\n\n**Misión:** ${bm.mision || "—"}\n\n`;
      Object.entries(BMM_LISTS).forEach(([k, L]) => { if (bm[k].length) md += `**${L.title}:**\n\n` + bm[k].map((x, i) => `${i + 1}. ${x.t || ""}${x.m ? ` — KPI: ${x.m}` : ""}${x.v ? ` · meta: ${x.v}` : ""}${x.p ? ` · plazo: ${x.p}` : ""}`).join("\n") + "\n\n"; });
      md += `**Influenciadores:**\n\n` + bm.influenciadores.map((f, i) => `${i + 1}. ${f.t} (${f.o || "sin origen"} · ${f.cat || "sin categoría"})`).join("\n") + "\n\n";
    }
    const chains = labChainsFor(c.case_id);
    if (chains.length) { md += `## Laboratorio: servicios analizados\n\n`; chains.forEach((ch) => (md += `- **${ch.servicio}** (criticidad ${ch.criticidad_informada}, importancia asignada ${ch.importancia_asignada}): ${ch.componentes.map((x) => `${x.activo} [${x.disponibilidad} % ×${x.copias}, crit. ${x.criticidad}]`).join(" → ")} ⇒ ${ch.disponibilidad_calculada} %\n`)); md += "\n"; }
    md += `## Preguntas guía\n\n`;
    c.questions.forEach((qq, i) => (md += `${i + 1}. **${qq}**${q[i]?.done ? " ✅" : ""}\n\n   ${(q[i]?.a || "_(sin respuesta)_").replace(/\n/g, "\n   ")}\n\n`));
    return md;
  }

  /* ==================== EQUIPO: ingreso con código + correo y seguimiento ==================== */
  function apiBase() { return ((window.INFRALAB_CONFIG || {}).API_BASE || "").replace(/\/+$/, ""); }
  function teamSession() { return store.get("team", null); }
  function authHeaders() { const t = teamSession(); return t && t.token ? { Authorization: "Bearer " + t.token } : {}; }
  function teamCase() { return teamSession()?.team?.case_id || null; }
  function renderTeamBtn() {
    const b = $("#team-btn"); if (!b) return;
    const t = teamSession();
    b.hidden = !apiBase();
    b.classList.toggle("on", !!t);
    b.innerHTML = t ? `${icon("users")} <span>${esc(t.team.name)} · ${esc(t.team.nrc)}</span><b class="team-case ${t.team.case_id ? "" : "none"}">${t.team.case_id ? `Caso del equipo: ${esc(t.team.case_id)}` : "Sin caso registrado"}</b>` : `${icon("key")} <span>Ingresar con mi equipo</span>`;
  }
  function teamCardHtml() {
    const t = teamSession();
    if (!apiBase()) return `<p class="muted">El servidor del curso no está configurado: puedes trabajar sin ingresar y todo se guarda en este navegador.</p>`;
    if (t) return `<div class="team-in"><span class="pill green">${icon("check")} Equipo verificado</span>
        <h3>${esc(t.team.name)} <small class="muted">· NRC ${esc(t.team.nrc)} · ${esc(t.team.period)}</small></h3>
        <p style="margin:0 0 6px"><span class="pill ${t.team.case_id ? "green" : "amber"}">${t.team.case_id ? `Caso del equipo: ${esc(t.team.case_id)}` : "Sin caso registrado"}</span></p>
        <p class="muted" style="margin:0 0 6px">Ingresaste como <b>${esc(t.member.firstname)} ${esc(t.member.lastname)}</b></p>
        <p style="margin:0 0 10px">Integrantes: ${t.team.members.map(esc).join(", ")}</p>
        ${t.team.case_id ? `<button class="btn btn-sm btn-primary" data-open-case="${t.team.case_id}">${icon("arrow")} Abrir el caso de mi equipo (${t.team.case_id})</button>` : `<p class="hint"><b>Tu equipo aún no ha registrado su caso.</b></p><button class="btn btn-sm btn-primary" data-case-reg>${icon("target")} Registrar el caso del equipo</button>`}
        <p class="hint">Tu avance (ejercicios, preguntas, BMM, cálculos, matriz) y tus solicitudes al tutor quedan registrados para el seguimiento del docente.</p>
        <button class="btn btn-sm btn-ghost" data-team="logout">Salir del equipo</button></div>`;
    return `<p class="muted" style="margin-top:0">Ingresa con el <b>código de tu equipo</b> (te lo entrega tu docente) y tu <b>correo institucional</b>.</p>
      <label>Código del equipo<input type="text" data-team-f="code" placeholder="83600-02-ABCDE" autocomplete="off"></label>
      <label style="margin-top:10px">Correo institucional<input type="email" data-team-f="email" placeholder="usuario@uniminuto.edu.co" autocomplete="email"></label>
      <button class="btn btn-primary btn-sm" data-team="login" style="margin-top:12px">Ingresar</button><p class="hint" data-team-msg></p>`;
  }
  function openTeamModal() {
    openModal(`<div class="m-head"><div class="m-ico">${icon("users")}</div><div><div class="kick">InfraLab</div><h2 id="modal-title">Mi equipo</h2></div></div><div class="team-card">${teamCardHtml()}</div>`, "#22d3ee");
  }
  async function teamLogin(box) {
    const code = $("[data-team-f=code]", box)?.value.trim(), email = $("[data-team-f=email]", box)?.value.trim();
    const msg = $("[data-team-msg]", box);
    if (!code || !email) { msg.textContent = "Escribe el código y tu correo."; return; }
    msg.textContent = "Verificando…";
    try {
      const r = await fetch(apiBase() + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, email }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "No fue posible ingresar.");
      store.set("team", { token: d.token, team: d.team, member: d.member, at: Date.now() });
      if (store.get("localowner", null) == null) store.set("localowner", d.team.id); // el trabajo previo de este navegador se asocia al primer equipo que ingresa
      if (!modal.hidden && $("#modal-body .team-card")) closeModal();
      if (!d.team.case_id && window.INFRALAB_CATALOG?.refresh) window.INFRALAB_CATALOG.refresh(true); // casos nuevos disponibles para su NRC
      toast(`Bienvenido, ${d.member.firstname}`); afterTeamChange(); syncProgress(); syncTours();
    } catch (e) { msg.textContent = e.message; }
  }
  function teamLogout(silent) {
    twStop(true); // computadores compartidos: la copia local del trabajo del equipo se borra al salir
    try { localStorage.removeItem("infralab:team"); } catch { /* */ }
    if (!silent) toast("Saliste del equipo"); afterTeamChange();
  }
  async function teamLogoutSafe(btn) {
    if (Object.keys(tw.queue).length) await twFlush();
    const n = Object.keys(tw.queue).length;
    if (n && !btn.dataset.armed) { btn.dataset.armed = "1"; btn.textContent = "Salir de todas formas"; toast(`Hay ${n} cambio(s) sin enviar al servidor. Si sales ahora se perderán en este computador.`); return; }
    teamLogout();
  }
  function afterTeamChange() {
    renderTeamBtn(); renderCases(); caseGate(); twStart();
    $$(".team-card").forEach((el) => { el.innerHTML = teamCardHtml(); hydrate(el); });
    if (currentCase && currentTab === "tutor") renderTab();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-team]"); if (!b) return;
    if (b.dataset.team === "login") teamLogin(b.closest(".team-card") || document);
    if (b.dataset.team === "logout") teamLogoutSafe(b);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.closest("[data-team-f]")) teamLogin(e.target.closest(".team-card")); });

  /* ==================== CASO DEL EQUIPO: registro por los estudiantes ==================== */
  // El primer integrante que confirma fija el caso para todo el equipo; después solo el docente lo cambia en /admin.
  // «localowner» marca a qué equipo pertenece el trabajo guardado en este navegador (computadores compartidos).
  function localWorkScore(cid) {
    const c = byId[cid]; if (!c) return 0;
    const q = store.get(cid + ":q", {}), calc = store.get(cid + ":calc", {}), inc = getInc(cid), tier = tierGet(cid);
    const bmm = store.get(cid + ":bmm", null), m = store.get(cid + ":matrix", null);
    const words = (t) => (String(t || "").match(/[a-záéíóúñ]{3,}/gi) || []).length;
    return Object.values(q).filter((x) => x && words(x.a) >= 15).length
      + CALC_FIELDS.filter(([k]) => typeof calc[k] === "number").length
      + Object.values(inc).filter((v) => v && v.itil && v.cobit && v.iso).length
      + (RD.done(tier) ? 1 : 0)
      + (bmm ? ["metas", "objetivos", "estrategias", "tacticas", "politicas", "reglas", "influenciadores"].filter((k) => (bmm[k] || []).length).length : 0)
      + labChainsFor(cid).length + ((m && m.alts) || []).length;
  }
  function localSuggestions() {
    const t = teamSession(); if (!t) return [];
    const owner = store.get("localowner", null);
    if (owner != null && owner !== t.team.id) return []; // trabajo de otro equipo en este navegador: no se usa ni se sugiere
    return CASES.map((c) => ({ c, n: localWorkScore(c.case_id) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  }
  function renderCaseBanner() {
    const el = $("#case-banner"); if (!el) return;
    const t = teamSession();
    el.hidden = !(t && !t.team.case_id);
    if (!el.hidden) {
      el.innerHTML = `${icon("alert")}<span><b>Tu equipo aún no ha registrado su caso.</b> Regístralo para que el Mentor, el progreso y el seguimiento de tu docente funcionen.</span><button type="button" class="btn btn-sm btn-primary" data-case-reg>Registrar el caso del equipo</button>`;
      hydrate(el);
    }
  }
  let caseRegShown = false;
  function openCaseRegistration(pick) {
    const t = teamSession(); if (!t) return openTeamModal();
    if (t.team.case_id) { toast(`Tu equipo ya tiene registrado el caso ${t.team.case_id}`); return; }
    const sug = localSuggestions();
    if (pick) {
      const c = byId[pick];
      openModal(`<div class="m-head"><div class="m-ico">${icon("target")}</div><div><div class="kick">Caso del equipo</div><h2 id="modal-title">Confirma el registro</h2></div></div>
        <div class="case-confirm" style="--c:${c.color}"><div class="case-ico" style="--c:${c.color}">${icon(c.icon)}</div>
          <div><b>${c.case_id} · ${esc(c.title)}</b><span class="muted">${esc(c.sector)} · ${esc(c.challenge_type)}</span></div></div>
        <p class="m-prompt">Registrar <b>${c.case_id}</b> para el <b>${esc(t.team.name)}</b> (NRC ${esc(t.team.nrc)}). <b>Aplica a todo el equipo</b> y después solo tu docente puede cambiarlo.</p>
        <div class="row-actions"><button type="button" class="btn btn-ghost" data-case-reg>Volver a la lista</button><button type="button" class="btn btn-primary" data-case-confirm="${c.case_id}">${icon("check")} Registrar ${c.case_id} para el equipo</button></div>`, c.color);
      return;
    }
    const card = (c, extra = "") => `<button type="button" class="case-pick" data-case-pick="${c.case_id}" style="--c:${c.color}"><span class="case-ico" style="--c:${c.color}">${icon(c.icon)}</span><span><b>${c.case_id} · ${esc(c.title)}</b><small>${esc(c.sector)}</small>${extra}</span></button>`;
    openModal(`<div class="m-head"><div class="m-ico">${icon("target")}</div><div><div class="kick">${esc(t.team.name)} · NRC ${esc(t.team.nrc)}</div><h2 id="modal-title">Tu equipo aún no ha registrado su caso</h2></div></div>
      <p class="muted">Elige el caso que le corresponde a tu equipo. El primer integrante que lo confirme lo registra para todos.</p>
      ${sug.length ? `<div class="m-sec"><h5>${icon("lightbulb")} Encontramos trabajo de ${sug[0].c.case_id} en este navegador</h5>
        <div class="case-picks sug">${sug.slice(0, 3).map((x) => card(x.c, `<em>${x.n} elemento(s) trabajados aquí</em>`)).join("")}</div></div>` : ""}
      <div class="m-sec"><h5>${icon("layers")} Todos los casos</h5><div class="case-picks">${CASES.map((c) => card(c)).join("")}</div></div>`, "#fbbf24");
  }
  async function confirmCase(cid, btn) {
    btn.disabled = true;
    try {
      const r = await fetch(apiBase() + "/api/team/case", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ case_id: cid }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { teamLogout(); throw new Error("Tu sesión de equipo terminó. Ingresa de nuevo."); }
      if (d.team) store.set("team", { ...teamSession(), team: d.team });
      if (r.status === 409) { closeModal(); afterTeamChange(); toast(d.error); return; }
      if (!r.ok) throw new Error(d.error || "No fue posible registrar el caso.");
      closeModal(); afterTeamChange(); toast(`Caso ${cid} registrado para todo el equipo`);
      openCase(cid);
    } catch (e) { toast(e.message); btn.disabled = false; }
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-case-reg]")) { openCaseRegistration(); return; }
    const p = e.target.closest("[data-case-pick]"); if (p) { openCaseRegistration(p.dataset.casePick); return; }
    const c = e.target.closest("[data-case-confirm]"); if (c) confirmCase(c.dataset.caseConfirm, c);
  });
  // Al entrar (o al iniciar sesión) sin caso: aviso visible y la lista una vez por visita.
  function caseGate() {
    renderCaseBanner();
    const t = teamSession();
    if (t && !t.team.case_id && !caseRegShown && modal.hidden) { caseRegShown = true; openCaseRegistration(); }
  }
  // Ejercicios guiados: se guardan por estudiante en el servidor para verlos hechos en cualquier computador.
  async function syncTours() {
    if (!apiBase() || !teamSession()) return;
    const ids = (window.GUIDE?.tours || []).map((t) => t.id);
    try {
      const r = await fetch(apiBase() + "/api/me/tours", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ done: ids.filter((id) => store.get("tour:done:" + id, false)) }) });
      if (!r.ok) return;
      const d = await r.json(); let changed = false;
      (d.done || []).forEach((id) => { if (ids.includes(id) && !store.get("tour:done:" + id, false)) { store.set("tour:done:" + id, true); changed = true; } });
      if (changed && document.querySelector("#guide-tours")) renderTourCards();
    } catch { /* sin conexión: se reintenta al próximo ingreso */ }
  }
  async function refreshTeam() {
    const t = teamSession(); if (!t || !apiBase()) return renderTeamBtn();
    try {
      const r = await fetch(apiBase() + "/api/auth/me", { headers: authHeaders() });
      if (r.status === 401) { teamLogout(); toast("Tu sesión de equipo terminó o el equipo fue retirado. Ingresa de nuevo."); return; }
      const d = await r.json(); store.set("team", { ...t, team: d.team, member: d.member }); afterTeamChange(); syncTours();
    } catch { renderTeamBtn(); }
  }
  // Resumen del avance que ve el docente (solo números; el detalle sigue en el navegador del equipo).
  function progressSummary(cid) {
    const c = byId[cid]; if (!c) return null;
    const q = store.get(cid + ":q", {}), calc = store.get(cid + ":calc", {}), inc = getInc(cid), bmm = store.get(cid + ":bmm", null), m = store.get(cid + ":matrix", null), tier = store.get(cid + ":tier", null);
    const ch = bmm ? bmmChecks(c, bmm) : [];
    const G = window.GUIDE || { steps: [] };
    return { case_id: cid, tours_done: TOURS.filter((t) => store.get("tour:done:" + t.id, false)).length, tours_total: TOURS.length,
      questions_answered: Object.values(q).filter((x) => x && x.a && x.a.trim()).length, questions_total: c.questions.length,
      bmm_pct: ch.length ? Math.round(ch.filter((x) => x.ok).length / ch.length * 100) : 0,
      calcs_ok: CALC_FIELDS.filter(([k]) => calc[k + "_ok"]).length,
      incidents_classified: Object.values(inc).filter((v) => v.itil || v.cobit || v.iso).length, incidents_total: c.data.incidents.length,
      tier_set: tier && RD.toLevel(tier.actual) ? 1 : 0, lab_services: labChainsFor(cid).length, matrix_alts: (m?.alts || []).length,
      guide_checks: G.steps.reduce((sum, st) => sum + Object.values(store.get("guide:" + st.id, { checks: {} }).checks || {}).filter(Boolean).length, 0) };
  }
  var syncTimer = null; // var: puede usarse antes de evaluar este bloque
  function scheduleSync() { if (!apiBase() || !teamSession()) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncProgress, 4000); }
  async function syncProgress() {
    const t = teamSession(); if (!t || !apiBase()) return;
    const cid = teamCase() || store.get("lastcase", null); if (!cid) return;
    const summary = progressSummary(cid); if (!summary) return;
    try {
      const r = await fetch(apiBase() + "/api/progress", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ case_id: cid, summary }), keepalive: true });
      if (r.status === 401) { teamLogout(); toast("Tu equipo fue retirado o la sesión venció. Ingresa de nuevo."); }
    } catch { /* sin conexión: se reintenta en el próximo cambio */ }
  }
  window.addEventListener("pagehide", () => syncProgress());

  /* ==================== TRABAJO DEL EQUIPO (servidor como fuente de verdad) ==================== */
  // Las pestañas siguen leyendo y guardando con store; para el caso registrado del equipo, cada guardado se descompone
  // en ítems (q.0, calc.av, inc.A, tier, bmm.metas, lab.0, mat.alt.x…) que se envían al servidor. Los cambios de los demás
  // integrantes llegan por consulta periódica (cada 15 s con la pestaña visible) y se recomponen en las mismas claves.
  const TW_BMM = ["vision", "mision", "influenciadores", "fortalezas", "debilidades", "oportunidades", "amenazas", "metas", "objetivos", "estrategias", "tacticas", "politicas", "reglas"];
  const TW_POLL_MS = 15000, TW_FLUSH_MS = 1200;
  const tw = { on: false, team: null, cid: null, items: {}, cursor: 0, queue: {}, flushT: null, pollT: null, offline: false, pending: null };
  const twJ = (x) => JSON.stringify(x ?? null);
  function twHash(t) { let h = 0; for (const ch of String(t || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h.toString(36); }
  // «editado por» y «otras versiones» dentro de cada pestaña (solo para el caso registrado del equipo).
  function twBadge(id, opts = {}) {
    if (!tw.on || !currentCase || currentCase.case_id !== tw.cid) return "";
    return `<span class="tw-ed" data-twed="${esc(id)}">${twBadgeInner(id, opts)}</span>`;
  }
  function twBadgeInner(id, opts = {}) {
    const it = tw.items[id], pend = id in tw.queue;
    const parts = [];
    if (pend) parts.push(`<i class="tw-dot"></i>guardando…`);
    else if (it && it.autor && it.content != null) parts.push(`✎ ${opts.label ? esc(opts.label) + ": " : ""}editado por <b>${esc(it.autor)}</b> ${pAgo(it.fecha)}`);
    if (it && it.versiones) parts.push(`<button type="button" class="tw-ver" data-pver="${esc(id)}">otras versiones (${it.versiones})</button>`);
    return parts.join(" · ");
  }
  function twBadges(ids, labels) { return tw.on && currentCase?.case_id === tw.cid ? `<div class="tw-eds">${ids.map((id, i) => twBadge(id, { label: labels && labels[i] })).join("")}</div>` : ""; }
  function twPaintBadges(ids) { (ids || Object.keys(tw.items)).forEach((id) => $$(`[data-twed="${id}"]`).forEach((el) => { el.innerHTML = twBadgeInner(id); })); }
  const twKeyOf = () => `tw:${tw.team}:${tw.cid}`;
  function twPersist() { _storeSet(twKeyOf(), { items: tw.items, cursor: tw.cursor, queue: tw.queue }); }
  // Familia de ítems que cubre cada clave del almacenamiento local.
  function twFamily(key) {
    const c = tw.cid; if (!c) return null;
    if (key === c + ":q") return "q."; if (key === c + ":calc") return "calc."; if (key === c + ":itil") return "inc.";
    if (key === c + ":tier") return "tier"; if (key === c + ":bmm") return "bmm."; if (key === c + ":matrix") return "mat."; if (key === c + ":findings") return "mat.findings";
    const m = key.match(/^lab:([^:]+):(\d+)$/); if (m && m[1] === c) return "lab." + m[2];
    return null;
  }
  // El registro de hallazgos (mat.findings) es su propia familia: guardar la matriz no debe tocarlo.
  const twInFamily = (item, fam) => (fam.endsWith(".") ? item.startsWith(fam) && !(fam === "mat." && item === "mat.findings") : item === fam);
  function twDecompose(key, v) {
    const fam = twFamily(key), out = {}; if (!fam) return out;
    if (fam === "q.") Object.entries(v || {}).forEach(([i, x]) => { if (x) out["q." + i] = { a: x.a || "", done: !!x.done }; });
    else if (fam === "calc.") CALC_FIELDS.forEach(([k]) => { if (v && (k in v || (k + "_ok") in v)) out["calc." + k] = { v: typeof v[k] === "number" ? v[k] : null, ok: !!v[k + "_ok"] }; });
    else if (fam === "inc.") Object.entries(v || {}).forEach(([i, x]) => { out["inc." + i] = typeof x === "string" ? { itil: x, cobit: "", iso: "" } : { itil: x?.itil || "", cobit: x?.cobit || "", iso: x?.iso || "" }; });
    else if (fam === "tier") { if (v) out.tier = RD.norm(v); }
    else if (fam === "bmm.") { if (v) TW_BMM.forEach((k) => { out["bmm." + k] = k === "vision" || k === "mision" ? { t: v[k] || "" } : { items: v[k] || [] }; }); }
    else if (fam === "mat.") { if (v) { out["mat.criteria"] = { v: v.v || 1, criteria: (v.criteria || []).map((k) => (v.v === 2 ? { id: k.id, n: k.n, w: k.w, wp: k.wp, touched: !!k.touched, reason: k.reason || "", why: k.why || [] } : k)), wok: !!v.wok, coh: v.coh || {}, decision: v.decision || null, old: v.old || null, prev: v.prev || null }; if (v.tobe) out["mat.tobe"] = v.tobe; if (v.exec) out["mat.exec"] = v.exec; (v.alts || []).forEach((a, i) => { out["mat.alt." + (a.id || "u-" + twHash(a.name))] = { alt: a, pos: i }; }); } }
    else if (fam === "mat.findings") { if (v) out["mat.findings"] = { st: v.st || {}, seen: v.seen || null, links: v.links || {}, lk: v.lk || {}, rows: v.rows || [] }; }
    else if (fam.startsWith("lab.")) { if (v && (v.chain || []).length) out[fam] = { chain: v.chain, w: v.w }; }
    return out;
  }
  function twLocalKeys() {
    const c = tw.cid, keys = [c + ":q", c + ":calc", c + ":itil", c + ":tier", c + ":bmm", c + ":matrix", c + ":findings"];
    (window.CASE_SERVICES[c]?.rows || []).forEach((_, i) => keys.push(`lab:${c}:${i}`));
    return keys;
  }
  // Escribe en el almacenamiento local la composición de los ítems del equipo (sin volver a sincronizar).
  function twCompose(fams) {
    const c = tw.cid, get = (id) => tw.items[id]?.content ?? null, ids = Object.keys(tw.items);
    const want = (f) => !fams || fams.some((x) => x === f || f.startsWith(x) || x.startsWith(f));
    const put = (k, v) => { if (v == null) { try { localStorage.removeItem("infralab:" + k); } catch { /* */ } } else _storeSet(k, v); };
    if (want("q.")) { const o = {}; ids.filter((i) => i.startsWith("q.") && get(i)).forEach((i) => (o[i.slice(2)] = get(i))); put(c + ":q", Object.keys(o).length ? o : null); }
    if (want("calc.")) { const o = {}; ids.filter((i) => i.startsWith("calc.") && get(i)).forEach((i) => { const k = i.slice(5); o[k] = get(i).v; o[k + "_ok"] = !!get(i).ok; }); put(c + ":calc", Object.keys(o).length ? o : null); }
    if (want("inc.")) { const o = {}; ids.filter((i) => i.startsWith("inc.") && get(i)).forEach((i) => (o[i.slice(4)] = get(i))); put(c + ":itil", Object.keys(o).length ? o : null); }
    if (want("tier")) put(c + ":tier", get("tier"));
    if (want("bmm.")) {
      const has = ids.some((i) => i.startsWith("bmm.") && get(i));
      if (!has) put(c + ":bmm", null);
      else { const o = {}; TW_BMM.forEach((k) => { const x = get("bmm." + k); o[k] = k === "vision" || k === "mision" ? x?.t || "" : x?.items || []; }); put(c + ":bmm", o); }
    }
    if (want("mat.findings")) put(c + ":findings", get("mat.findings"));
    if (want("mat.")) {
      const alts = ids.filter((i) => i.startsWith("mat.alt.") && get(i)).map((i) => get(i)).sort((a, b) => (a.pos || 0) - (b.pos || 0)).map((x) => x.alt);
      const mc = get("mat.criteria"), crit = mc?.criteria, tobe = get("mat.tobe"), ex = get("mat.exec");
      put(c + ":matrix", alts.length || crit || tobe || ex ? { ...(tobe ? { tobe } : {}), ...(ex ? { exec: ex } : {}), ...(mc?.v === 2 ? { v: 2, wok: !!mc.wok, coh: mc.coh || {}, decision: mc.decision || { alt: "", text: "" }, old: mc.old || null } : {}), prev: mc?.prev || null, criteria: crit || [], alts } : null);
    }
    (window.CASE_SERVICES[c]?.rows || []).forEach((_, i) => { if (want("lab." + i)) put(`lab:${c}:${i}`, get("lab." + i)); });
  }
  // Cada guardado local del caso del equipo: diferencias por ítem → cola de envío.
  function twOnSet(key, v) {
    if (!tw.on || tw.pending) return;
    const fam = twFamily(key); if (!fam) return;
    const next = twDecompose(key, v);
    const ids = new Set([...Object.keys(next), ...Object.keys(tw.items).filter((i) => twInFamily(i, fam)), ...Object.keys(tw.queue).filter((i) => twInFamily(i, fam))]);
    let changed = false;
    ids.forEach((id) => {
      const nv = next[id] ?? null;
      const cur = id in tw.queue ? tw.queue[id].content : tw.items[id]?.content ?? null;
      if (twJ(nv) === twJ(cur)) return;
      tw.queue[id] = { content: nv, base_rev: tw.queue[id]?.base_rev ?? tw.items[id]?.rev ?? 0 };
      changed = true;
    });
    if (!changed) return;
    twPersist(); twStatus(); twPaintBadges([...ids]);
    clearTimeout(tw.flushT); tw.flushT = setTimeout(twFlush, TW_FLUSH_MS);
  }
  async function twApi(path, opts = {}) {
    const r = await fetch(apiBase() + path, { method: opts.method || "GET", headers: { "Content-Type": "application/json", ...authHeaders() }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { teamLogout(true); throw new Error("Tu sesión de equipo terminó. Ingresa de nuevo."); }
    if (!r.ok) { const e = new Error(d.error || "Error " + r.status); e.status = r.status; throw e; }
    return d;
  }
  async function twFlush(force) {
    clearTimeout(tw.flushT);
    if (!tw.on) return true;
    const ids = Object.keys(tw.queue); if (!ids.length) return true;
    const sent = ids.map((id) => ({ item: id, content: tw.queue[id].content, base_rev: tw.queue[id].base_rev, force: !!(force && force.includes(id)) }));
    let res;
    try { res = (await twApi("/api/work/save", { method: "POST", body: { case_id: tw.cid, items: sent } })).results; }
    catch (e) { if (!e.status) { tw.offline = true; twStatus(); } else toast(e.message); return false; }
    tw.offline = false;
    const conflicts = [];
    const me = teamSession()?.member;
    res.forEach((r, i) => {
      const s = sent[i];
      if (r.status === "ok") {
        const was = tw.items[s.item] || {};
        tw.items[s.item] = { ...was, content: s.content, rev: r.rev, autor: me ? `${me.firstname} ${me.lastname}` : "", fecha: r.fecha || new Date().toISOString(),
          versiones: (was.versiones || 0) + (s.force ? 1 : 0) }; // «force» solo sale del aviso de conflicto: el servidor guardó la otra versión
        if (tw.queue[s.item] && twJ(tw.queue[s.item].content) === twJ(s.content)) delete tw.queue[s.item];
        else if (tw.queue[s.item]) tw.queue[s.item].base_rev = r.rev;
      } else if (r.status === "conflicto") conflicts.push({ ...r, mine: s.content });
      else { delete tw.queue[s.item]; }
    });
    twPersist(); twStatus(); twPaintBadges(sent.map((x) => x.item));
    if (conflicts.length) twConflict(conflicts);
    progressRefreshSoon();
    return !conflicts.length;
  }
  function twConflict(list) {
    const ago = (iso) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)); return m < 1 ? "hace un momento" : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`; };
    openModal(`<div class="m-head"><div class="m-ico">${icon("alert")}</div><div><div class="kick">Trabajo del equipo</div><h2 id="modal-title">Otro integrante cambió esto mientras lo editabas</h2></div></div>
      <div class="m-sec">${list.map((c) => `<div class="tw-conf"><b>${esc(twLabel(c.item))}</b><span class="muted">${esc(c.actual.autor || "Otro integrante")} lo guardó ${ago(c.actual.fecha)}</span>
        <div class="tw-two"><div><small>Su versión</small><p>${esc(twText(c.item, c.actual.content)) || "<i>vacío</i>"}</p></div><div><small>Tu versión</small><p>${esc(twText(c.item, c.mine)) || "<i>vacío</i>"}</p></div></div></div>`).join("")}</div>
      <div class="row-actions"><button class="btn" data-twc="reload">Recargar (usar su versión)</button><button class="btn btn-primary" data-twc="force">Guardar de todas formas</button></div>
      <p class="hint">Si guardas de todas formas, su versión no se pierde: queda en «otras versiones» del ítem.</p>`, "#fbbf24");
    $("#modal-body").dataset.twc = JSON.stringify(list.map((c) => ({ item: c.item, actual: c.actual })));
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-twc]"); if (!b) return;
    const list = JSON.parse($("#modal-body").dataset.twc || "[]");
    if (b.dataset.twc === "reload") {
      list.forEach((c) => { delete tw.queue[c.item]; tw.items[c.item] = { ...(tw.items[c.item] || {}), content: c.actual.content, rev: c.actual.rev, autor: c.actual.autor, fecha: c.actual.fecha }; });
      twPersist(); twCompose(list.map((c) => c.item)); closeModal(); twRefreshUI(true); toast("Se cargó la versión de tu equipo");
    } else {
      closeModal(); await twFlush(list.map((c) => c.item)); // «force»: el servidor guarda la versión del otro integrante en «otras versiones» toast("Guardado. La otra versión quedó en «otras versiones»");
    }
  });
  async function twPoll() {
    if (!tw.on || document.visibilityState !== "visible") return;
    if (Object.keys(tw.queue).length) await twFlush();
    let d; try { d = await twApi(`/api/work?case_id=${tw.cid}&since=${tw.cursor}`); } catch (e) { if (!e.status) { tw.offline = true; twStatus(); } return; }
    tw.offline = false;
    const me = d.member_id, changed = [];
    d.items.forEach((it) => {
      tw.cursor = Math.max(tw.cursor, it.seq);
      if (it.item in tw.queue) return; // hay cambios propios sin enviar: el guardado detectará el conflicto
      const prev = tw.items[it.item];
      tw.items[it.item] = { content: it.content, rev: it.rev, autor: it.autor, fecha: it.fecha, versiones: it.versiones };
      if (it.versiones !== prev?.versiones) twPaintBadges([it.item]);
      if (it.autor_id !== me && twJ(prev?.content) !== twJ(it.content)) changed.push(it.item);
    });
    twPersist(); twStatus();
    if (changed.length) { twCompose(changed); twRefreshUI(false, changed); twPaintBadges(changed); progressRefreshSoon(); }
  }
  // Vuelve a pintar lo que el estudiante tiene abierto, sin pisar lo que está escribiendo.
  function twRefreshUI(forced, changed) {
    const editing = document.activeElement && document.activeElement.closest("#ws-body, .lab-wide") && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (currentCase && currentCase.case_id === tw.cid && !ws.hidden) {
      if (editing && !forced) {
        let n = $("#tw-news"); if (!n) { n = document.createElement("div"); n.id = "tw-news"; n.className = "tw-news"; $("#ws-body").prepend(n); }
        n.innerHTML = `${icon("users")}<span>Tu equipo actualizó este caso${changed ? ` (${changed.map(twLabel).slice(0, 3).join(", ")}${changed.length > 3 ? "…" : ""})` : ""}.</span><button class="btn btn-sm" data-tw-refresh>Ver cambios</button>`; hydrate(n);
      } else { const sc = $("#ws-body").scrollTop; renderTab(); $("#ws-body").scrollTop = sc; }
    }
    window.dispatchEvent(new CustomEvent("infralab:work", { detail: { cid: tw.cid } }));
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-tw-refresh]")) { const sc = $("#ws-body").scrollTop; renderTab(); $("#ws-body").scrollTop = sc; } });
  function twStatus() {
    let el = $("#tw-status");
    if (!el) { el = document.createElement("div"); el.id = "tw-status"; el.className = "tw-status"; document.body.appendChild(el); }
    const n = Object.keys(tw.queue).length;
    el.hidden = !tw.on || (!tw.offline && !n);
    el.className = "tw-status" + (tw.offline ? " off" : "");
    el.innerHTML = tw.offline ? `${icon("alert")} Sin conexión con el servidor: ${n} cambio(s) guardado(s) en este navegador. Se enviarán al volver la conexión.` : `<span class="spinner"></span> Guardando ${n} cambio(s) del equipo…`;
  }
  function twLabel(id) {
    const c = byId[tw.cid] || currentCase;
    if (id === "tier") return "Redundancia e instalación";
    if (id.startsWith("calc.")) return (CALC_FIELDS.find(([k]) => k === id.slice(5)) || [, id])[1];
    if (id.startsWith("inc.")) return "Incidente " + id.slice(4);
    if (id.startsWith("q.")) return "Pregunta guía " + (+id.slice(2) + 1);
    if (id.startsWith("bmm.")) return "BMM · " + id.slice(4);
    if (id.startsWith("lab.")) return "Laboratorio · " + (window.CASE_SERVICES[c?.case_id]?.rows[+id.slice(4)]?.[0] || id);
    if (id === "mat.findings") return "Registro de hallazgos";
    if (id === "mat.criteria") return "Matriz · criterios";
    if (id.startsWith("mat.alt.")) return "Matriz · " + (PATTERNS[id.slice(8)]?.name || id.slice(8));
    return id;
  }
  function twText(id, c) {
    if (c == null) return "";
    if (id === "tier") return RD.summary(c);
    if (id.startsWith("calc.")) return c.v == null ? "" : String(c.v);
    if (id.startsWith("inc.")) return `ITIL: ${c.itil || "—"} · COBIT: ${c.cobit || "—"} · ISO: ${c.iso || "—"}`;
    if (id.startsWith("q.")) return c.a || "";
    if (id.startsWith("bmm.")) return "t" in c ? c.t || "" : (c.items || []).map((x) => "• " + (x.t || "")).join("\n");
    if (id.startsWith("lab.")) return (c.chain || []).map((x) => String(x.asset || "").split(":").pop()).join(" → ");
    if (id.startsWith("mat.alt.")) return `${c.alt?.name || ""}: ${c.alt?.j || ""}`;
    if (id === "mat.criteria") return (c.criteria || []).map((k) => `${k.n} (${k.w})`).join("; ");
    return JSON.stringify(c);
  }
  // Inicio: migración con confirmación (solo trabajo de este mismo equipo), carga completa y consulta periódica.
  async function twStart() {
    const t = teamSession();
    const cid = t?.team?.case_id;
    if (!apiBase() || !t || !cid || !byId[cid]) return twStop(false);
    if (tw.on && tw.team === t.team.id && tw.cid === cid) return;
    twStop(false);
    Object.assign(tw, { team: t.team.id, cid, items: {}, cursor: 0, queue: {}, offline: false, pending: "loading" });
    const saved = store.get(twKeyOf(), null);
    if (saved) Object.assign(tw, { items: saved.items || {}, cursor: 0, queue: saved.queue || {} });
    const migKey = `twmig:${t.team.id}:${cid}`;
    if (!store.get(migKey, false)) {
      const owner = store.get("localowner", null);
      const local = {};
      twLocalKeys().forEach((k) => Object.assign(local, twDecompose(k, store.get(k, null))));
      Object.keys(local).forEach((id) => { if (!twHasContent(local[id])) delete local[id]; });
      const n = Object.keys(local).length;
      _storeSet("twbak:" + cid, Object.fromEntries(twLocalKeys().map((k) => [k, store.get(k, null)])));
      if (n && (owner == null || owner === t.team.id)) {
        const ok = await twAskMigration(cid, n);
        if (ok) { try { const r = await twApi("/api/work/migrate", { method: "POST", body: { case_id: cid, items: local } }); toast(`Trabajo subido: ${r.resumen.nuevos} nuevos, ${r.resumen.reemplazados} actualizados, ${r.resumen.guardados_como_version} guardados como otra versión`); } catch (e) { toast(e.message); tw.pending = null; return; } }
      }
      _storeSet(migKey, true);
    }
    let d; try { d = await twApi(`/api/work?case_id=${cid}&since=0`); } catch (e) { tw.pending = null; tw.on = !!saved; tw.offline = !e.status; twStatus(); return; }
    tw.items = {}; d.items.forEach((it) => { tw.items[it.item] = { content: it.content, rev: it.rev, autor: it.autor, fecha: it.fecha, versiones: it.versiones }; });
    tw.cursor = d.cursor;
    Object.entries(tw.queue).forEach(([id, q]) => { if (twJ(q.content) === twJ(tw.items[id]?.content)) delete tw.queue[id]; });
    twLocalKeys().forEach((k) => { try { localStorage.removeItem("infralab:" + k); } catch { /* */ } });
    twCompose(null);
    // Cambios hechos sin conexión: se vuelven a aplicar encima y se envían.
    if (Object.keys(tw.queue).length) { const keep = tw.queue; Object.entries(keep).forEach(([id, q]) => { tw.items[id] = { ...(tw.items[id] || {}), content: q.content }; }); twCompose(Object.keys(keep)); Object.entries(keep).forEach(([id, q]) => { tw.items[id].rev = q.base_rev; }); }
    tw.pending = null; tw.on = true; twPersist(); twStatus();
    clearInterval(tw.pollT); tw.pollT = setInterval(twPoll, TW_POLL_MS);
    if (Object.keys(tw.queue).length) twFlush();
    twRefreshUI(true); progressRefreshSoon();
  }
  const twHasContent = (c) => c != null && (typeof c !== "object" ? c !== "" && c !== false : Object.entries(c).some(([k, v]) => !["done", "ok", "pos", "w"].includes(k) && twHasContent(v)));
  function twAskMigration(cid, n) {
    return new Promise((resolve) => {
      const c = byId[cid];
      openModal(`<div class="m-head"><div class="m-ico">${icon("upload" in window.ICONS ? "upload" : "download")}</div><div><div class="kick">Trabajo del equipo · ${esc(cid)}</div><h2 id="modal-title">Encontramos trabajo de ${esc(cid)} en este navegador</h2></div></div>
        <p>Hay <b>${n} elemento(s)</b> de <b>${esc(c.title)}</b> guardados en este computador. Desde ahora tu equipo trabaja sobre <b>una sola versión en el servidor</b> que ven todos los integrantes.</p>
        <p class="m-prompt">¿Subirlo al trabajo del equipo? No se borra nada: si un ítem ya tiene contenido en el servidor, se conserva la versión más desarrollada y la otra queda en «otras versiones».</p>
        <div class="row-actions"><button class="btn btn-ghost" data-twm="no">No subir</button><button class="btn btn-primary" data-twm="yes">Subir al trabajo del equipo</button></div>
        <p class="hint">Si no lo subes, queda una copia de respaldo en este navegador.</p>`, "#22d3ee");
      let done = false;
      const finish = (v) => { if (done) return; done = true; document.removeEventListener("click", h, true); document.removeEventListener("keydown", k, true); if (!modal.hidden) closeModal(); resolve(v); };
      const h = (e) => { const b = e.target.closest("[data-twm]"); if (b) return finish(b.dataset.twm === "yes"); setTimeout(() => { if (modal.hidden) finish(false); }, 0); };
      const k = () => setTimeout(() => { if (modal.hidden) finish(false); }, 0);
      setTimeout(() => { document.addEventListener("click", h, true); document.addEventListener("keydown", k, true); }, 0);
    });
  }
  function twStop(clear) {
    clearInterval(tw.pollT); clearTimeout(tw.flushT);
    if (clear && tw.cid) { twLocalKeys().forEach((k) => { try { localStorage.removeItem("infralab:" + k); } catch { /* */ } }); try { localStorage.removeItem("infralab:" + twKeyOf()); } catch { /* */ } }
    Object.assign(tw, { on: false, items: {}, queue: {}, cursor: 0, pending: null });
    twStatus();
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && tw.on) twPoll(); });
  window.addEventListener("online", () => { if (tw.on) twFlush(); });
  window.addEventListener("pagehide", () => { if (tw.on && Object.keys(tw.queue).length) twFlush(); });

  /* ==================== PROGRESO DEL EQUIPO Y REVISIÓN INTEGRAL (panel del Mentor) ==================== */
  const P_STATE = { sin_iniciar: ["", "Sin iniciar"], en_desarrollo: ["amber", "En desarrollo"], desarrollado: ["green", "Desarrollado"] };
  const MENTOR_ITEM = (id) => id === "tier" || /^(calc|inc|q)\./.test(id);
  let progressT = null, progressData = null;
  function progressRefreshSoon() { clearTimeout(progressT); progressT = setTimeout(refreshMentorPanel, 600); }
  function itemStatus(it) {
    const r = it.revision;
    if (r && r.mejor === "correcto") return ["green", "Revisado · correcto"];
    if (r && r.quedan === 0) return ["red", "Revisiones agotadas"];
    if (r) return ["amber", "Revisado · con mejoras"];
    return P_STATE[it.estado] || ["", it.estado];
  }
  const pAgo = (iso) => { if (!iso) return ""; const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)); return m < 1 ? "hace un momento" : m < 60 ? `hace ${m} min` : m < 2880 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`; };
  function mentorPanelHtml(c) {
    const t = teamSession();
    if (!apiBase()) return `<p class="muted">El servidor del curso no está configurado.</p>`;
    if (!t) return `<div class="notice info">${icon("users")}<span>Ingresa con el código de tu equipo para ver el progreso del equipo y usar el Mentor y la revisión integral. <button class="btn btn-sm" data-mlogin>Ingresar</button></span></div>`;
    if (!t.team.case_id) return `<div class="notice">${icon("alert")}<span>Tu equipo aún no ha registrado su caso. <button class="btn btn-sm btn-primary" data-case-reg>Registrar el caso del equipo</button></span></div>`;
    if (t.team.case_id !== c.case_id) return `<div class="notice info">${icon("info")}<span>El progreso, el trabajo compartido y la revisión integral aplican al caso de tu equipo (<b>${esc(t.team.case_id)}</b>). <button class="btn btn-sm" data-open-case="${esc(t.team.case_id)}">Abrir ${esc(t.team.case_id)}</button></span></div>`;
    const d = progressData && progressData.case_id === c.case_id ? progressData : null;
    if (!d) return `<p class="muted">Cargando el progreso del equipo…</p>`;
    const p = d.equipo, tu = d.tutor;
    const sec = (s) => `<details class="p-sec" ${s.desarrollados < s.total ? "" : ""}><summary><span class="p-sec-n">${esc(s.nombre)}</span><span class="pill ${s.desarrollados === s.total ? "green" : s.desarrollados ? "amber" : "red"}">${s.desarrollados} de ${s.total}</span>
        <button type="button" class="btn btn-sm btn-ghost" data-pgo="${s.tab}">Ir</button></summary>
      ${s.items.map((it) => { const [k, l] = itemStatus(it); const r = it.revision;
        return `<div class="p-item"><span class="pill ${k}">${l}</span><span class="p-item-n">${esc(it.nombre)}${it.falta && it.estado !== "desarrollado" ? `<small>${esc(it.falta)}</small>` : ""}${it.editado ? `<small class="muted">editado por ${esc(it.editado.autor || "un integrante")} ${pAgo(it.editado.fecha)}</small>` : ""}</span>
          ${MENTOR_ITEM(it.id) ? `<small class="muted">${r ? `${r.quedan} de ${r.max} revisiones` : "2 de 2 revisiones"}</small>${mentorBtn(it.id, it.nombre, "", "Mentor")}` : ""}
          ${it.versiones ? `<button type="button" class="btn btn-sm btn-ghost" data-pver="${esc(it.id)}">Otras versiones (${it.versiones})</button>` : ""}</div>`; }).join("")}</details>`;
    const btn = tu.quedan <= 0 ? `<button class="btn" disabled>Revisiones integrales agotadas</button>`
      : !p.habilitado_tutor ? `<button class="btn" disabled>Revisión integral disponible al ${p.umbral} % · llevas ${p.porcentaje} %</button>`
      : `<button class="btn btn-primary" id="tutor-integral">${icon("zap")} Solicitar revisión integral · quedan ${tu.quedan} de ${tu.max}</button>`;
    return `<div class="p-head"><div class="p-bar"><div class="p-bar-t"><b>Avance del equipo · ${p.porcentaje} %</b><span>${p.desarrollados} de ${p.total} puntos · se necesitan ${p.umbral_puntos} (${p.umbral} %) y ninguna sección en cero</span></div>
        <div class="p-track"><i style="width:${p.porcentaje}%"></i><em style="left:${p.umbral}%" title="${p.umbral} %"></em></div></div></div>
      <div class="p-integral">${btn}
        ${tu.quedan > 0 && p.habilitado_tutor ? `<label>Comentario o pregunta para el tutor (opcional)<textarea id="tutor-free" rows="2" placeholder="¿Qué te gustaría que revise con más cuidado?">${esc(store.get(c.case_id + ":tutorfree", ""))}</textarea></label>` : ""}
        ${!p.habilitado_tutor && tu.quedan > 0 ? `<p class="hint">${esc(p.motivo || "")}</p><details class="p-falt"><summary>Lo que falta (${p.faltantes.length})</summary><ul>${p.faltantes.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>` : ""}
        <p class="hint">El tutor revisa el <b>trabajo del equipo guardado en el servidor</b>. Si la revisión no se puede hacer, no se descuenta.</p><div id="tutor-out"></div></div>
      <div class="p-secs">${p.secciones.map(sec).join("")}</div>
      <p class="hint">El progreso mide avance (contenido mínimo), no si las respuestas son correctas. Un ítem aparece como correcto solo después de revisarlo con el Mentor.</p>`;
  }
  async function refreshMentorPanel() {
    const c = currentCase, box = $("#mentor-panel"); if (!c || !box) return;
    const t = teamSession();
    if (t && t.team.case_id === c.case_id && apiBase()) {
      try { const r = await fetch(`${apiBase()}/api/progreso?case_id=${c.case_id}`, { headers: authHeaders() }); if (r.ok) progressData = await r.json(); } catch { /* sin conexión */ }
    }
    if ($("#mentor-panel") !== box) return;
    const open = $$(".p-sec[open] .p-sec-n", box).map((x) => x.textContent);
    box.innerHTML = mentorPanelHtml(c); hydrate(box);
    $$(".p-sec", box).forEach((d) => { if (open.includes($(".p-sec-n", d).textContent)) d.open = true; });
    (progressData?.equipo?.secciones || []).forEach((s) => (s.items || []).forEach((it) => { if (it.revision) mentorSaveStatus(c.case_id, it.id, { checks: it.revision.usadas, best: it.revision.mejor, hints: mentorCache(c.case_id)[it.id]?.hints || 0 }); }));
    $("#tutor-free", box)?.addEventListener("input", (e) => store.set(c.case_id + ":tutorfree", e.target.value));
  }
  document.addEventListener("click", async (e) => {
    const go = e.target.closest("[data-pgo]");
    if (go) { e.preventDefault(); const tab = go.dataset.pgo; if (tab === "lab") { const cid = currentCase.case_id; closeWorkspace(); window.__labOpen && window.__labOpen(cid); } else { currentTab = tab; $$(".ws-tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab)); renderTab(); } return; }
    const pv = e.target.closest("[data-pver]");
    if (pv) {
      e.preventDefault();
      const rel = pv.dataset.pver.startsWith("bmm.") ? Object.keys(tw.items).filter((i) => i.startsWith("bmm.")) : pv.dataset.pver.startsWith("lab.") ? Object.keys(tw.items).filter((i) => i.startsWith("lab.")) : pv.dataset.pver.startsWith("mat.") ? Object.keys(tw.items).filter((i) => i.startsWith("mat.")) : [pv.dataset.pver];
      const all = [];
      for (const id of rel) { try { const d = await twApi(`/api/work/versions?case_id=${tw.cid}&item=${encodeURIComponent(id)}`); d.versions.forEach((v) => all.push({ ...v, vid: v.id, id })); } catch { /* */ } }
      openModal(`<div class="m-head"><div class="m-ico">${icon("layers")}</div><div><div class="kick">Trabajo del equipo</div><h2 id="modal-title">Otras versiones</h2></div></div>
        ${all.length ? all.map((v) => `<div class="tw-conf"><b>${esc(twLabel(v.id))}</b><span class="muted">${esc(v.autor || "")} · ${esc(new Date(v.fecha).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }))} · ${{ migracion: "subida desde otro navegador", conflicto: "reemplazada al guardar sobre un conflicto", restaurada: "reemplazada al restaurar otra versión" }[v.origen] || v.origen}</span><p class="tw-pre">${esc(twText(v.id, v.content))}</p>
          <div class="row-actions"><button class="btn btn-sm" data-prest="${esc(v.id)}" data-vid="${v.vid}">Restaurar esta versión</button></div></div>`).join("") : `<p class="muted">No hay otras versiones.</p>`}
        <p class="hint">Restaurar no borra nada: lo que hay ahora queda, a su vez, como otra versión.</p>`, "#a78bfa");
      return;
    }
    const pr = e.target.closest("[data-prest]");
    if (pr) {
      const id = pr.dataset.prest; pr.disabled = true;
      if (id in tw.queue) await twFlush();
      try {
        const d = await twApi("/api/work/restore", { method: "POST", body: { case_id: tw.cid, item: id, version_id: +pr.dataset.vid } });
        tw.items[id] = { content: d.content, rev: d.rev, autor: d.autor, fecha: d.fecha, versiones: d.versiones };
        tw.cursor = Math.max(tw.cursor, d.seq); twPersist(); twCompose([id]); closeModal(); twRefreshUI(true); progressRefreshSoon();
        toast(`Se restauró «${twLabel(id)}». La versión anterior quedó en «otras versiones».`);
      } catch (err) { toast(err.message); pr.disabled = false; }
      return;
    }
    const ti = e.target.closest("#tutor-integral");
    if (ti) {
      const c = currentCase; ti.disabled = true; ti.innerHTML = `<span class="spinner"></span> Guardando el trabajo del equipo…`;
      await twFlush(); await twPoll();
      ti.innerHTML = `<span class="spinner"></span> El tutor está leyendo el trabajo del equipo…`;
      const out = $("#tutor-out");
      try {
        const r = await fetch(apiBase() + "/api/feedback", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ case_id: c.case_id, free: $("#tutor-free")?.value || "", context: tutorContext(c) }) });
        const d = await r.json().catch(() => ({}));
        if (r.status === 409 && d.error === "progreso_insuficiente") { out.innerHTML = `<div class="notice">${icon("alert")}<span>${esc(d.mensaje || "Aún no alcanzas el progreso mínimo.")} No se descontó ninguna revisión.</span></div>`; hydrate(out); refreshMentorPanel(); return; }
        if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
        const hist = store.get("tutor:" + c.case_id, []); hist.unshift({ id: d.id, created_at: d.created_at, level: d.feedback?.nivel_global, sections: ["revisión integral"], feedback: d.feedback }); store.set("tutor:" + c.case_id, hist);
        await refreshMentorPanel();
        const o2 = $("#tutor-out"); if (o2) { o2.innerHTML = feedbackHtml(d.feedback, "Ahora"); hydrate(o2); }
        window.dispatchEvent(new CustomEvent("infralab:tutor", { detail: { cid: c.case_id } }));
      } catch (err) { out.innerHTML = `<div class="notice">${icon("alert")}<span>${esc(err.message)}</span></div>`; hydrate(out); ti.disabled = false; ti.textContent = "Solicitar revisión integral"; }
    }
  });

  /* ==================== MENTOR IA (pistas graduadas y revisión por ítem) ==================== */
  // La clave de respuestas vive solo en el servidor: aquí solo se envía la respuesta del equipo y se muestra el porqué.
  const M_VERDICT = { correcto: ["green", "Correcto"], parcial: ["amber", "Parcialmente correcto"], incorrecto: ["red", "Incorrecto"], sin_respuesta: ["", "Sin respuesta"] };
  const M_FIELD = { correcto: ["check", "green", "correcto"], aceptable: ["check", "amber", "defendible, pero hay una opción que ataca mejor la causa"], incorrecto: ["x", "red", "no coincide con la evidencia"], sin_respuesta: ["alert", "", "sin responder"], cubre: ["check", "green", "lo cubres"], falta: ["alert", "amber", "te falta"] };
  const M_DOT = { correcto: "m-ok", parcial: "m-part", incorrecto: "m-bad" };
  const mentorCache = (cid) => store.get("mentor:" + cid, {});
  function mentorBtn(item, label, prompt = "", text = "Mentor") {
    const st = currentCase ? mentorCache(currentCase.case_id)[item] : null;
    return `<button type="button" class="mentor-btn ${st?.best ? M_DOT[st.best] : ""}" data-mentor="${esc(item)}" data-mlabel="${esc(label)}" data-mprompt="${esc(prompt)}" title="Mentor IA: pistas y revisión de tu respuesta">${icon("lightbulb")}<span>${esc(text)}</span><i></i></button>`;
  }
  function mentorPaint(cid, item) {
    const st = mentorCache(cid)[item];
    $$(`.mentor-btn[data-mentor="${item}"]`).forEach((b) => { b.classList.remove("m-ok", "m-part", "m-bad"); if (st?.best) b.classList.add(M_DOT[st.best]); });
  }
  function mentorSaveStatus(cid, item, status) {
    if (!status) return; const all = mentorCache(cid); all[item] = status; store.set("mentor:" + cid, all); mentorPaint(cid, item);
  }
  // Respuesta actual del equipo para el ítem (lo que ya escribió o eligió en el sitio).
  function mentorAnswer(c, item) {
    const cid = c.case_id;
    if (item === "tier") return tierGet(cid);
    if (item === "mat") { const m = getMatrix(cid), a = m.alts.find((x) => (x.id || x.name) === m.decision.alt), top = m.criteria.slice().sort((x, y) => (+y.w || 0) - (+x.w || 0));
      return { alt: a ? a.name : "", pats: a ? a.pats : [], top: top.slice(0, 2).map((k) => k.id), topn: top.slice(0, 2).map((k) => `${(k.n || "Propio").split(" (")[0]} (${k.w} %)`), text: m.decision.text || "" }; }
    if (item.startsWith("calc.")) { const v = store.get(cid + ":calc", {})[item.slice(5)]; return { value: v == null ? "" : String(v) }; }
    if (item.startsWith("inc.")) { const v = getInc(cid)[item.slice(4)] || {}; return { itil: v.itil || "", cobit: v.cobit || "", iso: v.iso || "" }; }
    if (item.startsWith("q.")) return { text: store.get(cid + ":q", {})[item.slice(2)]?.a || "" };
    return {};
  }
  const M_TAB = { mat: ["matriz", "Matriz → La decisión de tu equipo"], tier: ["inventario", "Inventario → Redundancia e instalación"], calc: ["metricas", "Métricas → Verificador de cálculos"], inc: ["incidentes", "Incidentes"], q: ["retos", "Retos → Preguntas guía"] };
  function mentorAnswerHtml(item, a) {
    const empty = (x) => (x ? esc(x) : `<span class="muted">sin responder</span>`);
    if (item === "tier") { const n = (x) => Object.values(a.ev || {}).filter((v) => v === x).length;
      return `<div class="m-ans"><span>Nivel actual</span><b>${empty(RD.levelLabel(a.actual))}</b><span>Nivel objetivo</span><b>${empty(RD.levelLabel(a.objetivo))}</b><span>Componentes</span><b>${n("u")} únicos · ${n("r")} con respaldo</b>
        <span>Parte B</span><b>${(a.b?.info || []).length} casillas · ${(a.b?.who || []).length} destinatario(s)${a.b?.top ? " · más importante: " + esc((RD.info.find((x) => x[0] === a.b.top) || [, ""])[1]) : ""}</b></div>`; }
    if (item === "mat") return `<div class="m-ans"><span>Alternativa elegida</span><b>${empty(a.alt)}</b><span>Criterios de mayor peso</span><b>${empty((a.topn || []).join(" · "))}</b></div>`;
    if (item.startsWith("calc.")) return `<div class="m-ans"><span>Tu resultado</span><b>${empty(a.value && a.value.replace(".", ","))}</b></div>`;
    if (item.startsWith("inc.")) return `<div class="m-ans"><span>ITIL 4</span><b>${empty(a.itil)}</b><span>COBIT 2019</span><b>${empty(a.cobit)}</b><span>ISO 27001</span><b>${empty(a.iso)}</b></div>`;
    return `<div class="m-ans one"><b>${a.text ? esc(a.text.length > 600 ? a.text.slice(0, 599) + "…" : a.text) : `<span class="muted">sin responder</span>`}</b></div>`;
  }
  const mentorChunks = (list, title) => (list || []).length ? `<h5>${icon("book")} ${title}</h5>${list.map((f) => `<details class="m-src ${f.cited ? "cited" : ""}"><summary><b>[${esc(f.id)}]</b> ${esc(f.title)} <span class="muted">· ${esc(f.framework)}</span></summary><p>${esc(f.text)}</p></details>`).join("")}` : "";
  const mentorWhere = (where) => (where || []).length ? `<h5>${icon("search")} Dónde buscar</h5><ul class="m-list">${where.map((w) => { const t = typeof w === "string" ? { text: w } : w; return `<li>${icon("arrow")}<span>${esc(t.text)}${t.tab ? ` <button type="button" class="btn btn-sm btn-ghost" data-mgo="${esc(t.tab)}">Ir</button>` : ""}</span></li>`; }).join("")}</ul>` : "";

  // Memoria del ítem: pistas ya entregadas al equipo y su última revisión (el servidor es la fuente; aquí una copia local).
  const mKey = (cid, item) => `mentorlog:${cid}:${item}`;
  const mMem = (cid, item) => store.get(mKey(cid, item), { hints: {}, last: null });
  const mSaveMem = (cid, item, mem) => store.set(mKey(cid, item), mem);
  const H_NAMES = ["", "¿Dónde busco?", "Pista", "Pista concreta"];
  const H_BTN = ["", "¿Dónde busco?", "Dame una pista", "Pista más concreta"];
  const savedNote = (d) => d.saved_at ? `<span class="muted">guardada ${esc(new Date(d.saved_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }))}${d.saved_by ? ` · la pidió ${esc(d.saved_by)}` : ""}</span>` : "";
  function hintCardHtml(level, d) {
    return `<div class="m-card-h"><span class="pill amber">${H_NAMES[level]}</span>${d.from === "ia" ? `<span class="muted">generada por la IA con el expediente</span>` : d.from === "docente" && level > 1 ? `<span class="muted">del docente</span>` : ""}${savedNote(d)}</div>
      <p>${linkTerms(d.hint || "")}</p>${mentorWhere(level === 1 ? d.where : [])}
      ${mentorChunks(level === 1 ? d.evidence : [], "Fragmentos del expediente relacionados")}${mentorChunks(d.sources, "Fuentes de los marcos")}`;
  }
  function checkCardHtml(d) {
    const [cls, txt] = M_VERDICT[d.verdict] || ["", d.verdict || "—"];
    return `<div class="m-card-h"><span class="pill ${cls}">${icon(d.verdict === "correcto" ? "check" : "alert")} ${esc(txt)}</span><span class="muted">Última revisión de tu respuesta</span>${savedNote(d)}</div>
      ${d.no_verificada ? `<div class="notice m-legacy">${icon("info")}<span><b>Versión anterior · no verificada contra la clave.</b> Esta revisión es de antes de que el Mentor comparara con la solución del docente; no cuenta en tus 2 revisiones.</span></div>` : ""}
      ${d.reevaluada ? `<div class="notice info m-legacy">${icon("check")}<span><b>Re-evaluada por tu docente contra la clave.</b> No gastó ninguna de tus revisiones.</span></div>` : ""}
      ${(d.fields || []).length ? `<ul class="m-fields">${d.fields.map((f) => { const [ic, k, t] = M_FIELD[f.status] || ["alert", "", f.status]; return `<li class="${k}">${icon(ic)}<b>${esc(f.label)}</b><span>${esc(t)}</span></li>`; }).join("")}</ul>` : ""}
      ${d.mistake ? `<div class="notice">${icon("alert")}<span>${esc(d.mistake)}</span></div>` : ""}
      ${d.pregunta ? `<div class="notice">${icon("alert")}<span><b>${esc(d.pregunta)}</b></span></div>` : ""}
      ${d.explicacion && d.explicacion !== d.pregunta ? `<p class="m-why"><b>¿Por qué?</b> ${linkTerms(d.explicacion)}</p>` : ""}
      ${(d.que_revisar || []).length ? `<h5>${icon("target")} Qué revisar</h5>${list(d.que_revisar, "arrow")}` : ""}
      ${(d.evidencia || []).length ? `<h5>${icon("book")} Evidencia del caso</h5>${d.evidencia.map((e) => `<blockquote class="m-quote"><b>[${esc(e.id)}]</b> ${esc(e.cita)}</blockquote>`).join("")}` : ""}
      ${d.siguiente_paso ? `<div class="analogy">${icon("lightbulb")}<span><b>Siguiente paso:</b> ${esc(d.siguiente_paso)}</span></div>` : ""}
      ${d.verdict !== "correcto" ? mentorWhere(d.where) : ""}
      ${mentorChunks(d.evidence, "Fragmentos del expediente")}${mentorChunks(d.sources, "Fuentes de los marcos (RAG)")}
      ${d.has_key === false ? `<p class="hint">Tu docente aún no ha cargado la clave de este ítem: la revisión la hizo la IA con el expediente.</p>` : ""}`;
  }
  // Pinta las pistas guardadas y la última revisión, y ajusta los botones (lo ya obtenido no se vuelve a pedir).
  function mentorRenderMem(cid, item) {
    const box = $("#modal-body"); if (!box || !box.dataset.mctx || JSON.parse(box.dataset.mctx).item !== item) return;
    const mem = mMem(cid, item), gated = !!$(".m-gate", box);
    const card = (html, id) => `<div class="m-card" ${id ? `id="${id}"` : ""}>${html}</div>`;
    $("#m-check").innerHTML = mem.last ? card(checkCardHtml(mem.last)) : "";
    $("#m-hints").innerHTML = [1, 2, 3].filter((l) => mem.hints[l]).map((l) => card(hintCardHtml(l, mem.hints[l]), "m-h" + l)).join("");
    hydrate($("#m-check")); hydrate($("#m-hints"));
    [1, 2, 3].forEach((l) => {
      const b = $(`[data-mhint="${l}"]`, box); if (!b) return;
      const have = !!mem.hints[l];
      b.classList.toggle("done", have);
      b.disabled = gated || (!have && l > 1 && !mem.hints[l - 1]);
      $("span", b).textContent = H_BTN[l] + (have ? " ✓" : "");
    });
    const ck = $("[data-mcheck]", box), q = mem.q;
    if (ck && q) {
      ck.disabled = gated || q.checks_left <= 0;
      $("span", ck).textContent = q.checks_left <= 0 ? `Revisiones agotadas (${q.checks_used}/${q.checks_max})` : `Revisar mi respuesta · quedan ${q.checks_left} de ${q.checks_max}`;
    }
    const n = Object.keys(mem.hints).length;
    $("#m-memo").textContent = n || mem.last ? `Tu equipo ya tiene ${n} pista(s) guardada(s)${mem.last ? " y una revisión" : ""} en este ítem: se muestran aquí sin volver a pedirlas.` : "";
  }
  async function mentorLoadMem(cid, item) {
    if (!apiBase() || !teamSession()) return;
    try {
      const r = await fetch(`${apiBase()}/api/mentor/item?case_id=${cid}&item=${encodeURIComponent(item)}`, { headers: authHeaders() });
      if (!r.ok) return;
      const d = await r.json(); const mem = { hints: {}, last: d.last_check || null, q: d.checks_max ? { checks_used: d.checks_used, checks_max: d.checks_max, checks_left: d.checks_left } : null };
      (d.hints || []).forEach((h) => { mem.hints[h.level] = h; });
      mSaveMem(cid, item, mem); mentorSaveStatus(cid, item, d.status); mentorRenderMem(cid, item);
    } catch { /* sin conexión: se muestra la copia local */ }
  }

  function openMentor(c, item, label, prompt) {
    const cid = c.case_id;
    const a = mentorAnswer(c, item), tabInfo = M_TAB[item.split(".")[0]];
    const gate = !apiBase() ? `<div class="notice m-gate">${icon("alert")}<span>El servidor del curso no está configurado: el mentor no está disponible.</span></div>`
      : !teamSession() ? `<div class="notice info m-gate">${icon("users")}<span>Para usar el mentor ingresa con el <b>código de tu equipo</b> y tu correo institucional. <button type="button" class="btn btn-sm" data-mlogin>Ingresar</button></span></div>` : "";
    openModal(`<div class="m-head"><div class="m-ico">${icon("lightbulb")}</div><div><div class="kick">Mentor IA · ${esc(cid)}</div><h2 id="modal-title">${esc(label)}</h2></div></div>
      ${prompt ? `<p class="m-prompt">${linkTerms(prompt)}</p>` : ""}
      <div class="m-sec"><h5>${icon("edit" in window.ICONS ? "edit" : "target")} Tu respuesta actual</h5>${mentorAnswerHtml(item, a)}
        ${tabInfo && currentTab !== tabInfo[0] ? `<p class="hint">Para cambiarla ve a <button type="button" class="btn btn-sm btn-ghost" data-mgo="${tabInfo[0]}">${esc(tabInfo[1])}</button></p>` : `<p class="hint">Para cambiarla, cierra el mentor y edítala en esta pestaña.</p>`}</div>
      ${gate}
      <div class="m-steps" data-mitem="${esc(item)}">
        <button type="button" class="m-step" data-mhint="1"><b>1</b><span>${H_BTN[1]}</span></button>
        <button type="button" class="m-step" data-mhint="2"><b>2</b><span>${H_BTN[2]}</span></button>
        <button type="button" class="m-step" data-mhint="3"><b>3</b><span>${H_BTN[3]}</span></button>
        <button type="button" class="m-step check" data-mcheck ${gate ? "disabled" : ""}><b>${icon("check")}</b><span>Revisar mi respuesta</span></button>
      </div>
      <p class="hint m-memo" id="m-memo"></p>
      <div id="m-out"><div id="m-check"></div><div id="m-hints"></div></div>
      <p class="hint">El mentor no te da la respuesta: te ayuda a encontrarla con el expediente del caso y los marcos (ISO 27001, ITIL, COBIT, Tier). Las pistas que obtiene tu equipo quedan guardadas: cualquier integrante las ve al abrir este ítem. Cada ítem admite <b>2 revisiones</b> por equipo: revisa tu respuesta con las pistas antes de enviarla.</p>`, "#fbbf24");
    $("#modal-body").dataset.mctx = JSON.stringify({ cid, item, label, prompt });
    mentorRenderMem(cid, item);
    mentorLoadMem(cid, item);
  }

  async function mentorCall(path, payload) {
    let r;
    try { r = await fetch(apiBase() + path, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }); }
    catch { throw new Error("No se pudo contactar al mentor. Si el problema sigue, avisa a tu docente: puede que el servidor del curso aún no tenga el Mentor IA actualizado."); }
    const d = await r.json().catch(() => ({}));
    if (r.status === 404) throw new Error("El servidor del curso aún no tiene el Mentor IA. Tu docente debe actualizarlo.");
    if (r.status === 401) { teamLogout(); throw new Error("Tu sesión de equipo terminó. Ingresa de nuevo."); }
    if (!r.ok) { const e = new Error(d.error || "No fue posible contactar al mentor."); e.data = d; throw e; }
    return d;
  }
  const mFlash = (el) => { if (!el) return; el.scrollIntoView({ behavior: "smooth", block: "nearest" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); };
  async function mentorHint(btn, level) {
    const ctx = JSON.parse($("#modal-body").dataset.mctx || "{}"); const c = byId[ctx.cid]; if (!c) return;
    if (mMem(ctx.cid, ctx.item).hints[level]) return mFlash($("#m-h" + level)); // ya la tiene el equipo: no se vuelve a pedir
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span><span>Buscando…</span>`;
    try {
      const d = await mentorCall("/api/mentor/hint", { case_id: ctx.cid, item: ctx.item, level, label: ctx.label, prompt: ctx.prompt, answer: mentorAnswer(c, ctx.item) });
      mentorSaveStatus(ctx.cid, ctx.item, d.status);
      const mem = mMem(ctx.cid, ctx.item); mem.hints[level] = { ...d, saved_at: d.saved_at || new Date().toISOString() }; mSaveMem(ctx.cid, ctx.item, mem);
      btn.innerHTML = old; mentorRenderMem(ctx.cid, ctx.item); mFlash($("#m-h" + level));
      return;
    } catch (err) { toast(err.message); }
    btn.innerHTML = old; btn.disabled = false;
  }
  async function mentorCheck(btn) {
    const ctx = JSON.parse($("#modal-body").dataset.mctx || "{}"); const c = byId[ctx.cid]; if (!c) return;
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span><span>El mentor está revisando…</span>`;
    try {
      const d = await mentorCall("/api/mentor/check", { case_id: ctx.cid, item: ctx.item, label: ctx.label, prompt: ctx.prompt, answer: mentorAnswer(c, ctx.item) });
      mentorSaveStatus(ctx.cid, ctx.item, d.status);
      const mem = mMem(ctx.cid, ctx.item); mem.last = { ...d, saved_at: new Date().toISOString() };
      mem.q = { checks_used: d.checks_used, checks_max: d.checks_max, checks_left: d.checks_left }; mSaveMem(ctx.cid, ctx.item, mem);
      btn.innerHTML = old; btn.disabled = false; mentorRenderMem(ctx.cid, ctx.item); mFlash($("#m-check .m-card"));
      if (d.verdict === "correcto") toast("¡Correcto! Quedó registrado en el seguimiento de tu equipo.");
      if (currentCase && currentTab === "tutor") refreshMentorPanel();
      return;
    } catch (err) {
      toast(err.message);
      if (err.data && err.data.checks_max) {
        const mem = mMem(ctx.cid, ctx.item); if (err.data.last_check) mem.last = err.data.last_check;
        mem.q = { checks_used: err.data.checks_used, checks_max: err.data.checks_max, checks_left: err.data.checks_left }; mSaveMem(ctx.cid, ctx.item, mem);
      }
    }
    btn.innerHTML = old; btn.disabled = false; mentorRenderMem(ctx.cid, ctx.item);
  }
  document.addEventListener("click", (e) => {
    const mb = e.target.closest("[data-mentor]");
    if (mb && currentCase) { openMentor(currentCase, mb.dataset.mentor, mb.dataset.mlabel, mb.dataset.mprompt); return; }
    const h = e.target.closest("[data-mhint]"); if (h) { mentorHint(h, +h.dataset.mhint); return; }
    if (e.target.closest("[data-mcheck]")) { mentorCheck(e.target.closest("[data-mcheck]")); return; }
    if (e.target.closest("[data-mlogin]")) { openTeamModal(); return; }
    const g = e.target.closest("[data-mgo]");
    if (g && currentCase) { closeModal(); currentTab = g.dataset.mgo; $$(".ws-tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === currentTab)); renderTab(); }
  });

  // Panel «Mentor: seguimiento de tu caso» (pestaña Tutor IA).
  function mentorItems(c) {
    return [["tier", "Redundancia e instalación", ""], ...CALC_FIELDS.filter(([k]) => calcAvailable(c)[k]).map(([k, l]) => ["calc." + k, l, ""]),
      ...c.data.incidents.map(([id, t, txt]) => ["inc." + id, `Incidente ${id} · ${t}`, txt]), ...c.questions.map((q, i) => ["q." + i, `Pregunta guía ${i + 1}`, q])];
  }

  /* ==================== EJERCICIOS GUIADOS (recorridos paso a paso por el sitio) ==================== */
  const TOURS = (window.GUIDE && window.GUIDE.tours) || [];
  const tourById = Object.fromEntries(TOURS.map((t) => [t.id, t]));
  let tour = null;
  const labNow = () => (window.__lab ? window.__lab() : { chain: [] });
  const num = (v) => parseFloat(String(v || "").replace(/\s/g, "").replace(",", "."));
  const TOUR_CHECKS = {
    labCase: (v) => labNow().caseId === v,
    labService: (v) => (labNow().serviceName || "").includes(v),
    labCount: (n) => labNow().chain.length >= n,
    labHas: (a) => labNow().chain.some((c) => c.asset === a),
    labCrit: (a, w) => labNow().chain.some((c) => c.asset === a && c.w >= w),
    labParallel: (a, r) => labNow().chain.some((c) => c.asset === a && c.r >= r),
    modal: (txt) => !modal.hidden && (!txt || ($("#modal-title")?.textContent || "").includes(txt)),
    noModal: () => modal.hidden,
    input: (sel, v) => Math.abs(num($(sel)?.value) - v) < 0.001,
    range: (sel, a, b) => { const x = +$(sel)?.value; return x >= a && x <= b; },
    ninesAv: (a, b) => { const x = +$("#nines")?.dataset.av; return x >= a && x <= b; },
    hash: (h) => location.hash === h,
    tab: (t) => !ws.hidden && currentTab === t,
    simMode: () => !!$("#g-mode [data-mode=fail].on"),
    simNode: (n) => !!$(`.g-node.failed[data-n="${n}"]`),
    patFilter: (v) => patFilter === v,
    calcTried: (k) => !!$(`.calc-row[data-calc="${k}"].bad, .calc-row[data-calc="${k}"].ok, .calc-row[data-calc="${k}"].warn`),
    hintOpen: (k) => { const h = $(`.calc-row[data-calc="${k}"] .calc-hint`); return !!h && !h.hidden; },
    calcOk: (k) => !!$(`.calc-row[data-calc="${k}"].ok`),
    sectorFilter: (v) => sectorFilter === v,
    searchHas: (v) => ($("#case-search")?.value || "").toLowerCase().includes(v),
    hashPrefix: (p) => location.hash.startsWith(p),
    termTip: () => !$("#tooltip").hidden,
    tierSet: () => !!$("[data-tier=actual]")?.value,
    incSel: (id, fw) => !!$(`select[data-inc="${id}"][data-fw="${fw}"]`)?.value,
    bmmInfl: (cid) => (store.get(cid + ":bmm", null)?.influenciadores || []).some((f) => f.o),
    bmmStep: (i) => !!$(`.stp.on[data-step="${i}"]`),
    bmmDofa: (cid) => { const b = store.get(cid + ":bmm", null); return !!b && ["fortalezas", "debilidades", "oportunidades", "amenazas"].some((k) => (b[k] || []).length); },
    bmmCount: (cid, list, n) => (store.get(cid + ":bmm", null)?.[list] || []).length >= n,
    qAnswered: (cid) => Object.values(store.get(cid + ":q", {})).some((x) => x && x.a && x.a.trim()),
    qDone: (cid) => Object.values(store.get(cid + ":q", {})).some((x) => x && x.done),
    matrixAlts: (cid, n) => (store.get(cid + ":matrix", null)?.alts || []).length >= n,
    matrixScored: (cid) => (store.get(cid + ":matrix", null)?.alts || []).some((a) => a.s.some((v) => v !== 3)),
    filled: (sel) => !!($(sel)?.value || "").trim(),
  };
  const TOUR_BEFORE = {
    closeWs: () => { if (!ws.hidden) closeWorkspace(); },
    openCase: (id, tab) => { if (ws.hidden || !currentCase || currentCase.case_id !== id) openCase(id, tab); else if (tab && currentTab !== tab) { currentTab = tab; $$(".ws-tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab)); renderTab(); } },
    scroll: (sel) => $(sel)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    click: (sel) => setTimeout(() => $(sel)?.click(), 60),
    resetCases: () => { const q = $("#case-search"); if (q) q.value = ""; sectorFilter = "Todos"; renderCases(); },
  };
  const coach = $("#coach");
  window.__tourState = () => tour && { id: tour.t.id, i: tour.i, ok: tour.ok, finished: !!tour.finished, timer: !!tour.timer };

  function startTour(id) {
    const t = tourById[id]; if (!t) return;
    if (!modal.hidden) closeModal();
    tour = { t, i: 0, done: false, ran: {} };
    coach.hidden = false; showTourStep();
  }
  function endTour() {
    clearInterval(tour?.timer); clearTimeout(tour?.adv);
    $$(".tour-target").forEach((e) => e.classList.remove("tour-target"));
    tour = null; coach.hidden = true;
    if (/^#guia\//.test(location.hash)) history.replaceState(null, "", "#taller");
  }
  function highlight() {
    if (!tour || tour.finished) return;
    const s = tour.t.steps[tour.i]; if (!s.target) return;
    const el = $(s.target);
    $$(".tour-target").forEach((e) => { if (e !== el) e.classList.remove("tour-target"); });
    if (el && !el.classList.contains("tour-target")) el.classList.add("tour-target");
  }
  function showTourStep() {
    clearInterval(tour.timer); clearTimeout(tour.adv);
    const { t, i } = tour; const s = t.steps[i];
    if (!tour.ran[i]) { (s.before || []).forEach(([fn, ...args]) => TOUR_BEFORE[fn] && TOUR_BEFORE[fn](...args)); tour.ran[i] = true; }
    tour.ok = !s.check;
    coach.innerHTML = `
      <div class="coach-head"><span class="coach-tag">${icon("flask")} Ejercicio guiado · ${esc(t.case)}</span><button class="icon-btn coach-x" data-tour="exit" title="Salir">${icon("x")}</button></div>
      <h4>${esc(t.title)}</h4>
      <div class="coach-dots">${t.steps.map((_, k) => `<i class="${k < i ? "done" : k === i ? "on" : ""}"></i>`).join("")}</div>
      <p class="coach-step"><b>Paso ${i + 1} de ${t.steps.length}.</b> ${esc(s.t)}</p>
      <p class="coach-status" id="coach-status">${s.check ? `${icon("arrow")} Haz la acción indicada en el elemento resaltado…` : `${icon("info")} Observa y pulsa «Siguiente» cuando quieras.`}</p>
      <div class="coach-nav"><button class="btn btn-sm btn-ghost" data-tour="prev" ${i === 0 ? "disabled" : ""}>← Atrás</button>
        <button class="btn btn-sm btn-primary" data-tour="next" id="coach-next" ${s.check ? "disabled" : ""}>${i === t.steps.length - 1 ? "Terminar" : "Siguiente →"}</button></div>`;
    hydrate(coach);
    setTimeout(() => { highlight(); const el = s.target && $(s.target); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 450);
    tour.timer = setInterval(() => {
      if (!tour) return;
      highlight();
      if (s.check && !tour.ok) {
        const [fn, ...args] = s.check;
        let ok = false; try { ok = TOUR_CHECKS[fn](...args); } catch { ok = false; }
        if (ok) {
          tour.ok = true;
          $("#coach-status").innerHTML = `${icon("check")} ¡Hecho!`; $("#coach-status").classList.add("ok");
          $("#coach-next").disabled = false;
          tour.adv = setTimeout(() => tourNext(), 1300);
        }
      }
    }, 400);
  }
  function tourNext() {
    if (!tour) return;
    if (tour.i < tour.t.steps.length - 1) { tour.i++; showTourStep(); return; }
    clearInterval(tour.timer); clearTimeout(tour.adv);
    $$(".tour-target").forEach((e) => e.classList.remove("tour-target"));
    tour.finished = true; store.set("tour:done:" + tour.t.id, true); syncTours();
    const t = tour.t;
    coach.innerHTML = `
      <div class="coach-head"><span class="coach-tag ok">${icon("check")} Ejercicio completado</span><button class="icon-btn coach-x" data-tour="exit" title="Cerrar">${icon("x")}</button></div>
      <h4>${esc(t.title)}</h4>
      <p class="coach-step"><b>Propósito:</b> ${esc(t.purpose)}</p>
      <p class="coach-step"><b>Lo que encontraste:</b> ${esc(t.find)}</p>
      <div class="coach-yours">${icon("target")}<span><b>Tu turno:</b> ${esc(t.yours)}</span></div>
      ${(() => { const nx = TOURS[TOURS.indexOf(t) + 1]; const done = TOURS.filter((x) => store.get("tour:done:" + x.id, false)).length;
        return `<p class="coach-progress">Recorrido completo: <b>${done} de ${TOURS.length}</b> ejercicios</p>
        <div class="coach-nav"><button class="btn btn-sm btn-ghost" data-tour="restart">Repetir</button>${nx ? `<a class="btn btn-sm btn-primary" href="#guia/${nx.id}">Siguiente: ${esc(nx.title)} →</a>` : `<a class="btn btn-sm btn-primary" href="#taller" data-tour="exit">¡Terminaste! Volver al taller</a>`}</div>
        <p class="coach-alt"><a href="#taller" data-tour="exit">Volver al taller</a></p>`; })()}`;
    hydrate(coach);
    if (document.querySelector("#guide-tours")) renderTourCards();
  }
  coach.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tour]"); if (!b) return;
    const a = b.dataset.tour;
    if (a === "exit") { if (b.tagName !== "A") e.preventDefault(); endTour(); if (b.tagName === "A") $("#taller").scrollIntoView({ behavior: "smooth" }); }
    if (a === "next") tourNext();
    if (a === "prev" && tour.i > 0) { tour.i--; showTourStep(); }
    if (a === "restart") startTour(tour.t.id);
  });
  function renderTourCards() {
    const box = $("#guide-tours"); if (!box) return;
    const isDone = (t) => store.get("tour:done:" + t.id, false);
    const done = TOURS.filter(isDone).length; const nextT = TOURS.find((t) => !isDone(t)) || TOURS[0];
    const groups = [...new Set(TOURS.map((t) => t.group || "Ejercicios"))];
    box.innerHTML = `<div class="tour-progress"><div><b>Recorrido completo del sitio</b><span>${done} de ${TOURS.length} ejercicios completados</span></div>
        <div class="tp-bar"><i style="width:${Math.round(done / TOURS.length * 100)}%"></i></div>
        <a class="btn btn-primary" href="#guia/${nextT.id}">${icon("arrow")} ${done ? (done === TOURS.length ? "Repetir desde el inicio" : "Continuar el recorrido") : "Empezar el recorrido completo"}</a></div>` +
      groups.map((gname) => `<h4 class="tour-group">${esc(gname)}</h4><div class="tour-grid">${TOURS.filter((t) => (t.group || "Ejercicios") === gname).map((t) => `<div class="tour-card ${isDone(t) ? "done" : ""}">
        <div class="tc-top"><span class="tc-n">${isDone(t) ? icon("check") : TOURS.indexOf(t) + 1}</span><span class="pill">${t.minutes} min</span></div>
        <b>${esc(t.title)}</b><p>${esc(t.purpose)}</p><small>${esc(t.case)}</small>
        <a class="btn btn-sm btn-primary" href="#guia/${t.id}">${icon("arrow")} Iniciar ejercicio guiado</a></div>`).join("")}</div>`).join("");
  }

  /* ==================== NAVEGACIÓN / EFECTOS ==================== */
  function routing() {
    const tg = location.hash.match(/^#guia\/([\w-]+)/);
    if (tg) { if (!tour || tour.t.id !== tg[1]) startTour(tg[1]); return; }
    const m = location.hash.match(/^#caso\/(C\d{2})/);
    if (m) openCase(m[1]); else if (!ws.hidden) { ws.hidden = true; document.body.classList.remove("lock"); }
  }
  function effects() {
    const bar = $("#scroll-progress"); const links = $$(".nav a"); const secs = links.map((a) => $(a.getAttribute("href")));
    const onScroll = () => {
      const h = document.documentElement; bar.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight) * 100) + "%";
      let cur = -1; secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top < 140) cur = i; });
      links.forEach((a, i) => a.classList.toggle("active", i === cur));
    };
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    $("#nav-toggle").addEventListener("click", () => $("#nav").classList.toggle("open"));
    $("#nav").addEventListener("click", () => $("#nav").classList.remove("open"));
    const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.08 }) : null;
    $$(".reveal").forEach((el) => (io ? io.observe(el) : el.classList.add("in")));
  }

  function backgroundNet() {
    const cv = $("#bg-net"); const ctx = cv.getContext("2d"); let W, H, pts;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const init = () => {
      W = cv.width = innerWidth * devicePixelRatio; H = cv.height = innerHeight * devicePixelRatio;
      const n = Math.min(70, Math.round(innerWidth * innerHeight / 22000));
      pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .3 * devicePixelRatio, vy: (Math.random() - .5) * .3 * devicePixelRatio }));
    };
    const draw = () => {
      ctx.clearRect(0, 0, W, H); const D = 140 * devicePixelRatio;
      for (const p of pts) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < D) { ctx.strokeStyle = `rgba(34,211,238,${(1 - d / D) * .25})`; ctx.lineWidth = devicePixelRatio; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      ctx.fillStyle = "rgba(167,139,250,.7)"; for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 * devicePixelRatio, 0, 7); ctx.fill(); }
      if (!reduce && !document.hidden) requestAnimationFrame(draw);
    };
    init(); draw(); addEventListener("resize", init);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && !reduce) requestAnimationFrame(draw); });
  }

  /* ==================== INICIO ==================== */
  hydrate();
  renderHero(); renderSteps(); renderMap(); renderCompGrid(); renderFormulas();
  availabilityCalc(); ninesCalc(); chainLab();
  renderCases(); casesEvents(); renderHeatmaps(); renderExposureChart();
  renderPatterns(); patternsChart();
  $("#pattern-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-pcat]"); if (b) { patFilter = b.dataset.pcat; renderPatterns(); } });
  renderGuide();
  effects(); backgroundNet();
  window.addEventListener("hashchange", routing); routing();
  renderTeamBtn(); renderCaseBanner(); refreshTeam();
  $("#team-btn")?.addEventListener("click", openTeamModal);
})();
