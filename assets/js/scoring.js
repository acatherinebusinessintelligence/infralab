/* Puntaje propuesto de una alternativa (1 a 3 patrones del catálogo) con su evidencia.
 * Cruza la tabla «qué resuelve cada patrón» (validada por el docente) con el registro de hallazgos del equipo.
 * Es una propuesta: el equipo la confirma o la ajusta. No usa la clave del docente. */
window.SCORING = (() => {
  const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const LAYERS = { inst: "instalación", arq: "arquitectura TI", oper: "operación y terceros" };
  const TIME = { corto: 1, medio: 3, largo: 5 };
  // Restricciones del caso que un patrón puede violar (se reconocen por su redacción). Advertencia roja.
  const VIOL = {
    presupuesto: [/presupuesto|inversi|compras|comprometido|ociosas/, "Presupuesto limitado"],
    sobredim: [/sobredimension|ociosas/, "Evitar sobredimensionar"],
    sin_detener: [/deten|24\/7|mantenerse operativ|debe mantenerse|operacion.*mantener/, "No detener la operación"],
    sin_reemplazo: [/reemplaz|reescrib|migrar|migrarse|inmediat|aprovechar(se)? (la infraestructura|lo que ya)/, "No reemplazar ni migrar de inmediato"],  // «aprovechar servicios administrados» no es una prohibición
    costo_nube: [/costos variables/, "Costos variables de nube"],
  };
  // Hallazgos del equipo con los que un patrón puede chocar. Advertencia naranja.
  const CONFLICT = { crecimiento: "Crecimiento proyectado", almacenamiento: "Almacenamiento que se llena", capacidad: "Equipos saturados en picos", instalacion: "Información de la instalación faltante" };
  // Función de cada componente del inventario. Un patrón solo elimina un punto único si aplica a su función.
  const FUNCTIONS = { app: "Aplicación sin estado", db: "Base de datos", auth: "Autenticación", pay: "Núcleo transaccional o sistema central", net: "Red local, firewall o balanceo",
    enlace: "Enlace (WAN, VPN, Internet, enlace de sede o tienda)", stor: "Almacenamiento", integ: "Integración con terceros", otro: "Otra" };
  const FN_TYPE = { db: "db", auth: "auth", directory: "auth", lb: "net", firewall: "net", wan: "enlace", vpn: "enlace", lan: "net", iotgw: "net", edge: "net", storage: "stor", backup: "stor", external: "integ", containers: "app" };
  const skey = (t) => norm(String(t).split("(")[0]).replace(/[^a-z0-9]/g, "");
  const same = (a, b) => !!a && !!b && (a === b || a.includes(b) || b.includes(a));
  // Componentes con función: los del diagrama y, además, los servidores del inventario que el diagrama no dibuja (id «s:NOMBRE», el mismo del laboratorio).
  function components(c) {
    const nodes = (c.nodes || []).filter((n) => n[2] === "c");
    const extra = ((c.data || {}).servers || []).filter((s) => !nodes.some((n) => same(skey(n[1]), skey(s[0]))));
    return [...nodes.map((n) => [n[0], String(n[1])]), ...extra.map((s) => ["s:" + s[0], `${s[0]} — ${s[1] || ""}`])];
  }
  function byText(t) {
    if (/base de datos|^db|\bbd\b/.test(t)) return "db";
    if (/autentic|directorio|\bad\b|^auth/.test(t)) return "auth";
    if (/archivo|file|nas\b|almacen|backup|respaldo/.test(t)) return "stor";
    if (/\bapi\b|portal|\bweb\b|report/.test(t)) return "app";
    if (/pago|pay|transacc|checkout|core|erp|historia clinica|hce|wms|tms|mes\b|pos\b|pbx|telefon|factur|inventario|pedido|tribut|matricul|academic|laboratorio|imagen|legad/.test(t)) return "pay";
    return "app";
  }
  // Borrador de la función a partir del tipo del componente y, en los servidores, de su nombre y de lo que hace.
  // Ajustes del borrador que definió la docente para servidores cuyo nombre no basta para deducir la función.
  const FN_DRAFT = { C05: { "s:HIST-SRV01": "db", "s:IOT-SRV01": "pay" }, C07: { "s:API-SRV01": "integ" }, C08: { "s:REC-SRV01": "pay", "s:CRM-SRV01": "pay" }, C15: { "s:IOT-SRV01": "pay", "s:VIDEO-SRV01": "pay" } };
  function fnOf(c, id, saved) {
    if (saved && saved[id]) return saved[id];
    if ((FN_DRAFT[c.case_id] || {})[id]) return FN_DRAFT[c.case_id][id];
    if (String(id).startsWith("s:")) { const s = ((c.data || {}).servers || []).find((x) => x[0] === String(id).slice(2)); return s ? byText(norm(`${s[0]} ${s[1] || ""}`)) : "otro"; }
    const n = (c.nodes || []).find((x) => x[0] === id); if (!n) return "otro";
    if (FN_TYPE[n[3]]) return FN_TYPE[n[3]];
    if (n[3] !== "server") return "otro";
    const key = norm(String(n[1]).split("(")[0]).replace(/[^a-z0-9]/g, "");
    const srv = (c.data.servers || []).find((x) => { const k = norm(x[0]).replace(/[^a-z0-9]/g, ""); return k && (k === key || key.includes(k) || k.includes(key)); });
    return byText(norm(`${n[1]} ${srv ? srv[1] : ""}`));
  }
  const CONF_GROUP = { crecimiento: "cap", almacenamiento: "cap", capacidad: "cap", instalacion: "inst" };  // tema de cada hallazgo con el que se puede chocar
  /* Criterio en el que cuenta cada categoría de incidente. Ninguna queda sin criterio.
     «Cambios» va a continuidad si el incidente tuvo minutos de caída y, si no, a alineación (ver groupOf). */
  const GROUP = { Disponibilidad: "disp", Conectividad: "disp", Proveedor: "disp", Backup: "disp", "Integración": "disp", Capacidad: "cap", Rendimiento: "cap", Seguridad: "seg",
    Gobierno: "alin", Costos: "costo", Monitoreo: "viab", Cambios: "disp" };
  const groupOf = (cat, mins) => (cat === "Cambios" ? (mins ? "disp" : "alin") : GROUP[cat] || "disp");
  const OPER_HALF = ["Proveedor", "Cambios", "Backup"];  // incidentes de operación: en continuidad cuentan la mitad del valor de un componente único
  const INC_ARQ = ["Capacidad", "Disponibilidad", "Rendimiento", "Conectividad", "Integración"];  // categorías cuya causa habitual está en la arquitectura; las demás son de operación
  const STOR_RE = /almacen|\bnas\b|disco|storage|espacio en/;  // incidentes de almacenamiento: los atiende un patrón que «atiende el almacenamiento»
  const OBJ = [[/disponib|mtbf|rto|rpo|caida/, ["Disponibilidad"]], [/mttr|recuperacion/, ["Disponibilidad", "Monitoreo", "Cambios"]], [/capacidad|cpu|latencia|almacenamiento|ocupacion/, ["Capacidad", "Rendimiento"]],
    [/mfa|cuentas|vulnerab|parche|acceso/, ["Seguridad"]], [/backup|restaur|respaldo/, ["Backup"]], [/cambio/, ["Cambios"]], [/sla|proveedor/, ["Proveedor"]], [/incidentes|mttd|monitoreo|deteccion/, ["Monitoreo"]], [/costo/, ["Costos"]]];
  const dec = (x) => Math.round(x * 10) / 10;
  const sc = (r) => dec(1 + 4 * r);   // de 1,0 a 5,0 según la proporción atendida, sin redondear a enteros
  const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const join = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(", ") + " y " + xs[xs.length - 1] : xs[0] || "");

  // Varios patrones: lo que resuelven se une sin repetir; costo, complejidad y tiempo toman el del más exigente.
  function combine(list) {
    const u = (k) => [...new Set(list.flatMap((p) => p[k] || []))];
    return { fn: u("fn"), inc: u("inc"), layers: u("layers"), viol: u("viol"), stor: list.some((p) => p.stor), inst: list.some((p) => (p.layers || []).includes("inst")),
      conf: list.flatMap((p) => (p.conf || []).map((k) => ({ k, why: p.conf_why || "", name: p.name || "" }))),
      cost: Math.max(...list.map((p) => +p.cost || 1)), complexity: Math.max(...list.map((p) => +p.complexity || 1)), time: Math.max(...list.map((p) => TIME[norm(p.time)] || 3)),
      reviewed: list.length > 0 && list.every((p) => p.reviewed) };
  }

  /* ctx: { c, bmm, rows (hallazgos vigentes), st (estado), regulated, fn (funciones revisadas del caso) }  ·  solves: tabla por id de patrón  ·  ids: patrones de la alternativa
     Devuelve { s: {criterio: 1,0..5,0}, ev: {criterio: texto}, resumen, rojas, naranjas, validado, criticos: {total, cubiertos, sin: [{id, text}]} }.
     Reglas: (1) un criterio solo pasa de 3 si la alternativa atiende un hallazgo del equipo en ese criterio;
             (2) un patrón que no ataca la capa de arquitectura atiende a medias los hallazgos de arquitectura (los de operación, completos);
             (3) un patrón que choca con un hallazgo atiende a medias los hallazgos de ese tema. */
  function score(ids, solves, ctx) {
    const pats = ids.map((id) => solves[id]).filter(Boolean); if (!pats.length) return null;
    const S = combine(pats), c = ctx.c;
    const rows = (ctx.rows || []).filter((r) => (ctx.st?.[r.id] || {}).s !== "d");
    const name = Object.fromEntries((c.nodes || []).map((n) => [n[0], String(n[1]).split("(")[0].trim()]));
    const incOf = Object.fromEntries((c.data.incidents || []).map((i) => [i[0], i]));
    const layerOf = (r) => (ctx.st?.[r.id] || {}).layer || r.layer;
    const isStor = (i) => !!i && ["Capacidad", "Rendimiento"].includes(i[4]) && STOR_RE.test(norm(`${i[1]} ${i[2]}`));
    // Cada hallazgo se parte en «ítems» por criterio; cada ítem queda cubierto o no por la alternativa (T = uno o varios patrones combinados).
    function build(T) {
      const items = [];
      const push = (g, label, ok, row, w = 1, lay) => items.push({ g, label, ok: !!ok, row, w, lay: lay || layerOf(row) || "arq" });
      const elim = (id) => T.fn.includes("todas") || T.fn.includes(fnOf(c, id, ctx.fn));
      const anyUniq = () => rows.some((x) => x.kind === "unico" && (x.comp || []).some(elim));
      const catOk = (id) => { const i = incOf[id] || []; return T.inc.includes(i[4]) || (isStor(i) && T.stor); };
      rows.forEach((r) => {
        const compOk = (r.comp || []).some(elim);
        if (r.kind === "unico") push("disp", (r.comp || []).map((id) => name[id]).join(", ") + " único", compOk, r);
        if (r.kind === "capacidad") push("cap", r.text.split(" llega")[0] + " saturado en picos", T.inc.includes("Capacidad") || T.inc.includes("Rendimiento"), r);
        if (r.kind === "almacenamiento") push("cap", "almacenamiento", T.stor, r);
        if (r.kind === "brecha") push("disp", "brecha de redundancia", anyUniq(), r);
        if (r.id === "av") push("disp", "disponibilidad bajo la meta", T.inc.includes("Disponibilidad") || anyUniq(), r);
        if (r.id === "mttr") push("disp", "MTTR sobre la meta", ["Monitoreo", "Cambios", "Disponibilidad"].some((k) => T.inc.includes(k)), r, 0.5, "oper");
        if (r.kind === "instalacion") push("inst", "información de la instalación", T.inst, r, 1, "inst");
        // Un incidente unido a un componente se evita si se elimina ese punto único; salvo los de disponibilidad o conectividad, también si un patrón atiende su categoría.
        (r.incs || []).forEach((id) => { const i = incOf[id] || [], k = i[4] || "", g = groupOf(k, i[3]), half = g === "disp" && OPER_HALF.includes(k), chained = r.kind === "unico" || r.kind === "componente";
          const ok = chained ? compOk || (!["Disponibilidad", "Conectividad"].includes(k) && catOk(id)) : catOk(id);
          push(g, `incidente ${id}${["Disponibilidad", "Conectividad", "Capacidad", "Rendimiento"].includes(k) ? "" : ` (${k.toLowerCase()})`}`, ok, r, half ? 0.5 : 1, r.kind === "incidente" ? layerOf(r) : INC_ARQ.includes(k) ? "arq" : "oper"); });
      });
      return items;
    }
    const items = build(S), key = (i) => i.row.id + "|" + i.label;
    // Advertencias: rojas por restricciones del caso, naranjas por hallazgos del equipo. Cada una baja un punto de viabilidad.
    const restr = (c.data.restrictions || []).concat(c.restrictions || []);
    const rojas = [...new Set(S.viol)].map((v) => { const hit = VIOL[v] && restr.find((r) => VIOL[v][0].test(norm(r)) && !/^crecimiento/.test(norm(r))); return hit ? { id: "r:" + v, text: `Choca con una restricción del caso: «${hit}»` } : null; }).filter(Boolean)
      .filter((x, i, a) => a.findIndex((y) => y.text === x.text) === i);   // una misma restricción cuenta una sola vez, aunque la reconozcan dos reglas
    const naranjas = S.conf.map((x) => { const r = rows.find((k) => k.kind === x.k); return r ? { id: "h:" + x.k, k: x.k, row: r, text: `Choca con tu hallazgo: ${r.text.charAt(0).toLowerCase() + r.text.slice(1)}${x.why ? `; ${x.why}` : ""}` } : null; })
      .filter((x, i, a) => x && a.findIndex((y) => y && y.id === x.id) === i);
    // ¿Completo o a medias? Un ítem queda atendido por completo si lo cubre al menos un patrón que no choca con su tema y que,
    // si el hallazgo es de arquitectura, ataca la capa de arquitectura. Si solo lo cubren patrones de operación o que chocan, queda a medias.
    const halfG = new Set(naranjas.map((w) => CONF_GROUP[w.k]).filter(Boolean));
    const solo = pats.map((p) => ({ p, ok: new Set(build(combine([p])).filter((i) => i.ok).map(key)) }));
    const clash = (p, g) => (p.conf || []).some((k) => CONF_GROUP[k] === g && rows.some((r) => r.kind === k));
    const noArq = (p) => !(p.layers || []).includes("arq");
    items.forEach((i) => { const who = solo.filter((x) => x.ok.has(key(i))).map((x) => x.p);
      i.why = !i.ok || !who.length || who.some((p) => !clash(p, i.g) && !(noArq(p) && i.lay === "arq")) ? "" : who.every((p) => clash(p, i.g)) ? "choca" : "oper";
      i.h = i.why ? 0.5 : 1; });
    const of = (g) => items.filter((i) => i.g === g), cov = (xs) => xs.filter((i) => i.ok), wsum = (xs) => xs.reduce((a, i) => a + i.w, 0), wcov = (xs) => cov(xs).reduce((a, i) => a + i.w * i.h, 0);
    const grow = naranjas.find((w) => w.k === "crecimiento"), pct = grow && (grow.row.text.match(/\d+(?:[.,]\d+)?\s?%/) || [""])[0];
    const halves = (xs) => { const ch = xs.filter((i) => i.why === "choca"), op = xs.filter((i) => i.why === "oper");
      return (ch.length ? (xs[0].g === "cap" && grow ? `. Alivia la saturación actual, pero con un crecimiento de ${pct || "esa magnitud"}${/anual/.test(norm(grow.row.text)) ? " anual" : ""} es temporal` : ". Los atiende solo a medias, porque choca con uno de tus hallazgos") : "")
        + (op.length ? `. Atiende a medias ${op.map((i) => i.label).join(", ")}: un patrón de operación ordena un hallazgo de arquitectura, no lo resuelve` : ""); };
    const list = (xs) => xs.map((i) => i.label).join(", ");
    const part = (xs, what) => `Atiende ${cov(xs).length} de ${pl(xs.length, "hallazgo", "hallazgos")} de ${what}${cov(xs).length ? ` (${list(cov(xs))})` : ""}${cov(xs).length < xs.length ? `; deja ${list(xs.filter((i) => !i.ok))}` : ""}`;
    const s = {}, ev = {};
    const D = of("disp"), C = of("cap");
    s.disp = D.length ? sc(wcov(D) / wsum(D)) : S.inc.includes("Disponibilidad") ? 3 : 2;
    ev.disp = D.length ? part(D, "disponibilidad y continuidad") + halves(D) : "Tu equipo no registró hallazgos de disponibilidad";
    s.cap = C.length ? sc(wcov(C) / wsum(C)) : S.inc.includes("Capacidad") ? 3 : 2;
    ev.cap = C.length ? part(C, "capacidad") + halves(C) : "Tu equipo no registró hallazgos de capacidad";
    // Seguridad: pasa de 3 solo si atiende un hallazgo de seguridad del equipo.
    const G = of("seg"), sec = S.inc.includes("Seguridad"), gov = ["Cambios", "Gobierno", "Monitoreo", "Proveedor", "Backup"].filter((k) => S.inc.includes(k));
    s.seg = G.length && sec ? sc(wcov(G) / wsum(G)) : sec || gov.length ? 3 : 2;
    ev.seg = G.length && sec ? part(G, "seguridad") + halves(G) : sec ? "Aporta controles de seguridad, pero tu equipo no registró hallazgos de seguridad: no pasa de 3" : G.length ? `No atiende ${list(G)}`
      : gov.length ? `No es un control de seguridad, pero ordena ${join(gov.map((x) => x.toLowerCase()))}` : "No aporta a seguridad ni a cumplimiento";
    // Costo: el del catálogo; si el equipo registró un hallazgo de costos, sube un punto si lo atiende y no pasa de 3 si lo deja.
    const K = of("costo"), kAll = K.length && cov(K).length === K.length;
    s.costo = K.length ? (kAll ? Math.min(5, 6 - S.cost + 1) : Math.min(6 - S.cost, 3)) : 6 - S.cost;
    ev.costo = `Costo relativo ${S.cost} de 5 en el catálogo${pats.length > 1 ? " (el del patrón más costoso)" : ""}${K.length ? (kAll ? `; sube un punto porque atiende ${list(K)}` : `; no pasa de 3 porque deja ${list(K.filter((i) => !i.ok))}`) : ""}`;
    // Viabilidad: complejidad y plazo, menos las advertencias; los hallazgos de monitoreo cuentan igual que los de costos.
    const V = of("viab"), vAll = V.length && cov(V).length === V.length, nW = rojas.length + naranjas.length;
    const v0 = Math.max(1, 6 - Math.round((S.complexity + S.time) / 2) - nW);
    s.viab = V.length ? (vAll ? Math.min(5, v0 + 1) : Math.min(v0, 3)) : v0;
    ev.viab = `Complejidad ${S.complexity} de 5 y plazo ${["", "corto", "", "medio", "", "largo"][S.time]}${nW ? `; baja ${pl(nW, "punto", "puntos")} por ${pl(nW, "advertencia", "advertencias")}` : ""}${V.length ? (vAll ? `; sube un punto porque atiende ${list(V)}` : `; no pasa de 3 porque deja ${list(V.filter((i) => !i.ok))}`) : ""}`;
    // Alineación: objetivos del BMM que la alternativa apoya atendiendo algún hallazgo, más los hallazgos de gobierno del equipo.
    const A = of("alin");
    const objs = ((ctx.bmm && ctx.bmm.objetivos) || []).map((o) => { const t = norm(`${o.m || ""} ${o.t || ""}`), g = OBJ.find(([re]) => re.test(t));
      const gs = new Set((g ? g[1] : []).flatMap((k) => (k === "Cambios" ? ["disp", "alin"] : [GROUP[k] || "disp"])));
      return { t: o.t || o.m || "objetivo", ok: !!g && (g[1].some((k) => S.inc.includes(k)) || (g[1].includes("Disponibilidad") && cov(D).some((i) => i.w === 1))) && items.some((i) => i.ok && gs.has(i.g)) }; });
    const nA = objs.length + wsum(A);
    s.alin = nA ? sc((objs.filter((o) => o.ok).length + wcov(A)) / nA) : 3;
    ev.alin = (objs.length ? `Apoya ${objs.filter((o) => o.ok).length} de ${pl(objs.length, "objetivo", "objetivos")} de tu BMM${objs.some((o) => o.ok) ? ` (${objs.filter((o) => o.ok).map((o) => `«${o.t}»`).join(", ")})` : ""}` : "Sin objetivos en tu BMM")
      + (A.length ? `. ${part(A, "gobierno")}${halves(A)}` : objs.length ? "" : ": queda neutro");
    // Un hallazgo queda cubierto cuando la alternativa atiende todo lo que contiene (el punto único y sus incidentes), aunque sea a medias.
    const touched = new Set(items.map((i) => i.row.id)), covered = new Set([...touched].filter((id) => items.filter((i) => i.row.id === id).every((i) => i.ok)));
    const some = new Set(items.filter((i) => i.ok).map((i) => i.row.id));
    const crit = rows.filter((r) => (ctx.st?.[r.id] || {}).crit && touched.has(r.id)), critOk = crit.filter((r) => covered.has(r.id));
    const sin = crit.filter((r) => !covered.has(r.id)).map((r) => ({ id: r.id, text: r.text, deja: list(items.filter((i) => i.row.id === r.id && !i.ok)) }));
    // Capa expuesta: tiene hallazgos del equipo y la alternativa no atiende ninguno.
    const exposed = ["inst", "arq", "oper"].filter((l) => rows.some((r) => touched.has(r.id) && layerOf(r) === l) && !rows.some((r) => some.has(r.id) && layerOf(r) === l));
    const resumen = `${crit.length ? `Cubre ${critOk.length} de tus ${pl(crit.length, "hallazgo crítico", "hallazgos críticos")}` : `Cubre ${covered.size} de ${pl(touched.size, "hallazgo", "hallazgos")}`}`
      + (exposed.length ? `; deja ${exposed.length > 1 ? "expuestas las capas" : "expuesta la capa"} de ${join(exposed.map((l) => LAYERS[l]))}` : "; no deja capas expuestas");
    return { s, ev, resumen, cubre: [...covered], validado: S.reviewed, rojas, naranjas: naranjas.map(({ id, text }) => ({ id, text })), items,
      criticos: { total: crit.length, cubiertos: critOk.length, sin } };
  }

  /* Orden de las alternativas: primero las que cubren todos los hallazgos críticos del equipo; entre iguales, la de mayor puntaje.
     Una alternativa sin puntaje propuesto (propia, fuera del catálogo) no tiene cobertura calculada y va con las que cubren.
     list: [{ total, sin (número de críticos sin cubrir), ... }] → copia ordenada. */
  function rank(list) {
    return list.map((x, i) => ({ x, i })).sort((a, b) => (a.x.sin ? 1 : 0) - (b.x.sin ? 1 : 0) || b.x.total - a.x.total || a.i - b.i).map((o) => o.x);
  }

  return { score, rank, combine, fnOf, components, groupOf, GROUP, VIOL, CONFLICT, FUNCTIONS };
})();
