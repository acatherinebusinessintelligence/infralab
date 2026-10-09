/* Matriz de decisión: criterios fijos con peso propuesto y trazable.
 * Cada peso sale de lo que el equipo ya respondió y de los datos visibles del caso, y muestra de dónde viene.
 * El equipo confirma o ajusta; si cambia un peso escribe una línea de razón. No usa la clave del docente. */
window.MATRIX = (() => {
  const CRITERIA = [
    ["disp", "Disponibilidad y continuidad"], ["cap", "Capacidad y rendimiento"], ["seg", "Seguridad y cumplimiento"],
    ["costo", "Costo (5 = más económico)"], ["viab", "Viabilidad (5 = más simple y rápido)"], ["alin", "Alineación con el negocio"],
  ];
  /* Señales y puntos. Cada criterio suma los puntos de las señales que se cumplen y el total se lleva a 100 %.
     [criterio, id, señal, puntos por cada una, tope de la señal (0 = sin tope)] — para ajustar el balance basta cambiar los números. */
  const SIGNALS = [
    ["disp", "base", "Peso base", 8, 0],
    ["disp", "gap", "Cada nivel de brecha entre la redundancia actual y la objetivo", 3, 0],
    ["disp", "uniq", "Cada componente que el equipo marcó como único", 3, 9],
    ["disp", "av", "La disponibilidad calculada está por debajo del objetivo del BMM", 3, 0],
    ["disp", "inc", "Cada incidente clasificado de disponibilidad o conectividad", 3, 9],
    ["disp", "oper", "Cada incidente clasificado de proveedor, backup, integración o cambios con minutos de caída", 2, 6],
    ["cap", "base", "Peso base", 8, 0],
    ["cap", "stor", "Almacenamiento a menos de 12 meses del 80 % o sobre el 75 % de uso", 5, 0],
    ["cap", "cpu", "Cada equipo con 85 % o más de CPU en picos", 3, 6],
    ["cap", "inc", "Cada incidente clasificado de capacidad o rendimiento", 3, 6],
    ["cap", "restr", "Cada restricción del caso que anuncia crecimiento o picos", 2, 4],
    ["seg", "base", "Peso base", 8, 0],
    ["seg", "sector", "Sector con exigencias regulatorias (fintech, banca, salud, gobierno, ciudad inteligente)", 6, 0],
    ["seg", "iso", "Cada incidente que el equipo clasificó en un control ISO/IEC 27001", 1, 4],
    ["seg", "inc", "Cada incidente clasificado de seguridad", 3, 6],
    ["seg", "restr", "Cada restricción del caso sobre seguridad o cumplimiento", 2, 4],
    ["costo", "base", "Peso base", 8, 0],
    ["costo", "restr", "Cada restricción del caso sobre presupuesto, inversión o sobredimensionamiento", 4, 8],
    ["costo", "inc", "Cada incidente clasificado de costos", 4, 8],
    ["costo", "bmm", "Una política, regla u objetivo del BMM habla de costo o presupuesto", 4, 0],
    ["viab", "base", "Peso base", 8, 0],
    ["viab", "restr", "Cada restricción que limita lo que se puede detener, reemplazar o migrar", 2, 8],
    ["viab", "inc", "Cada incidente clasificado de monitoreo", 3, 6],
    ["alin", "base", "Peso base (solo si el BMM tiene metas u objetivos; si no, el criterio queda en 0)", 6, 0],
    ["alin", "smart", "Cada objetivo del BMM con indicador, valor y plazo", 2, 8],
    ["alin", "meta", "Cada meta del BMM", 1, 3],
    ["alin", "inc", "Cada incidente clasificado de gobierno, o de cambios sin minutos de caída", 4, 12],
    ["alin", "restr", "Cada restricción del caso sobre prioridades del negocio, gobierno o resultados", 2, 6],
  ];
  const PT = {}; SIGNALS.forEach(([c, id, , pts, cap]) => { (PT[c] = PT[c] || {})[id] = { pts, cap }; });
  const LEVELS = ["sin", "parcial", "criticos", "tolerante"];
  const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const words = (t) => (norm(t).match(/[a-zñ]{3,}/g) || []).length;
  const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const REGULATED = /fintech|banca|financ|salud|gobierno|smart city/;
  const R_COST = /presupuesto|costo|inversi|sobredimension|compras|gasto/, R_VIAB = /no puede|no se pueden|no es viable|deten|reemplaz|migrar|inmediat|24\/7|mantenerse|mantener/,
    R_CAP = /crecimiento|picos|demanda/, R_ALIN = /prioriz|prioridad|beneficio|valor|resultados|direccion|gobierno|autonom|burocr|evidencia|experiencia|responsabilidades/, R_SEG = /seguridad|cumplimiento|regul|sensib|datos personales|auditor/;

  /* ctx: { c (caso), sector, tier, calc, inc, bmm, rows (hallazgos vigentes), st (estado de cada hallazgo) }
     Devuelve los seis criterios con su peso propuesto (suman 100) y el porqué de cada uno. */
  function propose(ctx) {
    const { c, tier = {}, inc = {}, bmm } = ctx, rows = (ctx.rows || []).filter((r) => (ctx.st?.[r.id] || {}).s !== "d");
    const lv = (x) => (window.REDUND ? window.REDUND.levelLabel(x) : x);
    const restr = (c.data.restrictions || []).concat(c.restrictions || []);
    const hit = (re) => restr.filter((r) => re.test(norm(r)));
    const cat = (...cs) => (c.data.incidents || []).filter((i) => cs.includes(i[4]) && inc[i[0]] && (inc[i[0]].itil || inc[i[0]].cobit || inc[i[0]].iso));
    const P = {}, W = {}; CRITERIA.forEach(([id]) => { P[id] = 0; W[id] = []; });
    // Suma n veces los puntos de la señal (hasta su tope) y anota el porqué.
    const add = (crit, sig, n, why) => { const s = PT[crit][sig], pts = s.cap ? Math.min(s.cap, s.pts * n) : s.pts * n; if (pts > 0) { P[crit] += pts; if (why) W[crit].push(why); } };

    // Disponibilidad y continuidad: brecha de redundancia y componentes únicos en servicios críticos (no el Tier)
    add("disp", "base", 1);
    const gap = LEVELS.indexOf(tier.objetivo) - LEVELS.indexOf(tier.actual);
    if (tier.actual && tier.objetivo && gap > 0 && rows.some((r) => r.id === "gap")) add("disp", "gap", gap, `Brecha de redundancia de ${pl(gap, "nivel", "niveles")}: «${lv(tier.actual)}» → «${lv(tier.objetivo)}»`);
    const uniq = rows.filter((r) => r.kind === "unico");
    if (uniq.length) add("disp", "uniq", uniq.length, `${pl(uniq.length, "componente único", "componentes únicos")} en tu inventario (${uniq.map((r) => r.text.split(" es único")[0]).join(", ")})`);
    if (rows.some((r) => r.id === "av")) add("disp", "av", 1, "Tu disponibilidad calculada está por debajo de tu objetivo del BMM");
    const iD = cat("Disponibilidad", "Conectividad"); if (iD.length) add("disp", "inc", iD.length, `${pl(iD.length, "incidente", "incidentes")} de disponibilidad o conectividad (${iD.map((i) => i[0]).join(", ")})`);

    // Incidentes de operación que afectan la continuidad; los cambios cuentan aquí solo si tuvieron minutos de caída (si no, van a alineación).
    const iO = [...cat("Proveedor", "Backup", "Integración"), ...cat("Cambios").filter((i) => i[3])]; if (iO.length) add("disp", "oper", iO.length, `${pl(iO.length, "incidente", "incidentes")} de proveedor, backup, integración o cambios con caída (${iO.map((i) => i[0]).sort().join(", ")})`);

    // Capacidad y rendimiento
    add("cap", "base", 1);
    if (rows.some((r) => r.id === "stor")) add("cap", "stor", 1, "El almacenamiento está cerca del 80 % de uso");
    const cpu = rows.filter((r) => /CPU en picos/.test(r.text)); if (cpu.length) add("cap", "cpu", cpu.length, `${pl(cpu.length, "equipo llega", "equipos llegan")} a 85 % o más de CPU en picos`);
    const iC = cat("Capacidad", "Rendimiento"); if (iC.length) add("cap", "inc", iC.length, `${pl(iC.length, "incidente", "incidentes")} de capacidad o rendimiento (${iC.map((i) => i[0]).join(", ")})`);
    const rC = hit(R_CAP); if (rC.length) add("cap", "restr", rC.length, `El caso anuncia crecimiento o picos: «${rC[0]}»`);

    // Seguridad y cumplimiento
    add("seg", "base", 1);
    if (REGULATED.test(norm(ctx.sector))) add("seg", "sector", 1, `Sector con exigencias regulatorias (${ctx.sector})`);
    const iso = Object.values(inc).filter((v) => v && v.iso).length; if (iso) add("seg", "iso", iso, `Clasificaste ${pl(iso, "incidente", "incidentes")} en controles ISO/IEC 27001`);
    const iS = cat("Seguridad"); if (iS.length) add("seg", "inc", iS.length, `${pl(iS.length, "incidente", "incidentes")} de seguridad (${iS.map((i) => i[0]).join(", ")})`);
    const rS = hit(R_SEG); if (rS.length) add("seg", "restr", rS.length, `Restricción del caso: «${rS[0]}»`);

    // Costo
    add("costo", "base", 1);
    const rK = hit(R_COST); if (rK.length) add("costo", "restr", rK.length, `Restricción del caso: «${rK[0]}»${rK.length > 1 ? ` y ${rK.length - 1} más` : ""}`);
    const iK = cat("Costos"); if (iK.length) add("costo", "inc", iK.length, `${pl(iK.length, "incidente", "incidentes")} de costos (${iK.map((i) => i[0]).join(", ")})`);
    const bText = bmm ? ["politicas", "reglas", "objetivos"].flatMap((k) => (bmm[k] || []).map((x) => x.t || "")) : [];
    const bK = bText.find((t) => /costo|presupuesto|gasto|opex|capex/.test(norm(t))); if (bK) add("costo", "bmm", 1, `Tu BMM lo pide: «${bK}»`);

    // Viabilidad
    add("viab", "base", 1);
    const rV = hit(R_VIAB); if (rV.length) add("viab", "restr", rV.length, `${pl(rV.length, "restricción limita", "restricciones limitan")} lo que se puede cambiar: «${rV[0]}»${rV.length > 1 ? ` y ${rV.length - 1} más` : ""}`);

    const iM = cat("Monitoreo"); if (iM.length) add("viab", "inc", iM.length, `${pl(iM.length, "incidente", "incidentes")} de monitoreo (${iM.map((i) => i[0]).join(", ")}): sin detección, operar la solución es más difícil`);

    // Alineación con el negocio: se activa con el BMM, sin bloquear
    const obj = (bmm && bmm.objetivos) || [], metas = (bmm && bmm.metas) || [];
    const smart = obj.filter((o) => o.m && o.v && o.p).length;
    const alinOn = obj.length + metas.length > 0;
    if (alinOn) { add("alin", "base", 1); if (smart) add("alin", "smart", smart, `Tu BMM tiene ${pl(smart, "objetivo", "objetivos")} con indicador, valor y plazo`); if (metas.length) add("alin", "meta", metas.length, `${pl(metas.length, "meta", "metas")} en tu BMM`);
      const iG = [...cat("Gobierno"), ...cat("Cambios").filter((i) => !i[3])]; if (iG.length) add("alin", "inc", iG.length, `${pl(iG.length, "incidente", "incidentes")} de gobierno o de cambios sin caída (${iG.map((i) => i[0]).sort().join(", ")})`);
      const rA = hit(R_ALIN); if (rA.length) add("alin", "restr", rA.length, `Restricción del caso: «${rA[0]}»${rA.length > 1 ? ` y ${rA.length - 1} más` : ""}`); }

    // A 100 %, en enteros (resto mayor)
    const total = Object.values(P).reduce((a, b) => a + b, 0) || 1;
    const raw = CRITERIA.map(([id]) => ({ id, x: P[id] / total * 100 }));
    const out = Object.fromEntries(raw.map((r) => [r.id, Math.floor(r.x)]));
    raw.sort((a, b) => (b.x - Math.floor(b.x)) - (a.x - Math.floor(a.x))).slice(0, 100 - Object.values(out).reduce((a, b) => a + b, 0)).forEach((r) => { out[r.id] += 1; });
    return CRITERIA.map(([id, n]) => ({ id, n, wp: out[id], pts: P[id], active: id !== "alin" || alinOn,
      why: W[id].length ? W[id] : [id === "alin" && !alinOn ? "Se activa cuando tu BMM tenga metas u objetivos" : "Sin señales en tu trabajo: queda con el peso base"] }));
  }

  /* Preguntas de coherencia: cuando un peso contradice lo que el equipo respondió. Determinísticas. */
  function coherence(ctx, crit) {
    const w = Object.fromEntries(crit.map((k) => [k.id, +k.w || 0])), out = [], { c, tier = {} } = ctx;
    const lv = (x) => (window.REDUND ? window.REDUND.levelLabel(x) : x);
    const rows = (ctx.rows || []).filter((r) => (ctx.st?.[r.id] || {}).s !== "d"), crits = rows.filter((r) => (ctx.st?.[r.id] || {}).crit);
    const restr = (c.data.restrictions || []).concat(c.restrictions || []).map(norm);
    const max = Math.max(...Object.values(w));
    if (LEVELS.indexOf(tier.objetivo) >= 2 && LEVELS.indexOf(tier.objetivo) > LEVELS.indexOf(tier.actual) && w.disp < 15 && w.costo >= 30)
      out.push({ id: "obj-disp", text: `Tu objetivo es «${lv(tier.objetivo)}», pero disponibilidad pesa ${w.disp} % y costo ${w.costo} %. ¿Qué cambió?` });
    const cu = crits.filter((r) => r.kind === "unico").length;
    if (cu >= 2 && w.disp < max) out.push({ id: "crit-disp", text: `${cu} de tus hallazgos críticos son componentes únicos, pero disponibilidad no es tu criterio de mayor peso (${w.disp} %). ¿Por qué?` });
    if (crits.some((r) => r.id === "stor" || /CPU en picos/.test(r.text)) && w.cap <= 10)
      out.push({ id: "crit-cap", text: `Marcaste como crítico un hallazgo de capacidad, pero capacidad y rendimiento pesa ${w.cap} %. ¿Qué lo explica?` });
    if (REGULATED.test(norm(ctx.sector)) && w.seg <= 8) out.push({ id: "reg-seg", text: `El sector del caso (${ctx.sector}) tiene exigencias regulatorias, pero seguridad y cumplimiento pesa ${w.seg} %. ¿Qué lo justifica?` });
    if (!restr.some((r) => R_COST.test(r)) && w.costo >= 35) out.push({ id: "costo-sin", text: `Ninguna restricción del caso habla de presupuesto, pero costo pesa ${w.costo} %. ¿De dónde sale esa prioridad?` });
    if (crits.some((r) => r.layer === "inst") && w.disp < 15) out.push({ id: "inst-disp", text: `Marcaste como crítica la información de la instalación que falta, pero disponibilidad pesa ${w.disp} %. ¿Cómo la vas a atender?` });
    return out;
  }

  // Matriz anterior (criterios libres) → forma nueva, sin perder nada: los puntajes se trasladan donde hay equivalencia.
  function migrate(old) {
    const oc = (old && old.criteria) || [], idx = (re) => oc.map((k, i) => (re.test(norm(k.n)) ? i : -1)).filter((i) => i >= 0);
    const map = { disp: idx(/disponib|riesgo/), costo: idx(/costo/), viab: idx(/complej|tiempo|restricc|viab/), cap: idx(/capacid|rendim/), seg: idx(/segurid|cumplimiento norm/), alin: idx(/negocio|alinea/) };
    const alts = ((old && old.alts) || []).map((a) => ({ ...a, ok: false, s: CRITERIA.map(([id]) => { const v = map[id].map((i) => +a.s?.[i]).filter((x) => x >= 1 && x <= 5); return v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : 3; }) }));
    return { alts, old: oc.length || alts.length ? { criteria: oc, alts: (old.alts || []).map((a) => ({ name: a.name, s: a.s, j: a.j })) } : null };
  }

  return { CRITERIA, SIGNALS, propose, coherence, migrate, words };
})();
