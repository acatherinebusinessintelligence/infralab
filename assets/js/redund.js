/* Ítem «Redundancia e instalación» (antes «Clasificación Tier»).
 * El Tier clasifica la instalación (energía, enfriamiento, rutas), no los servidores. Aquí solo van las opciones que ve
 * el estudiante, sin distinguir cuáles son correctas: esa distinción y los umbrales viven en la clave del servidor. */
window.REDUND = {
  layers: [
    ["Instalación", "Energía, UPS, generadores, enfriamiento, rutas de distribución", "Tier I a IV"],
    ["Arquitectura TI", "Servidores, red, datos, puntos únicos de falla", "Nivel de redundancia (parte A)"],
    ["Operación y terceros", "Procesos, monitoreo, proveedores", "ITIL, COBIT, ISO 27001, SLA"],
  ],
  levels: [
    ["sin", "Sin redundancia", "Cada componente crítico es único."],
    ["parcial", "Redundancia parcial", "Algunos componentes tienen respaldo, pero quedan puntos únicos de falla en servicios críticos."],
    ["criticos", "Redundancia en componentes críticos", "Todo lo crítico tiene respaldo; una falla no detiene el servicio."],
    ["tolerante", "Tolerante a fallas", "Duplicación completa y aislada; resiste una falla sin intervención."],
  ],
  // Respuestas guardadas antes del cambio (Tier I–IV) → escala nueva.
  fromTier: { I: "sin", II: "parcial", III: "criticos", IV: "tolerante" },
  info: [
    ["cpu", "Capacidad de CPU y RAM"], ["ups", "UPS y su autonomía"], ["sla", "SLA del proveedor"], ["users", "Número de usuarios"],
    ["rutas", "Rutas de distribución de energía y enfriamiento"], ["so", "Versión del sistema operativo"], ["cert", "Certificación Tier del sitio"],
    ["bw", "Ancho de banda de Internet"], ["acom", "Acometidas eléctricas y su redundancia"], ["av", "Antivirus instalado"],
    ["cool", "Sistema de enfriamiento y su redundancia"], ["nserv", "Número de servidores"], ["zonas", "Regiones y zonas de disponibilidad"],
    ["gen", "Plantas eléctricas o generadores"], ["lic", "Licencias de software"], ["mant", "Posibilidad de mantenimiento sin apagar"],
  ],
  who: [
    ["mesa", "Mesa de ayuda"], ["dc", "Proveedor del centro de datos (contrato, ejecutivo de cuenta)"], ["dev", "Desarrolladores de la aplicación"],
    ["cloud", "Proveedor de nube (documentación y SLA)"], ["fac", "Área de infraestructura o facilities de la organización"], ["isp", "Proveedor de Internet"],
  ],
  // Dónde está alojado cada caso base (lo dice su expediente). Los casos nuevos traen su propio valor.
  hosting: { C01: "propio", C02: "propio", C03: "contratado_nube", C04: "contratado_nube", C05: "hibrido_propio", C06: "propio", C07: "propio", C08: "hibrido_propio",
    C09: "propio", C10: "nube", C11: "hibrido_propio", C12: "propio", C13: "propio", C14: "hibrido_propio", C15: "hibrido_propio" },
  intro: {
    propio: "El caso no describe la instalación donde están los equipos.",
    contratado: "La infraestructura está en un centro de datos contratado. El caso no describe esa instalación.",
    contratado_nube: "Parte de la infraestructura está en un centro de datos contratado y parte en la nube. El caso no describe la instalación.",
    hibrido_propio: "Parte de la infraestructura está en una instalación propia y parte en la nube. El caso no describe la instalación.",
    nube: "La plataforma está completamente en la nube: la instalación es del proveedor, así que el Tier no lo defines tú.",
  },
  ask: {
    propio: "¿Qué información necesitarías para clasificar el Tier?",
    contratado: "¿Qué información necesitarías para clasificar el Tier? Piensa también en qué le pedirías al proveedor.",
    contratado_nube: "¿Qué información necesitarías para clasificar el Tier? Piensa también en qué le pedirías a cada proveedor.",
    hibrido_propio: "¿Qué información necesitarías para clasificar el Tier? Piensa en la instalación propia y en la parte que está en la nube.",
    nube: "¿Qué necesitas saber de la instalación del proveedor, de sus regiones y de sus zonas de disponibilidad?",
  },
  hasCloud: (h) => h === "contratado_nube" || h === "hibrido_propio" || h === "nube",
  levelLabel(id) { const l = this.levels.find((x) => x[0] === id); return l ? l[1] : ""; },
  toLevel(v) {
    const s = String(v || "").trim(); if (!s) return "";
    if (this.levels.some((l) => l[0] === s)) return s;
    const byLabel = this.levels.find((l) => l[1].toLowerCase() === s.toLowerCase()); if (byLabel) return byLabel[0];
    const m = s.match(/tier\s*(IV|III|II|I)\b/i) || s.match(/^(IV|III|II|I)$/i);
    return m ? this.fromTier[m[1].toUpperCase()] || "" : "";
  },
  // Respuesta en la forma nueva (acepta la anterior: «Tier II · …» en actual/objetivo y la justificación en just).
  norm(v) {
    v = v && typeof v === "object" ? v : {};
    const b = v.b && typeof v.b === "object" ? v.b : {};
    const out = { v: 2, actual: this.toLevel(v.actual), objetivo: this.toLevel(v.objetivo), just: v.just || "", ev: v.ev && typeof v.ev === "object" ? { ...v.ev } : {},
      b: { info: Array.isArray(b.info) ? b.info.slice() : [], who: Array.isArray(b.who) ? b.who.slice() : [], top: b.top || "", why: b.why || "" } };
    if (v.prev) out.prev = true;
    return out;
  },
  // Orden aleatorio pero estable por equipo (todos los integrantes ven el mismo).
  shuffle(list, seed) {
    let h = 2166136261; for (const ch of String(seed || "infralab")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  },
  // ¿Cuenta para el progreso? (misma regla que el servidor: parte A con niveles y 2 componentes; parte B con 3 casillas, destinatario y 8 palabras)
  done(v) {
    const t = this.norm(v);
    if (t.prev) return true;
    const words = (String(t.b.why || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-zñ]{3,}/g) || []).length;
    return !!(t.actual && t.objetivo && Object.keys(t.ev).length >= 2 && t.b.info.length >= 3 && t.b.who.length && t.b.top && words >= 8);
  },
  summary(v) {
    const t = this.norm(v), u = Object.values(t.ev).filter((x) => x === "u").length, r = Object.values(t.ev).filter((x) => x === "r").length;
    return `Actual: ${this.levelLabel(t.actual) || "—"} · Objetivo: ${this.levelLabel(t.objetivo) || "—"} · únicos: ${u}, con respaldo: ${r} · Parte B: ${t.b.info.length} casillas, ${t.b.who.length} destinatario(s)`;
  },
};
