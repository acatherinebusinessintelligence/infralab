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
  store.set = (k, v) => { _storeSet(k, v); if (k !== "team" && k !== "student") scheduleSync(); };

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
      draw();
    };
    const fillServices = () => {
      selSrv.disabled = !lab.caseId;
      selSrv.innerHTML = lab.caseId ? window.CASE_SERVICES[lab.caseId].rows.map((r, i) => `<option value="${i}">${esc(r[0])} (${esc(r[3])})</option>`).join("") : `<option>—</option>`;
      lab.service = 0; loadService();
    };
    const save = () => store.set(labKey(), { chain, w: +selW.value });
    const eff = (c) => 1 - Math.pow(1 - c.a / 100, c.r);
    const assetLabel = (id) => labAssets(lab.caseId).all.find((a) => a.id === id)?.label || "Componente";

    const calc = () => {
      $$("#chain [data-i] .av").forEach((el) => { el.textContent = "Efectiva: " + fmt(eff(chain[+el.closest("[data-i]").dataset.i]) * 100, 4) + " %"; });
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
        chain.map((c, i) => `<div class="link-arrow"></div><div class="chain-node" data-i="${i}">
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
      if (e.target.dataset.k === "a") { c.a = Math.min(99.999, Math.max(50, +e.target.value || 50)); save(); calc(); }
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
    $("#chain-reset").addEventListener("click", () => { chain = []; save(); loadService(); });
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
      componentes: s.chain.map((c) => ({ activo: assets.find((a) => a.id === c.asset)?.label || c.asset, disponibilidad: c.a, copias: c.r, criticidad: c.w })),
      disponibilidad_calculada: +(s.chain.reduce((a, c) => a * (1 - Math.pow(1 - c.a / 100, c.r)), 1) * 100).toFixed(4),
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

  /* ---- Inventario ---- */
  function tabInventario(body, c) {
    const d = c.data;
    const st = d.storage; const stPct = st.used / st.total * 100;
    const teamTotal = d.team.reduce((s, r) => s + r[1], 0);
    const tierSaved = store.get(c.case_id + ":tier", {});
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
      <div class="card span-12 tier-card"><h4>${icon("building")} Clasificación Tier del centro de datos (Uptime Institute) <span class="h4-r">${mentorBtn("tier", "Clasificación Tier del centro de datos")}</span></h4>
        <div class="tier-grid">${window.TIERS.map((t) => `<div class="tier"><b>${esc(t.name)}</b><span>Redundancia: ${esc(t.red)}</span><span>Distribución: ${esc(t.path)}</span><span>Mantenimiento: ${esc(t.maint)}</span><span class="muted">Referencia histórica: ${esc(t.ref)}</span></div>`).join("")}</div>
        <div class="lab-ctx">
          <label>Tier que mejor describe la situación actual<select data-tier="actual"><option value="">— Elige —</option>${window.TIERS.map((t) => `<option ${tierSaved.actual === t.name ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
          <label>Tier objetivo para los servicios críticos<select data-tier="objetivo"><option value="">— Elige —</option>${window.TIERS.map((t) => `<option ${tierSaved.objetivo === t.name ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>
          <label>Evidencia del inventario que lo justifica<input type="text" data-tier="just" value="${esc(tierSaved.just || "")}" placeholder="p. ej. firewall único, sin segundo sitio…"></label>
        </div>
        <p class="hint">El caso no dice su Tier: dedúcelo del inventario (redundancia, rutas, sitio alterno). Las cifras de disponibilidad son referencias históricas, no requisitos del estándar. ¿Justifica el negocio el costo de subir de nivel, o conviene otra alternativa (nube, sitio alterno)?</p></div>
      <div class="card span-6"><h4>${icon("backup")} Backup</h4>${list(d.backup, "backup")}</div>
      <div class="card span-6"><h4>${icon("wan")} Red y conectividad</h4>${list(d.network, "lan")}</div>
      <div class="card span-6"><h4>${icon("shield")} Seguridad</h4>${list(d.security, "shield")}</div>
      <div class="card span-6"><h4>${icon("users")} Equipo de TI · ${teamTotal} personas</h4><div class="chart-box"><canvas id="ch-team"></canvas></div>${d.teamNote ? `<p class="hint">${esc(d.teamNote)}</p>` : ""}</div>
      <div class="card span-6"><h4>${icon("ticket")} Forma actual de operación</h4>${list(d.operation, "arrow")}</div>
    </div>`;
    body.addEventListener("change", (e) => { const k = e.target.dataset.tier; if (!k) return; const v = store.get(c.case_id + ":tier", {}); v[k] = e.target.value; store.set(c.case_id + ":tier", v); });
    body.addEventListener("input", (e) => { if (e.target.dataset.tier !== "just") return; const v = store.get(c.case_id + ":tier", {}); v.just = e.target.value; store.set(c.case_id + ":tier", v); });
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
  function calcExpected(c) {
    const s = c.data.service, st = c.data.storage;
    return {
      av: { ok: (s.window - s.down) / s.window * 100, tol: 0.02 },
      mttr: { ok: s.rec / s.inc, tol: 0.05, alt: [[s.down / s.inc, "Usaste el tiempo fuera de servicio. El caso entrega por separado el «tiempo total empleado en recuperación». ¿Cuál corresponde al MTTR?"]] },
      mtbf: { ok: (s.window - s.down) / s.inc, tol: 0.05, alt: [[s.window / s.inc, "Usaste el periodo completo. ¿Debe contarse como tiempo de operación el tiempo en que el servicio estuvo caído?"]] },
      months: st.growth ? { ok: (st.total - st.used) / st.growth, tol: 0.15 } : null,
    };
  }
  function checkValue(exp, v) {
    if (!exp || !isFinite(v)) return { state: "", msg: "" };
    const near = (a, b, t) => Math.abs(a - b) <= Math.max(t, Math.abs(b) * 0.005);
    if (near(v, exp.ok, exp.tol)) return { state: "ok", msg: "¡Correcto! Ahora interpreta el resultado: ¿es aceptable para este negocio?" };
    for (const [alt, m] of exp.alt || []) if (near(v, alt, exp.tol)) return { state: "warn", msg: m };
    return { state: "bad", msg: "No coincide. Revisa la fórmula y las unidades (horas, %, TB vs. GB)." };
  }

  function tabMetricas(body, c) {
    const d = c.data, s = d.service, st = d.storage;
    const exp = calcExpected(c);
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
        <div class="calc-list">${CALC_FIELDS.filter(([k]) => exp[k]).map(([k, l, u, f]) => { const r = checkValue(exp[k], saved[k]); return `
          <div class="calc-row ${r.state}" data-calc="${k}">
            <label><span>${esc(l)} <span class="muted">(${u})</span></span><input type="text" inputmode="decimal" value="${saved[k] != null ? esc(String(saved[k]).replace(".", ",")) : ""}" placeholder="?"></label>
            <button class="btn btn-sm" data-verify="${k}">Verificar</button>
            <button class="icon-btn" data-hint="${k}" title="Ver fórmula">${icon("info")}</button>${mentorBtn("calc." + k, l)}
            <p class="calc-msg">${r.msg}</p><p class="calc-hint" hidden>Fórmula: <code>${esc(f)}</code></p></div>`; }).join("")}</div>
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
      const r = checkValue(exp[k], v);
      row.className = "calc-row " + r.state; $(".calc-msg", row).textContent = r.msg || "Escribe un número.";
      const sv = store.get(c.case_id + ":calc", {}); sv[k] = isFinite(v) ? v : null; sv[k + "_ok"] = r.state === "ok"; store.set(c.case_id + ":calc", sv);
      if (r.state === "ok") toast("¡Cálculo correcto!");
    });
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
            <div class="inc-mentor">${mentorBtn("inc." + id, `Incidente ${id} · ${t}`, txt, "Mentor: revisar mi clasificación")}</div></div>
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
        <ol class="q-list">${c.questions.map((q, i) => { const s = st[i] || {}; return `<li class="q-item ${s.done ? "done" : ""}" data-q="${i}"><input type="checkbox" ${s.done ? "checked" : ""} aria-label="Marcar como respondida"><div class="q-text">${linkTerms(q)}</div><textarea placeholder="Tu respuesta o hipótesis…">${esc(s.a || "")}</textarea><div class="q-mentor">${mentorBtn("q." + i, `Pregunta guía ${i + 1}`, q, "Mentor: pista o revisión")}</div></li>`; }).join("")}</ol></div>
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

  /* ---- Tutor IA (DeepSeek vía backend en PythonAnywhere) ---- */
  const API_BASE = ((window.INFRALAB_CONFIG || {}).API_BASE || "").replace(/\/+$/, "");
  const LEVELS = ["Insuficiente", "En desarrollo", "Satisfactorio", "Excelente"];
  const levelClass = (l) => ({ Insuficiente: "red", "En desarrollo": "amber", Satisfactorio: "green", Excelente: "green" }[l] || "");
  const TUTOR_SECTIONS = [
    ["preguntas", "Preguntas guía"], ["bmm", "BMM"], ["calculos", "Cálculos del verificador"], ["itil", "Incidentes: ITIL · COBIT · ISO"], ["tier", "Clasificación Tier"],
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
    if (sections.includes("tier")) { const tr = store.get(c.case_id + ":tier", null); if (tr) out.tier = tr; }
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
      calculos: `${CALC_FIELDS.filter(([k]) => store.get(c.case_id + ":calc", {})[k + "_ok"]).length} verificados`, itil: `${Object.values(getInc(c.case_id)).filter((v) => v.itil || v.cobit || v.iso).length}/${c.data.incidents.length} clasificados`, tier: store.get(c.case_id + ":tier", null)?.actual ? "clasificado" : "sin clasificar",
      laboratorio: `${labChainsFor(c.case_id).length} servicios analizados`, matriz: `${(store.get(c.case_id + ":matrix", null)?.alts || []).length} alternativas`, libre: "" };
    const lastSel = store.get("tutor:sections", ["preguntas", "bmm", "libre"]);
    body.innerHTML = `<div class="ws-grid">
      <div class="span-12 notice info">${icon("lightbulb")}<span><b>Mentor y Tutor IA con RAG.</b> El <b>Mentor</b> te acompaña ítem por ítem (pistas y revisión de cada respuesta) y el <b>Tutor</b> hace una revisión integral: revisa lo que has trabajado en este caso y te da retroalimentación formativa apoyada en ISO/IEC 27001:2022, ITIL 4, COBIT 2019, Tier, BMM y el expediente del caso, citando las fuentes. <b>No te dará la solución</b>: su trabajo es ayudarte a sustentar mejor (problema → evidencia → impacto → decisión → métrica). Para usarlo ingresa con el código de tu equipo. Tus respuestas se envían al servidor del curso y al modelo DeepSeek para generar la retroalimentación, y tu docente puede consultarlas.</span></div>
      ${API_BASE ? "" : `<div class="span-12 notice">${icon("alert")}<span><b>El backend no está configurado.</b> El docente debe desplegar la carpeta <code>backend/</code> en PythonAnywhere y escribir su URL en <code>assets/js/config.js</code> (<code>API_BASE</code>). Mientras tanto puedes seguir trabajando: todo se guarda en tu navegador.</span></div>`}
      <div class="card span-12 mentor-card"><h4>${icon("lightbulb")} Mentor IA · seguimiento de tu caso</h4>
        <p class="muted" style="margin-top:-6px">El mentor trabaja ítem por ítem: te dice <b>dónde buscar</b>, te da <b>pistas graduadas</b> y <b>revisa tu respuesta</b> explicándote el porqué con el expediente del caso y los marcos, sin darte la solución. También lo encuentras junto a cada ítem: Tier (Inventario), cálculos (Métricas), incidentes y preguntas guía (Retos).</p>
        <p id="mentor-note"></p><div id="mentor-panel"></div></div>
      <div class="card span-4"><h4>${icon("users")} Mi equipo</h4><div class="team-card">${teamCardHtml()}</div>
        <p class="hint" id="api-status">${API_BASE ? "Comprobando conexión con el servidor…" : ""}</p></div>
      <div class="card span-8"><h4>${icon("zap")} Revisión integral del tutor</h4>
        <p class="muted" style="margin-top:-6px">Elige qué quieres que revise el tutor:</p>
        <div class="sec-picks">${TUTOR_SECTIONS.map(([k, l]) => `<label class="sec-pick"><input type="checkbox" value="${k}" ${lastSel.includes(k) ? "checked" : ""}><span><b>${l}</b>${counts[k] ? `<small>${counts[k]}</small>` : ""}</span></label>`).join("")}</div>
        <label style="margin-top:12px">Mi propuesta o pregunta para el tutor<textarea id="tutor-free" rows="4" placeholder="Describe tu análisis, tu alternativa preferida o la duda que tienes…">${esc(store.get(c.case_id + ":tutorfree", ""))}</textarea></label>
        <div class="row-actions"><button class="btn btn-primary" id="tutor-send" ${API_BASE ? "" : "disabled"}>${icon("zap")} Pedir retroalimentación</button></div>
        <div id="tutor-out"></div></div>
      <div class="card span-12"><h4>${icon("book")} Biblioteca de conocimiento (RAG)</h4>
        <p class="muted" style="margin-top:-6px">La misma base en la que se apoya el tutor: ISO/IEC 27001:2022, ITIL 4, COBIT 2019, Tier, BMM, la metodología del curso y el expediente de este caso. Consultarla no gasta solicitudes al tutor.</p>
        <div class="kb-bar"><input type="search" id="kb-q" placeholder="p. ej. copias de seguridad, gestión de cambios, Tier III, objetivos SMART…">
          <select id="kb-fw"><option value="">Todas las fuentes</option>${["ISO/IEC 27001:2022", "ITIL 4", "COBIT 2019", "Tier (Uptime Institute)", "Business Motivation Model", "Metodología del curso"].map((f) => `<option>${f}</option>`).join("")}</select>
          <button class="btn btn-sm" id="kb-go" ${API_BASE ? "" : "disabled"}>Buscar</button></div>
        <div class="kb-results" id="kb-out"></div></div>
      <div class="card span-12"><h4>${icon("chart")} Mi seguimiento en este caso</h4>
        <div class="chart-box short"><canvas id="ch-tutor"></canvas></div><div id="tutor-hist"></div></div>
    </div>`;

    const saveStudent = () => { const t = teamSession(); if (t) { st.name = `${t.member.firstname} ${t.member.lastname} · ${t.team.name}`; st.group = `NRC ${t.team.nrc}`; st.email = t.member.email; store.set("student", st); } };
    $("#tutor-free").addEventListener("input", (e) => store.set(c.case_id + ":tutorfree", e.target.value));

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
      fetch(API_BASE + "/api/health").then((r) => r.json()).then((h) => { $("#api-status").innerHTML = h.ok && h.llm_configured ? `<span class="pill green">Servidor conectado</span>` : `<span class="pill amber">Servidor sin clave de DeepSeek</span>`; })
        .catch(() => { $("#api-status").innerHTML = `<span class="pill red">No se pudo contactar el servidor</span>`; });
      fetch(`${API_BASE}/api/history?student_id=${encodeURIComponent(st.id)}&case_id=${c.case_id}`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && d.items) renderHistory(d.items); }).catch(() => {});
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

    $("#tutor-send").addEventListener("click", async () => {
      saveStudent();
      if (!teamSession()) return toast("Ingresa primero con el código de tu equipo y tu correo institucional");
      const sections = $$(".sec-pick input:checked", body).map((i) => i.value);
      store.set("tutor:sections", sections);
      const content = tutorContent(c, sections, $("#tutor-free").value);
      if (!Object.keys(content).length) return toast("No hay contenido para revisar en las secciones elegidas");
      const btn = $("#tutor-send"); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> El tutor está leyendo tu trabajo…`;
      $("#tutor-out").innerHTML = "";
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 120000);
      try {
        const r = await fetch(API_BASE + "/api/feedback", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, signal: ctrl.signal,
          body: JSON.stringify({ student: st, case_id: c.case_id, sections, content, context: tutorContext(c) }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
        $("#tutor-out").innerHTML = feedbackHtml(d.feedback, "Ahora"); hydrate($("#tutor-out"));
        const hist = store.get("tutor:" + c.case_id, []); hist.unshift({ id: d.id, created_at: d.created_at, level: d.feedback?.nivel_global, sections, feedback: d.feedback }); renderHistory(hist);
      } catch (err) {
        $("#tutor-out").innerHTML = `<div class="notice" style="margin-top:12px">${icon("alert")}<span>${esc(err.name === "AbortError" ? "El servidor tardó demasiado en responder. Intenta de nuevo." : err.message)}</span></div>`; hydrate($("#tutor-out"));
      } finally { clearTimeout(to); btn.disabled = false; btn.innerHTML = `${icon("zap")} Pedir retroalimentación`; }
    });
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

  /* ---- Matriz de decisión ---- */
  const DEFAULT_CRITERIA = [["Impacto en disponibilidad / riesgo", 30], ["Costo (5 = más económico)", 20], ["Complejidad (5 = más simple)", 15], ["Tiempo de implementación (5 = más rápido)", 15], ["Cumplimiento de restricciones", 20]];
  const getMatrix = (id) => store.get(id + ":matrix", null) || { criteria: DEFAULT_CRITERIA.map(([n, w]) => ({ n, w })), alts: [] };
  function addAlt(caseId, id, name) {
    const m = getMatrix(caseId);
    if (m.alts.length >= 4 || (id && m.alts.some((a) => a.id === id))) return false;
    m.alts.push({ id, name, s: m.criteria.map(() => 3), j: "" }); store.set(caseId + ":matrix", m); return true;
  }
  function tabMatriz(body, c) {
    const m = getMatrix(c.case_id);
    const sumW = m.criteria.reduce((s, k) => s + (+k.w || 0), 0) || 1;
    const total = (a) => m.criteria.reduce((s, k, i) => s + (+k.w || 0) * (a.s[i] || 0), 0) / (sumW * 5) * 100;
    const best = m.alts.length ? Math.max(...m.alts.map(total)) : 0;
    body.innerHTML = `<div class="ws-grid">
      <div class="card span-12"><h4>${icon("puzzle")} 1 · Elige hasta 4 alternativas</h4>
        <div class="pick-list">${c.alternatives.map((k) => `<button class="pick ${m.alts.some((a) => a.id === k) ? "on" : ""}" data-pick="${k}">${esc(PATTERNS[k].name)}</button>`).join("")}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><input type="text" id="custom-alt" placeholder="…o escribe una alternativa propia (p. ej. «Alternativa B: híbrida con DR en nube»)" style="flex:1 1 320px"><button class="btn btn-sm" id="add-custom">Agregar</button></div>
        <p class="hint">Consejo: una alternativa bien planteada suele combinar varios patrones. Dale un nombre propio que la describa.</p></div>
      ${m.alts.length ? `
      <div class="card span-7"><h4>${icon("chart")} 2 · Pondera y califica (1 = peor, 5 = mejor)</h4>
        <div class="heat-scroll"><table class="matrix"><thead><tr><th>Criterio</th><th>Peso %</th>${m.alts.map((a, i) => `<th class="alt-h">${esc(a.name)} <button class="rm" data-rmalt="${i}" title="Quitar">×</button></th>`).join("")}</tr></thead>
        <tbody>${m.criteria.map((k, ci) => `<tr><td><input type="text" value="${esc(k.n)}" data-crit="${ci}"></td><td><input type="number" min="0" max="100" value="${k.w}" data-w="${ci}"></td>
          ${m.alts.map((a, ai) => `<td><select data-s="${ai}-${ci}">${[1, 2, 3, 4, 5].map((v) => `<option ${a.s[ci] === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>`).join("")}</tr>`).join("")}</tbody>
        <tfoot><tr><td>Puntaje ponderado</td><td class="muted" style="font:500 12px var(--mono)">Σ ${sumW}%</td>${m.alts.map((a) => `<td style="${total(a) === best ? "color:#34d399" : ""}">${fmt(total(a), 1)}</td>`).join("")}</tr></tfoot></table></div>
        ${sumW !== 100 ? `<p class="hint" style="color:#fbbf24">Los pesos suman ${sumW}%. Se normalizan, pero lo ideal es que sumen 100 %.</p>` : ""}
        <div class="row-actions"><button class="btn btn-sm btn-ghost" id="add-crit">+ criterio</button><button class="btn btn-sm btn-ghost" id="reset-matrix">Reiniciar matriz</button></div></div>
      <div class="card span-5"><h4>${icon("target")} Comparación visual</h4><div class="chart-box tall"><canvas id="ch-matrix"></canvas></div></div>
      <div class="card span-12"><h4>${icon("book")} 3 · Justifica cada alternativa</h4>
        ${m.alts.map((a, i) => `<label style="margin-bottom:12px"><b style="color:var(--text)">${esc(a.name)}</b><textarea data-j="${i}" placeholder="¿Qué SPOF o riesgo ataca? ¿Qué evidencia respalda tus puntajes? ¿Qué riesgo nuevo introduce?">${esc(a.j)}</textarea></label>`).join("")}
        <div class="notice info">${icon("lightbulb")}<span><b>Análisis de sensibilidad:</b> cambia los pesos (p. ej. duplica el de costo). ¿Sigue ganando la misma alternativa? Si la decisión cambia con un ajuste pequeño, explícalo en tu informe.</span></div>
        <div class="row-actions"><button class="btn btn-primary" id="dl-md">${icon("download")} <span class="lbl">Descargar informe (.md)</span></button><button class="btn" id="cp-md">${icon("copy")} <span class="lbl">Copiar al portapapeles</span></button></div></div>`
      : `<div class="span-12 notice info">${icon("info")}<span>Aún no tienes alternativas en la matriz. Elige al menos tres para comparar.</span></div>`}
    </div>`;

    const save = (rerender) => { store.set(c.case_id + ":matrix", m); if (rerender) renderTab(); else updateTotals(); };
    const updateTotals = () => {
      const sw = m.criteria.reduce((s, k) => s + (+k.w || 0), 0) || 1;
      const tots = m.alts.map((a) => m.criteria.reduce((s, k, i) => s + (+k.w || 0) * (a.s[i] || 0), 0) / (sw * 5) * 100);
      const mx = Math.max(...tots);
      $$("tfoot td", body).slice(2).forEach((td, i) => { td.textContent = fmt(tots[i], 1); td.style.color = tots[i] === mx ? "#34d399" : ""; });
      if (radar) { radar.data.labels = m.criteria.map((k) => k.n.length > 22 ? k.n.slice(0, 20) + "…" : k.n); radar.data.datasets.forEach((d, i) => (d.data = m.alts[i].s.slice())); radar.update(); }
    };
    body.addEventListener("click", (e) => {
      const p = e.target.closest("[data-pick]");
      if (p) { const k = p.dataset.pick; const i = m.alts.findIndex((a) => a.id === k); if (i >= 0) m.alts.splice(i, 1); else if (m.alts.length < 4) m.alts.push({ id: k, name: PATTERNS[k].name, s: m.criteria.map(() => 3), j: "" }); else toast("Máximo 4 alternativas"); return save(true); }
      const r = e.target.closest("[data-rmalt]"); if (r) { m.alts.splice(+r.dataset.rmalt, 1); return save(true); }
      if (e.target.closest("#add-custom")) { const v = $("#custom-alt").value.trim(); if (!v) return; if (m.alts.length >= 4) return toast("Máximo 4 alternativas"); m.alts.push({ id: null, name: v, s: m.criteria.map(() => 3), j: "" }); return save(true); }
      if (e.target.closest("#add-crit")) { m.criteria.push({ n: "Nuevo criterio", w: 10 }); m.alts.forEach((a) => a.s.push(3)); return save(true); }
      if (e.target.closest("#reset-matrix")) { store.set(c.case_id + ":matrix", null); return renderTab(); }
      if (e.target.closest("#dl-md")) { const blob = new Blob([exportMd(c, m)], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `InfraLab_${c.case_id}_matriz.md`; document.body.appendChild(a); a.click(); a.remove(); return; }
      if (e.target.closest("#cp-md")) { navigator.clipboard?.writeText(exportMd(c, m)).then(() => toast("Informe copiado"), () => toast("No se pudo copiar")); }
    });
    body.addEventListener("change", (e) => {
      const s = e.target.dataset.s; if (s) { const [ai, ci] = s.split("-").map(Number); m.alts[ai].s[ci] = +e.target.value; save(); }
      if (e.target.dataset.w != null) { m.criteria[+e.target.dataset.w].w = Math.max(0, +e.target.value || 0); save(true); }
    });
    body.addEventListener("input", (e) => {
      if (e.target.dataset.crit != null) { m.criteria[+e.target.dataset.crit].n = e.target.value; store.set(c.case_id + ":matrix", m); }
      if (e.target.dataset.j != null) { m.alts[+e.target.dataset.j].j = e.target.value; store.set(c.case_id + ":matrix", m); }
    });
    const pal = ["#22d3ee", "#a78bfa", "#f472b6", "#fbbf24"];
    const radar = m.alts.length ? makeChart($("#ch-matrix"), { type: "radar", data: { labels: m.criteria.map((k) => k.n.length > 22 ? k.n.slice(0, 20) + "…" : k.n), datasets: m.alts.map((a, i) => ({ label: a.name.length > 28 ? a.name.slice(0, 26) + "…" : a.name, data: a.s.slice(), borderColor: pal[i], backgroundColor: alpha(pal[i], .15), pointBackgroundColor: pal[i] })) },
      options: { maintainAspectRatio: false, scales: { r: { min: 0, max: 5, ticks: { stepSize: 1, display: false }, grid: { color: "rgba(148,163,184,.15)" }, angleLines: { color: "rgba(148,163,184,.15)" }, pointLabels: { color: "#cdd7e8", font: { size: 11 } } } }, plugins: { legend: { position: "bottom" } } } }, wsCharts) : null;
  }

  function exportMd(c, m) {
    const sw = m.criteria.reduce((s, k) => s + (+k.w || 0), 0) || 1;
    const tot = (a) => (m.criteria.reduce((s, k, i) => s + (+k.w || 0) * a.s[i], 0) / (sw * 5) * 100).toFixed(1);
    const q = store.get(c.case_id + ":q", {});
    let md = `# InfraLab · ${c.case_id} — ${c.title}\n\n**Sector:** ${c.sector}  \n**Reto:** ${c.challenge_type}  \n**Fecha:** ${new Date().toLocaleDateString("es-CO")}\n\n## Matriz de decisión\n\n`;
    md += `| Criterio | Peso % | ${m.alts.map((a) => a.name).join(" | ")} |\n|---|---|${m.alts.map(() => "---").join("|")}|\n`;
    m.criteria.forEach((k, i) => (md += `| ${k.n} | ${k.w} | ${m.alts.map((a) => a.s[i]).join(" | ")} |\n`));
    md += `| **Puntaje ponderado (0-100)** | ${sw} | ${m.alts.map((a) => `**${tot(a)}**`).join(" | ")} |\n\n## Justificación\n\n`;
    m.alts.forEach((a) => (md += `### ${a.name}\n\n${a.j || "_(pendiente)_"}\n\n`));
    const calc = store.get(c.case_id + ":calc", {}), itil = getInc(c.case_id);
    md += `## Cálculos (servicio: ${c.data.service.name})\n\n| Indicador | Mi resultado | Verificado |\n|---|---|---|\n`;
    CALC_FIELDS.forEach(([k, l, u]) => (md += `| ${l} | ${calc[k] != null ? calc[k] + " " + u : "—"} | ${calc[k + "_ok"] ? "✅" : "—"} |\n`));
    md += `\n## Incidentes: ITIL · COBIT · ISO/IEC 27001\n\n`;
    c.data.incidents.forEach(([id, t]) => (md += `- **${id}. ${t}** → ITIL: ${itil[id]?.itil || "—"} · COBIT: ${itil[id]?.cobit || "—"} · ISO: ${itil[id]?.iso || "—"}\n`));
    const tr = store.get(c.case_id + ":tier", null);
    if (tr) md += `\n## Clasificación Tier\n\n- Actual: ${tr.actual || "—"}\n- Objetivo: ${tr.objetivo || "—"}\n- Justificación: ${tr.just || "—"}\n`;
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
    b.innerHTML = t ? `${icon("users")} <span>${esc(t.team.name)} · ${esc(t.team.nrc)}</span>` : `${icon("key")} <span>Ingresar con mi equipo</span>`;
  }
  function teamCardHtml() {
    const t = teamSession();
    if (!apiBase()) return `<p class="muted">El servidor del curso no está configurado: puedes trabajar sin ingresar y todo se guarda en este navegador.</p>`;
    if (t) return `<div class="team-in"><span class="pill green">${icon("check")} Equipo verificado</span>
        <h3>${esc(t.team.name)} <small class="muted">· NRC ${esc(t.team.nrc)} · ${esc(t.team.period)}</small></h3>
        <p class="muted" style="margin:0 0 6px">Ingresaste como <b>${esc(t.member.firstname)} ${esc(t.member.lastname)}</b></p>
        <p style="margin:0 0 10px">Integrantes: ${t.team.members.map(esc).join(", ")}</p>
        ${t.team.case_id ? `<button class="btn btn-sm btn-primary" data-open-case="${t.team.case_id}">${icon("arrow")} Abrir el caso de mi equipo (${t.team.case_id})</button>` : `<p class="hint">Tu docente aún no le asigna un caso a tu equipo.</p>`}
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
      toast(`Bienvenido, ${d.member.firstname}`); afterTeamChange(); syncProgress();
    } catch (e) { msg.textContent = e.message; }
  }
  function teamLogout() { try { localStorage.removeItem("infralab:team"); } catch { /* */ } toast("Saliste del equipo"); afterTeamChange(); }
  function afterTeamChange() {
    renderTeamBtn(); renderCases();
    $$(".team-card").forEach((el) => { el.innerHTML = teamCardHtml(); hydrate(el); });
    if (currentCase && currentTab === "tutor") renderTab();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-team]"); if (!b) return;
    if (b.dataset.team === "login") teamLogin(b.closest(".team-card") || document);
    if (b.dataset.team === "logout") teamLogout();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.closest("[data-team-f]")) teamLogin(e.target.closest(".team-card")); });
  async function refreshTeam() {
    const t = teamSession(); if (!t || !apiBase()) return renderTeamBtn();
    try {
      const r = await fetch(apiBase() + "/api/auth/me", { headers: authHeaders() });
      if (r.status === 401) { teamLogout(); toast("Tu sesión de equipo terminó o el equipo fue retirado. Ingresa de nuevo."); return; }
      const d = await r.json(); store.set("team", { ...t, team: d.team, member: d.member }); afterTeamChange();
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
      tier_set: tier && tier.actual ? 1 : 0, lab_services: labChainsFor(cid).length, matrix_alts: (m?.alts || []).length,
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

  /* ==================== MENTOR IA (pistas graduadas y revisión por ítem) ==================== */
  // La clave de respuestas vive solo en el servidor: aquí solo se envía la respuesta del equipo y se muestra el porqué.
  const M_VERDICT = { correcto: ["green", "Correcto"], parcial: ["amber", "Parcialmente correcto"], incorrecto: ["red", "Incorrecto"], sin_respuesta: ["", "Sin respuesta"] };
  const M_FIELD = { correcto: ["check", "green", "correcto"], aceptable: ["check", "amber", "defendible, pero hay una opción que ataca mejor la causa"], incorrecto: ["x", "red", "no coincide con la evidencia"], sin_respuesta: ["alert", "", "sin responder"] };
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
    if (item === "tier") { const t = store.get(cid + ":tier", {}); return { actual: t.actual || "", objetivo: t.objetivo || "", just: t.just || "" }; }
    if (item.startsWith("calc.")) { const v = store.get(cid + ":calc", {})[item.slice(5)]; return { value: v == null ? "" : String(v) }; }
    if (item.startsWith("inc.")) { const v = getInc(cid)[item.slice(4)] || {}; return { itil: v.itil || "", cobit: v.cobit || "", iso: v.iso || "" }; }
    if (item.startsWith("q.")) return { text: store.get(cid + ":q", {})[item.slice(2)]?.a || "" };
    return {};
  }
  const M_TAB = { tier: ["inventario", "Inventario → Clasificación Tier"], calc: ["metricas", "Métricas → Verificador de cálculos"], inc: ["incidentes", "Incidentes"], q: ["retos", "Retos → Preguntas guía"] };
  function mentorAnswerHtml(item, a) {
    const empty = (x) => (x ? esc(x) : `<span class="muted">sin responder</span>`);
    if (item === "tier") return `<div class="m-ans"><span>Tier actual</span><b>${empty(a.actual)}</b><span>Tier objetivo</span><b>${empty(a.objetivo)}</b><span>Evidencia</span><b>${empty(a.just)}</b></div>`;
    if (item.startsWith("calc.")) return `<div class="m-ans"><span>Tu resultado</span><b>${empty(a.value && a.value.replace(".", ","))}</b></div>`;
    if (item.startsWith("inc.")) return `<div class="m-ans"><span>ITIL 4</span><b>${empty(a.itil)}</b><span>COBIT 2019</span><b>${empty(a.cobit)}</b><span>ISO 27001</span><b>${empty(a.iso)}</b></div>`;
    return `<div class="m-ans one"><b>${a.text ? esc(a.text.length > 600 ? a.text.slice(0, 599) + "…" : a.text) : `<span class="muted">sin responder</span>`}</b></div>`;
  }
  const mentorChunks = (list, title) => (list || []).length ? `<h5>${icon("book")} ${title}</h5>${list.map((f) => `<details class="m-src ${f.cited ? "cited" : ""}"><summary><b>[${esc(f.id)}]</b> ${esc(f.title)} <span class="muted">· ${esc(f.framework)}</span></summary><p>${esc(f.text)}</p></details>`).join("")}` : "";
  const mentorWhere = (where) => (where || []).length ? `<h5>${icon("search")} Dónde buscar</h5><ul class="m-list">${where.map((w) => { const t = typeof w === "string" ? { text: w } : w; return `<li>${icon("arrow")}<span>${esc(t.text)}${t.tab ? ` <button type="button" class="btn btn-sm btn-ghost" data-mgo="${esc(t.tab)}">Ir</button>` : ""}</span></li>`; }).join("")}</ul>` : "";

  function openMentor(c, item, label, prompt) {
    const cid = c.case_id, st = mentorCache(cid)[item] || {};
    const a = mentorAnswer(c, item), tabInfo = M_TAB[item.split(".")[0]];
    const gate = !apiBase() ? `<div class="notice">${icon("alert")}<span>El servidor del curso no está configurado: el mentor no está disponible.</span></div>`
      : !teamSession() ? `<div class="notice info">${icon("users")}<span>Para usar el mentor ingresa con el <b>código de tu equipo</b> y tu correo institucional. <button type="button" class="btn btn-sm" data-mlogin>Ingresar</button></span></div>` : "";
    openModal(`<div class="m-head"><div class="m-ico">${icon("lightbulb")}</div><div><div class="kick">Mentor IA · ${esc(cid)}</div><h2 id="modal-title">${esc(label)}</h2></div></div>
      ${prompt ? `<p class="m-prompt">${linkTerms(prompt)}</p>` : ""}
      <div class="m-sec"><h5>${icon("edit" in window.ICONS ? "edit" : "target")} Tu respuesta actual</h5>${mentorAnswerHtml(item, a)}
        ${tabInfo && currentTab !== tabInfo[0] ? `<p class="hint">Para cambiarla ve a <button type="button" class="btn btn-sm btn-ghost" data-mgo="${tabInfo[0]}">${esc(tabInfo[1])}</button></p>` : `<p class="hint">Para cambiarla, cierra el mentor y edítala en esta pestaña.</p>`}</div>
      ${gate}
      <div class="m-steps" data-mitem="${esc(item)}">
        <button type="button" class="m-step" data-mhint="1" ${gate ? "disabled" : ""}><b>1</b><span>¿Dónde busco?</span></button>
        <button type="button" class="m-step" data-mhint="2" ${gate || (st.max_hint || 0) < 1 ? "disabled" : ""}><b>2</b><span>Dame una pista</span></button>
        <button type="button" class="m-step" data-mhint="3" ${gate || (st.max_hint || 0) < 2 ? "disabled" : ""}><b>3</b><span>Pista más concreta</span></button>
        <button type="button" class="m-step check" data-mcheck ${gate ? "disabled" : ""}><b>${icon("check")}</b><span>Revisar mi respuesta</span></button>
      </div>
      <div id="m-out"></div>
      <p class="hint">El mentor no te da la respuesta: te ayuda a encontrarla con el expediente del caso y los marcos (ISO 27001, ITIL, COBIT, Tier). Cada pista y cada revisión quedan en el seguimiento de tu equipo.${st.checks ? ` Llevas ${st.checks} revisión(es) y ${st.hints || 0} pista(s) en este ítem.` : ""}</p>`, "#fbbf24");
    const box = $("#modal-body");
    box.dataset.mctx = JSON.stringify({ cid, item, label, prompt });
  }

  async function mentorCall(path, payload) {
    const r = await fetch(apiBase() + path, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { teamLogout(); throw new Error("Tu sesión de equipo terminó. Ingresa de nuevo."); }
    if (!r.ok) throw new Error(d.error || "No fue posible contactar al mentor.");
    return d;
  }
  function mentorOut(html, append = true) {
    const out = $("#m-out"); if (!out) return;
    const el = document.createElement("div"); el.className = "m-card"; el.innerHTML = html; hydrate(el);
    if (!append) out.innerHTML = "";
    out.prepend(el); el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  async function mentorHint(btn, level) {
    const ctx = JSON.parse($("#modal-body").dataset.mctx || "{}"); const c = byId[ctx.cid]; if (!c) return;
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span><span>Buscando…</span>`;
    try {
      const d = await mentorCall("/api/mentor/hint", { case_id: ctx.cid, item: ctx.item, level, label: ctx.label, prompt: ctx.prompt, answer: mentorAnswer(c, ctx.item) });
      mentorSaveStatus(ctx.cid, ctx.item, d.status);
      const names = ["", "¿Dónde busco?", "Pista", "Pista concreta"];
      mentorOut(`<div class="m-card-h"><span class="pill amber">${names[level]}</span>${d.from === "ia" ? `<span class="muted">generada por la IA con el expediente</span>` : d.from === "docente" && level > 1 ? `<span class="muted">del docente</span>` : ""}</div>
        <p>${linkTerms(d.hint || "")}</p>${mentorWhere(level === 1 ? d.where : [])}
        ${mentorChunks(d.evidence && level === 1 ? d.evidence : [], "Fragmentos del expediente relacionados")}${mentorChunks(d.sources, "Fuentes de los marcos")}`);
      const next = $(`[data-mhint="${level + 1}"]`); if (next) next.disabled = false;
    } catch (err) { toast(err.message); }
    btn.innerHTML = old; btn.disabled = false;
  }
  async function mentorCheck(btn) {
    const ctx = JSON.parse($("#modal-body").dataset.mctx || "{}"); const c = byId[ctx.cid]; if (!c) return;
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span><span>El mentor está revisando…</span>`;
    try {
      const d = await mentorCall("/api/mentor/check", { case_id: ctx.cid, item: ctx.item, label: ctx.label, prompt: ctx.prompt, answer: mentorAnswer(c, ctx.item) });
      mentorSaveStatus(ctx.cid, ctx.item, d.status);
      const [cls, txt] = M_VERDICT[d.verdict] || ["", d.verdict || "—"];
      mentorOut(`<div class="m-card-h"><span class="pill ${cls}">${icon(d.verdict === "correcto" ? "check" : "alert")} ${esc(txt)}</span><span class="muted">Revisión de tu respuesta</span></div>
        ${(d.fields || []).length ? `<ul class="m-fields">${d.fields.map((f) => { const [ic, k, t] = M_FIELD[f.status] || ["alert", "", f.status]; return `<li class="${k}">${icon(ic)}<b>${esc(f.label)}</b><span>${esc(t)}</span></li>`; }).join("")}</ul>` : ""}
        ${d.mistake ? `<div class="notice">${icon("alert")}<span>${esc(d.mistake)}</span></div>` : ""}
        ${d.explicacion ? `<p class="m-why"><b>¿Por qué?</b> ${linkTerms(d.explicacion)}</p>` : ""}
        ${(d.que_revisar || []).length ? `<h5>${icon("target")} Qué revisar</h5>${list(d.que_revisar, "arrow")}` : ""}
        ${(d.evidencia || []).length ? `<h5>${icon("book")} Evidencia del caso</h5>${d.evidencia.map((e) => `<blockquote class="m-quote"><b>[${esc(e.id)}]</b> ${esc(e.cita)}</blockquote>`).join("")}` : ""}
        ${d.siguiente_paso ? `<div class="analogy">${icon("lightbulb")}<span><b>Siguiente paso:</b> ${esc(d.siguiente_paso)}</span></div>` : ""}
        ${d.verdict !== "correcto" ? mentorWhere(d.where) : ""}
        ${mentorChunks(d.evidence, "Fragmentos del expediente")}${mentorChunks(d.sources, "Fuentes de los marcos (RAG)")}
        ${!d.has_key ? `<p class="hint">Tu docente aún no ha cargado la clave de este ítem: la revisión la hizo la IA con el expediente.</p>` : ""}`);
      if (d.verdict === "correcto") toast("¡Correcto! Quedó registrado en el seguimiento de tu equipo.");
      if (currentCase && currentTab === "tutor") refreshMentorPanel();
    } catch (err) { toast(err.message); }
    btn.innerHTML = old; btn.disabled = false;
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
    return [["tier", "Clasificación Tier", ""], ...CALC_FIELDS.filter(([k]) => calcExpected(c)[k]).map(([k, l]) => ["calc." + k, l, ""]),
      ...c.data.incidents.map(([id, t, txt]) => ["inc." + id, `Incidente ${id} · ${t}`, txt]), ...c.questions.map((q, i) => ["q." + i, `Pregunta guía ${i + 1}`, q])];
  }
  function mentorPanelHtml(c) {
    const st = mentorCache(c.case_id), items = mentorItems(c);
    const ok = items.filter(([k]) => st[k]?.best === "correcto").length;
    const group = (title, pred) => `<div class="m-group"><h5>${title}</h5>${items.filter(([k]) => pred(k)).map(([k, l, p]) => { const s = st[k] || {}; const [cls] = M_VERDICT[s.best] || [""]; const txt = s.best || (s.hints ? "con pistas" : "sin revisar");
      return `<div class="m-row"><span class="m-dot ${M_DOT[s.best] || ""}"></span><span class="m-row-l">${esc(l)}</span><span class="pill ${cls}">${esc(txt)}</span>${s.hints ? `<small class="muted">${s.hints} pista(s)</small>` : ""}${mentorBtn(k, l, p, "Abrir")}</div>`; }).join("")}</div>`;
    return `<div class="m-prog"><b>${ok}/${items.length}</b><span>ítems resueltos</span><i><b style="width:${Math.round(ok / items.length * 100)}%"></b></i></div>
      <div class="m-groups">${group("Tier y cálculos", (k) => k === "tier" || k.startsWith("calc."))}${group("Incidentes (ITIL · COBIT · ISO)", (k) => k.startsWith("inc."))}${group("Preguntas guía", (k) => k.startsWith("q."))}</div>`;
  }
  async function refreshMentorPanel() {
    const c = currentCase, box = $("#mentor-panel"); if (!c || !box) return;
    box.innerHTML = mentorPanelHtml(c); hydrate(box);
    if (!apiBase() || !teamSession()) return;
    try {
      const r = await fetch(`${apiBase()}/api/mentor/status?case_id=${c.case_id}`, { headers: authHeaders() });
      if (!r.ok) return;
      const d = await r.json(); store.set("mentor:" + c.case_id, d.status || {});
      if ($("#mentor-panel") === box) { box.innerHTML = mentorPanelHtml(c); hydrate(box); }
      const note = $("#mentor-note"); if (note) note.innerHTML = d.key_loaded ? "" : `<span class="pill amber">El docente aún no ha cargado la clave de este caso: las revisiones las hará la IA con el expediente.</span>`;
    } catch { /* sin conexión: se muestra lo guardado */ }
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
    tour.finished = true; store.set("tour:done:" + tour.t.id, true);
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
  renderTeamBtn(); refreshTeam();
  $("#team-btn")?.addEventListener("click", openTeamModal);
})();
