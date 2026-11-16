/* Registro de hallazgos: la base de la matriz de decisión.
 * Se arma solo con lo que el equipo ya respondió (redundancia, cálculos, incidentes, BMM) y con los datos visibles del caso.
 * No usa la clave del docente: si el equipo respondió algo mal, el hallazgo sale mal y lo corrige el Mentor en su ítem. */
window.FINDINGS = (() => {
  const LAYERS = { inst: "Instalación", arq: "Arquitectura TI", oper: "Operación y terceros" };
  // Capa de un incidente según su categoría (la del expediente).
  const INC_LAYER = { Capacidad: "arq", Disponibilidad: "arq", Rendimiento: "arq", Conectividad: "arq", "Integración": "arq",
    Backup: "oper", Proveedor: "oper", Monitoreo: "oper", Cambios: "oper", Seguridad: "oper", Costos: "oper", Gobierno: "oper" };
  const CPU_PEAK = 85, STORAGE_USED = 75, STORAGE_TARGET = 0.8, STORAGE_MONTHS = 12;
  const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const key = (t) => norm(String(t || "").split("(")[0]).replace(/[^a-z0-9]/g, "");
  const num = (t) => { const m = String(t ?? "").replace(/\.(?=\d{3}\b)/g, "").match(/-?\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(",", ".")) : null; };
  const f = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: d });
  const mins = (m) => (m == null ? "" : `${m} min`);

  // Objetivo del BMM del equipo para un indicador (el primero que lo nombre y traiga un valor numérico).
  function target(bmm, re) {
    for (const o of (bmm && bmm.objetivos) || []) {
      if (re.test(norm(`${o.m || ""} ${o.t || ""}`))) { const v = num(o.v); if (v != null) return { v, text: String(o.v), obj: o.t || "" }; }
    }
    return null;
  }

  /* work: { tier (forma nueva), calc {av, mttr, months…}, inc {A: {itil, cobit, iso}}, bmm, bad: [ítems que el Mentor marcó incorrectos], lab: nº de servicios }
     Devuelve { rows, notices, pieces, open }. */
  function build(c, services, work) {
    const tier = work.tier || {}, calc = work.calc || {}, inc = work.inc || {}, bmm = work.bmm || null, bad = new Set(work.bad || []), links = work.links || {};
    const comps = (c.nodes || []).filter((n) => n[2] === "c").map((n) => ({ id: n[0], name: n[1], short: String(n[1]).split("(")[0].trim(), k: key(n[1]) }));
    const rows = [], notices = [];
    const classified = (id) => { const v = inc[id]; return !!(v && (v.itil || v.cobit || v.iso)); };
    const incs = (c.data.incidents || []).map((i) => ({ id: i[0], title: i[1], text: i[2], min: i[3], cat: i[4] || "", used: false, ok: classified(i[0]) }));
    const namesIn = (i) => comps.filter((x) => x.k.length >= 4 && key(i.title + " " + i.text).includes(x.k));
    const effect = (i) => `causó el incidente ${i.id} (${[mins(i.min), `«${i.title}»`].filter(Boolean).join(" · ")})`;
    const incOrigin = (i) => `Incidente ${i.id}: lo clasificaste en ${inc[i.id].itil || inc[i.id].cobit || inc[i.id].iso}`;

    // ¿Qué servicios dependen de cada componente? (aristas «origen depende de destino»)
    const down = {}; (c.edges || []).forEach(([a, b]) => { (down[a] = down[a] || []).push(b); });
    const reach = (from) => { const seen = new Set(), st = [from]; while (st.length) { const x = st.pop(); (down[x] || []).forEach((y) => { if (!seen.has(y)) { seen.add(y); st.push(y); } }); } return seen; };
    const crit = (label) => { const r = (services || []).find((s) => norm(s[0]).includes(norm(label).split("/")[0].trim()) || norm(label).includes(norm(s[0]))); return r ? r[3] : ""; };
    const sustains = (id) => (c.nodes || []).filter((n) => n[2] === "s" && reach(n[0]).has(id)).map((n) => ({ name: n[1], crit: crit(n[1]) }));

    // CPU en picos por componente (bloques de métricas del caso)
    const cpu = {}; const blocks = [];
    (c.data.blocks || []).forEach((b, bi) => {
      const r = (b.rows || []).find((x) => x[3] === "cpuPeak"); if (!r || !(r[1] >= CPU_PEAK)) return;
      const who = comps.filter((x) => x.k.length >= 4 && key(b.title).includes(x.k));
      who.forEach((x) => { cpu[x.id] = r[1]; }); blocks.push({ bi, title: b.title, v: r[1], who, used: false });
    });

    // 1. Componentes únicos (parte A), con su causa y su efecto en una sola fila
    const ev = tier.ev || {};
    comps.filter((x) => ev[x.id] === "u").forEach((x) => {
      const mine = incs.filter((i) => i.ok && !i.used && namesIn(i).some((y) => y.id === x.id));
      mine.forEach((i) => { i.used = true; });
      const b = blocks.find((k) => k.who.length === 1 && k.who[0].id === x.id); if (b) b.used = true;
      const sv = sustains(x.id).filter((s) => /cr[ií]tica|alta/i.test(s.crit));
      rows.push({ id: "u." + x.id, comp: [x.id], incs: mine.map((i) => i.id), manual: [], layer: "arq", kind: "unico",
        text: `${x.short} es único${b ? ` y llega a ${f(b.v, 0)} % de CPU en picos` : ""}`, effects: mine.map(effect),
        sub: sv.length ? "Sostiene: " + sv.slice(0, 3).map((s) => `${s.name} (${s.crit.toLowerCase()})`).join(", ") : "",
        origin: ["Parte A: lo marcaste «Único»", b ? "Métricas del caso" : "", ...mine.map(incOrigin)].filter(Boolean), tab: "inventario" });
    });

    // 2. Brecha de redundancia
    const LV = ["sin", "parcial", "criticos", "tolerante"], lab = (window.REDUND && ((x) => window.REDUND.levelLabel(x))) || ((x) => x);
    if (tier.actual && tier.objetivo && LV.indexOf(tier.objetivo) > LV.indexOf(tier.actual)) {
      rows.push({ id: "gap", layer: "arq", kind: "brecha", text: `Brecha de redundancia: estás en «${lab(tier.actual)}» y tu objetivo es «${lab(tier.objetivo)}»`, effects: [], sub: "",
        origin: ["Parte A: tus niveles actual y objetivo"], tab: "inventario" });
    }

    // 3. Saturación de CPU en picos que no quedó unida a un componente único
    blocks.filter((b) => !b.used).forEach((b) => {
      const mine = incs.filter((i) => i.ok && !i.used && namesIn(i).some((y) => b.who.some((w) => w.id === y.id)));
      mine.forEach((i) => { i.used = true; });
      rows.push({ id: "cpu." + b.bi, comp: b.who.map((w) => w.id), incs: mine.map((i) => i.id), manual: [], layer: "arq", kind: "capacidad", text: `${b.title} llega a ${f(b.v, 0)} % de CPU en picos`, effects: mine.map(effect), sub: "",
        origin: ["Métricas del caso", ...mine.map(incOrigin)], tab: "metricas" });
    });

    // 4. Métricas contra la meta del propio equipo (su BMM). Sin meta no hay hallazgo: no se inventa.
    const metric = (id, label, unit, re, worse) => {
      const v = calc[id]; if (typeof v !== "number") return;
      if (bad.has("calc." + id)) return void notices.push({ text: `Hay un hallazgo que depende de tu ${label}, que el Mentor marcó como incorrecto: corrígelo y aparecerá aquí.`, tab: "metricas" });
      const t = target(bmm, re);
      if (!t) return void notices.push({ text: `Tu cálculo de ${label.toLowerCase() === "mttr" ? "MTTR" : label.toLowerCase()} es ${f(v, 2)} ${unit}. Sin meta definida: escríbela en tu BMM como objetivo para saber si es un hallazgo.`, tab: "bmm" });
      if (worse(v, t.v)) rows.push({ id, layer: "arq", kind: "metrica", text: `${label} de ${c.data.service.name}: tu cálculo es ${f(v, 2)} ${unit} y tu objetivo es ${t.text}`, effects: [], sub: "",
        origin: ["Tu cálculo en Métricas", "Tu objetivo del BMM"], tab: "metricas" });
    };
    metric("av", "Disponibilidad", "%", /disponibilidad/, (v, t) => v < t);
    metric("mttr", "MTTR", "h", /mttr|recuperacion/, (v, t) => v > t);

    // 5. Almacenamiento: actuar antes del 80 % de uso
    const st = c.data.storage;
    if (st && st.total) {
      const pct = st.used / st.total * 100, m100 = calc.months;
      if (bad.has("calc.months")) notices.push({ text: "Hay un hallazgo que depende de tus meses de almacenamiento, que el Mentor marcó como incorrecto: corrígelo y aparecerá aquí.", tab: "metricas" });
      else if (typeof m100 === "number" && st.growth) {
        const m80 = m100 - (1 - STORAGE_TARGET) * st.total / st.growth;
        if (m80 < STORAGE_MONTHS || pct > STORAGE_USED) rows.push({ id: "stor", layer: "arq", kind: "almacenamiento",
          text: m80 <= 0 ? `El almacenamiento ya pasó el 80 % de uso y se llena en ${f(m100)} meses (hoy está al ${f(pct)} %)`
            : `El almacenamiento llega al 80 % en ${f(m80)} meses y al 100 % en ${f(m100)} meses (hoy está al ${f(pct)} %)`,
          effects: [], sub: "El criterio del curso es actuar antes del 80 % de uso.", origin: ["Tu cálculo de meses en Métricas", "Inventario del caso"], tab: "metricas" });
      } else if (pct > STORAGE_USED) {
        rows.push({ id: "stor", layer: "arq", kind: "almacenamiento", text: `El almacenamiento está al ${f(pct)} % de uso`, effects: [], sub: "Calcula los meses hasta llenarlo en Métricas para ver cuánto margen queda.",
          origin: ["Inventario del caso"], tab: "metricas" });
      }
    }

    // 5b. Crecimiento que anuncia el caso (dato del caso, no una restricción): algunos patrones chocan con él
    const gFact = (c.data.facts || []).find((x) => /crecimiento/.test(norm(x[0]))), gRestr = (c.data.restrictions || []).find((x) => /crecimiento/.test(norm(x)));
    if (gFact || gRestr) rows.push({ id: "grow", layer: "arq", kind: "crecimiento", text: gFact ? `${gFact[0]}: ${gFact[1]}` : gRestr, effects: [], sub: "La carga va a aumentar: lo que hoy alcanza puede no alcanzar.",
      origin: ["Datos del caso"], tab: "expediente" });

    // 6. Incidentes clasificados cuyo relato no nombra un componente: la cadena la arma el equipo («¿qué lo causó?»)
    const CAUSE_LAYER = { prov: "oper", proc: "oper", inst: "inst" }, CAUSE_LABEL = { prov: "un proveedor externo", proc: "un proceso u operación", inst: "la instalación" };
    const tail = [];
    incs.filter((i) => i.ok && !i.used).forEach((i) => {
      const cause = links[i.id] || "", cid = cause.startsWith("c:") ? cause.slice(2) : "", x = cid && comps.find((k) => k.id === cid);
      if (x) {  // se une al hallazgo de ese componente, igual que las cadenas automáticas
        let r = rows.find((k) => (k.comp || []).includes(x.id));
        if (!r) { r = { id: "c." + x.id, comp: [x.id], incs: [], manual: [], layer: "arq", kind: "componente", text: x.short, effects: [], sub: "", origin: [], tab: "inventario" }; rows.push(r); }
        r.effects.push(effect(i)); r.incs.push(i.id); r.manual.push(i.id);
        r.origin.push(`Incidente ${i.id}: tu equipo lo relacionó con ${x.short}`, incOrigin(i));
        return;
      }
      tail.push({ id: "inc." + i.id, incs: [i.id], manual: [], ask: i.id, cause, layer: CAUSE_LAYER[cause] || INC_LAYER[i.cat] || "oper", kind: "incidente",
        text: `Incidente ${i.id}: ${i.title}${i.min != null ? ` (${mins(i.min)})` : ""}${CAUSE_LABEL[cause] ? ` — lo causó ${CAUSE_LABEL[cause]}` : ""}`, effects: [], sub: i.text,
        origin: [`Lo clasificaste en ${inc[i.id].itil || inc[i.id].cobit || inc[i.id].iso}`, ...(CAUSE_LABEL[cause] ? ["La causa la eligió tu equipo"] : [])], tab: "incidentes" });
    });
    rows.push(...tail);

    // 7. Debilidades y amenazas del DOFA: la capa la elige el equipo
    [["debilidades", "Debilidad"], ["amenazas", "Amenaza"]].forEach(([k, label]) => ((bmm && bmm[k]) || []).forEach((x, i) => {
      const t = String((x && x.t) || "").trim(); if (!t) return;
      rows.push({ id: `dofa.${k[0]}.${x.id || i}`, layer: null, kind: "dofa", text: `${label}: «${t}»`, effects: [], sub: "", origin: ["Tu DOFA en el BMM"], tab: "bmm" });
    }));

    // 8. Información de la instalación faltante (parte B)
    const info = ((tier.b && tier.b.info) || []), RD = window.REDUND;
    if (info.length) rows.push({ id: "inst", layer: "inst", kind: "instalacion",
      text: "Información de la instalación faltante: " + info.map((id) => { const l = ((RD && RD.info.find((x) => x[0] === id)) || [, id])[1]; return /^(UPS|SLA)/.test(l) ? l : l[0].toLowerCase() + l.slice(1); }).join("; "), effects: [],
      sub: "Sin estos datos no se puede clasificar el Tier del sitio.", origin: ["Parte B: lo que marcaste"], tab: "inventario" });

    // Piezas en las que se apoya la decisión
    const calcN = ["av", "mttr", "mtbf", "months"].filter((k) => typeof calc[k] === "number").length, incN = incs.filter((i) => i.ok).length;
    const pieces = [
      { key: "a", label: "Redundancia de la arquitectura TI (parte A)", ok: !!(tier.actual && tier.objetivo && Object.keys(ev).length >= 2), tab: "inventario", required: true },
      { key: "calc", label: "Cálculos", ok: calcN >= 2, tab: "metricas", required: true, detail: `${calcN} con resultado` },
      { key: "inc", label: "Incidentes clasificados", ok: incs.length > 0 && incN >= Math.ceil(incs.length / 2), tab: "incidentes", required: true, detail: `${incN} de ${incs.length}` },
      { key: "b", label: "Tier de la instalación (parte B)", ok: info.length >= 3, tab: "inventario", required: false },
      { key: "bmm", label: "BMM (DOFA y objetivos)", ok: !!(bmm && ((bmm.objetivos || []).length || (bmm.debilidades || []).length)), tab: "bmm", required: false },
      { key: "lab", label: "Laboratorio", ok: (work.lab || 0) >= 1, tab: "lab", required: false },
    ];
    const causes = [...comps.map((x) => ["c:" + x.id, x.short]), ["prov", "Proveedor externo"], ["proc", "Proceso u operación"], ["inst", "Instalación"]];
    return { rows, notices, pieces, causes, open: pieces.filter((p) => p.required).every((p) => p.ok) };
  }

  return { build, LAYERS, INC_LAYER };
})();
