/* Catálogo de casos del servidor (casos nuevos C16+ creados por el docente en /admin).
 * Los 15 casos base vienen de los archivos estáticos y no se tocan. Aquí se agregan, antes de que arranque el sitio,
 * los casos nuevos guardados en la última visita; luego se consulta el servidor y, si el catálogo cambió, se recarga
 * una vez. Si el servidor no responde, el sitio funciona con los 15 casos base como siempre. */
(function () {
  "use strict";
  var KEY = "infralab:catalog", BASE = (window.INFRALAB_CONFIG || {}).API_BASE || "";
  BASE = BASE.replace(/\/+$/, "");
  function read(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  function sig(list) { return (list || []).map(function (c) { return c.case_id + ":" + (c.status || "") + ":" + JSON.stringify(c.data || {}).length + ":" + JSON.stringify(c.model || {}).length; }).join("|"); }
  function apply(list) {
    (list || []).forEach(function (c) {
      var id = c.case_id;
      if (!id || /^C(0[1-9]|1[0-5])$/.test(id) || !c.data || !c.model) return; // los casos base nunca se reemplazan
      if (!window.BMM_CASES.some(function (b) { return b.case_id === id; })) window.BMM_CASES.push(c.bmm);
      window.CASE_DATA[id] = c.data;
      window.CASE_MODEL[id] = c.model;
      window.CASE_SERVICES[id] = c.services || { rows: [], note: "" };
      window.BMM_CORPUS[id] = c.corpus || [];
    });
  }
  var cached = read(KEY);
  var applied = cached && cached.cases ? cached.cases : [];
  try { apply(applied); } catch (e) { applied = []; }
  window.INFRALAB_CATALOG = { custom: applied.map(function (c) { return c.case_id; }) };
  // Consulta el catálogo (con la sesión del equipo, si la hay: su periodo y NRC) y recarga una vez si cambió.
  function refresh(force) {
    if (!BASE || !window.fetch) return;
    var headers = {};
    var team = read("infralab:team");
    if (team && team.token) headers.Authorization = "Bearer " + team.token;
    fetch(BASE + "/api/cases", { headers: headers }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      write(KEY, { cases: d.cases || [], at: d.generated });
      if (sig(d.cases) !== sig(applied)) {
        var guard = "infralab:catalog-reload", n = 0;
        try { n = force ? 0 : +sessionStorage.getItem(guard) || 0; } catch (e) { /* */ }
        if (n < 1) { try { sessionStorage.setItem(guard, String(n + 1)); } catch (e) { /* */ } location.reload(); }
      }
    }).catch(function () { /* sin servidor: se usan los casos guardados y los 15 base */ });
  }
  window.INFRALAB_CATALOG.refresh = refresh;
  refresh(false);
})();
