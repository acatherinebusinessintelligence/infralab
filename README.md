# InfraLab · Taller de Alternativas de Infraestructura

> **Diagnostica. Mide. Diseña alternativas.**
> Taller interactivo de **Gestión de Infraestructura TI**: 15 organizaciones reales, sus componentes, dependencias, puntos únicos de falla y métricas. El sitio ofrece pistas, pero **no entrega la solución**. Cada equipo debe proponer, comparar y defender sus alternativas.

![HTML5](https://img.shields.io/badge/HTML5-sin%20backend-e34f26) ![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-f7df1e) ![Chart.js](https://img.shields.io/badge/Chart.js-4.4-ff6384) ![Casos](https://img.shields.io/badge/casos-15-22d3ee) ![Licencia](https://img.shields.io/badge/uso-acad%C3%A9mico-a78bfa)

---

## ¿Qué incluye?

| Sección | Qué hace |
|---|---|
| **Ruta del taller** | 5 etapas: comprender el negocio → mapear → medir → diseñar alternativas → decidir. Cada una abre un popup con objetivos y actividades. |
| **Mapa de infraestructura** | Arquitectura de referencia animada. Cada componente (firewall, BD, WAN, AD, backup, cloud, IoT…) abre una ficha con **qué es, cómo funciona (animación de flujo), analogía, cómo falla, qué medir y preguntas guía**. |
| **Métricas** | Fórmulas (disponibilidad, MTTR, MTBF, serie, paralelo, RTO/RPO), calculadora de disponibilidad, simulador de «nueves» y laboratorio **serie vs. paralelo por organización**. En el laboratorio se elige el servicio, cuya importancia viene de la criticidad informada por TI; los componentes se escogen con desplegables (activos reales o genéricos), se ponderan por criticidad y el resultado incluye un índice de riesgo ponderado. |
| **Casos** | 15 casos filtrables. Incluye mapas de calor comparativos (SPOF y calidad de la evidencia) y un índice de exposición. |
| **Espacio de trabajo por caso** | Pestañas **Expediente**, **Inventario** (servidores, almacenamiento, backup, red, seguridad, equipo de TI y clasificación Tier), **Arquitectura** (grafo de dependencias con **simulador de fallas en cascada**), **Métricas** (datos oficiales, gráficos y **verificador de cálculos**), **Incidentes** (línea de tiempo y clasificación por práctica ITIL 4, objetivo COBIT 2019 y control ISO/IEC 27001:2022), **BMM** como constructor paso a paso (Influenciadores → DOFA → Fines → Medios → Directivas → Mapa). Incluye un banco de evidencias del caso que se adapta a cada paso, constructores de metas, objetivos SMART, tácticas, políticas y reglas con vista previa, y un selector de marcos ITIL, COBIT, ISO/IEC 27001 y Tier con buscador, **Retos** (pregunta central, preguntas de razonamiento y principio del caso), **Alternativas candidatas**, **Matriz de decisión** ponderada con radar y exportación a Markdown, y **Tutor IA** (retroalimentación con DeepSeek). |
| **Catálogo de alternativas** | 26 patrones de solución con pros, contras, costo, complejidad y preguntas críticas. Ninguno se marca como «correcto». |
| **Tutor IA con RAG + panel docente** | El estudiante pide retroalimentación formativa sobre sus respuestas, su BMM, sus cálculos, su clasificación de incidentes, su Tier o su matriz. El tutor responde con preguntas, sin dar la solución, apoyado en una base de conocimiento (ISO/IEC 27001:2022, ITIL 4, COBIT 2019, Tier, BMM y el expediente del caso) cuyas fuentes cita. Incluye una biblioteca de consulta. `docente.html` muestra todas las entregas, niveles y estadísticas, y exporta a CSV. |
| **Mentor IA** | Junto a cada ítem del caso (Tier, cálculos, incidentes y preguntas guía) hay un botón **Mentor**: indica dónde buscar, da pistas graduadas y revisa la respuesta del equipo contra una **clave confidencial del docente que vive solo en el servidor**, explicando el porqué con citas del expediente y de los marcos (RAG) sin revelar la solución. La pestaña Tutor IA muestra el avance ítem por ítem, y el docente ve en `/admin` qué resolvió cada equipo, cuántas pistas pidió y la bitácora completa. |
| **Equipos y seguimiento** | Cada equipo de Moodle recibe un código. El estudiante ingresa con el código y su correo institucional, y el docente sigue en `/admin` (servidor) quién ingresa, el avance de cada equipo y sus solicitudes al tutor. Los equipos se cargan subiendo los CSV de «Auto-selección de grupo» por NRC y periodo. |
| **Taller guiado** | Diez etapas (negocio, AS-IS, SPOF, métricas, capacidad, hallazgos, gobierno, BMM, alternativas, estrategia), cada una ilustrada con un caso distinto y un intento con errores típicos para detectar. Incluye autoverificación, el mapa de herramientas del sitio (componentes, fórmulas, calculadoras, laboratorio serie/paralelo, casos, radiografía comparativa, índice de exposición y catálogo de alternativas) con qué hacer y qué trampa evitar en cada etapa, y la hoja de trabajo «Tu turno». Se descarga en Word (editable) y en PDF, o se usa en la versión imprimible `taller-guiado.html`. |

### Principio pedagógico: pistas, no respuestas

- Las **alternativas candidatas** de cada caso mezclan opciones pertinentes, insuficientes por sí solas y otras que violan restricciones. El estudiante debe descartar y justificar.
- Las relaciones del grafo marcadas en **amarillo punteado** son **inferidas**. El estudiante debe validarlas o corregirlas.
- Los casos que **no declaran SPOF** muestran «?»: descubrirlos con el simulador es parte del trabajo.
- **Disponibilidad, MTTR, MTBF y meses hasta llenar el almacenamiento no se muestran.** El estudiante los calcula con los datos oficiales y el verificador solo le dice si su resultado es correcto; además detecta errores típicos (usar el tiempo caído en vez del tiempo de recuperación, o el periodo completo en el MTBF).
- La **clave de respuestas del Mentor IA no está en este repositorio**: se genera en local (`backend/answer_key/`, excluida por `.gitignore`) y se carga en el servidor desde el panel. El navegador del estudiante nunca la recibe.
- Las respuestas, las preguntas marcadas y la matriz se guardan **en el navegador** (localStorage) y se exportan como informe `.md`.

---

## Arquitectura

```
GitHub Pages (frontend estático)  ──HTTPS──▶  PythonAnywhere (backend Flask)  ──▶  DeepSeek API
  index.html · docente.html                      backend/flask_app.py + SQLite
```

El frontend funciona solo; el Tutor IA y el panel docente se activan al configurar `API_BASE` en `assets/js/config.js`. La guía de despliegue está en [`backend/README.md`](backend/README.md).

## Estructura

```
├── index.html              # Página principal
├── docente.html            # Acceso directo al panel administrativo del servidor
├── taller-guiado.html      # Versión imprimible del taller guiado
├── assets/
│   ├── css/styles.css      # Estilos (tema oscuro, responsive)
│   └── js/
│       ├── config.js       # URL del backend (API_BASE)
│       ├── app.js          # Lógica: mapa, popups, grafos, simulador, laboratorio, BMM, tutor, matriz
│       ├── services.js     # Servicios y criticidad informada por TI (de los PDF)
│       ├── frameworks.js   # Catálogos ITIL 4, COBIT 2019, ISO/IEC 27001:2022 Anexo A, Tier y guía BMM
│       ├── cases.js        # Modelo estructurado de cada caso (nodos, dependencias, SPOF, preguntas)
│       ├── metrics.js      # Datos oficiales de los PDF: inventario, métricas, incidentes, restricciones
│       ├── components.js   # Fichas de componentes + glosario de términos
│       ├── patterns.js     # Catálogo de alternativas
│       ├── icons.js        # Iconos SVG propios
│       └── corpus.js       # GENERADO desde /data (no editar a mano)
├── Casos/                  # PDF de los casos (solo local; se reparten por Moodle, no se publican)
├── data/
│   ├── bmm_cases.json      # Índice de los 15 casos
│   └── bmm_corpus_cXX.json # Expediente de cada caso
├── backend/                # API Flask para PythonAnywhere (DeepSeek + RAG + SQLite)
│   ├── teams.py            # Equipos, códigos de acceso, seguimiento y API del panel
│   ├── storage.py          # Esquema SQLite compartido
│   ├── admin/              # Panel administrativo (/admin)
│   ├── rag.py              # Recuperación BM25 sobre la base de conocimiento
│   └── knowledge/          # Fichas ISO 27001, ITIL 4, COBIT 2019, Tier, BMM, metodología
├── tools/build_corpus.py   # Regenera assets/js/corpus.js
└── tools/build_guide.py    # Genera el taller guiado (guide.js, Word y PDF) desde data/taller_guiado.json
```

## Uso local

No requiere instalación: abre `index.html` en el navegador. Los datos van embebidos en `corpus.js`, así que funciona también con `file://`.

Para servirlo localmente (opcional):

```bash
python -m http.server 8000
# http://localhost:8000
```

## Publicar en GitHub Pages

1. Sube el repositorio a GitHub.
2. Ve a **Settings → Pages**.
3. En **Source** elige `Deploy from a branch`, rama `main`, carpeta `/ (root)`.
4. En uno o dos minutos el sitio queda en `https://<usuario>.github.io/<repositorio>/`.

## Editar o agregar casos

1. Edita o agrega el expediente en `data/bmm_corpus_cXX.json` y regístralo en `data/bmm_cases.json`.
2. Regenera los datos embebidos:
   ```bash
   python tools/build_corpus.py
   ```
3. Agrega los datos oficiales del caso en `assets/js/metrics.js` (`CASE_DATA.CXX`): inventario, `service` (datos crudos del servicio principal), `blocks` (indicadores por componente), `incidents` y `restrictions`.
4. Agrega el modelo del caso en `assets/js/cases.js` (`CASE_MODEL.CXX`):
   - `nodes`: `[id, etiqueta, tipo, componente, spof]`. Tipos: `a` actor, `s` servicio, `c` componente, `x` tercero.
   - `edges`: `[origen, destino, inferida]`, que se lee como «origen **depende de** destino».
   - `questions`, `restrictions`, `conditions`, `evidence`, `alternatives` (claves de `patterns.js`).

## Editar el taller guiado

El contenido de las 10 etapas está en `data/taller_guiado.json`. Después de editarlo ejecuta:

```bash
pip install python-docx
python tools/build_guide.py   # regenera assets/js/guide.js, el Word y el PDF (este último requiere Chrome o Edge)
```

Los **ejercicios guiados** (recorridos clic a clic por el sitio) también están en ese JSON (`tours`) y se abren con enlaces como `index.html#guia/laboratorio`. Cuando publiques el sitio, escribe su dirección en `site_url` (por ejemplo `https://usuario.github.io/repositorio/`) y regenera: el Word y el PDF tendrán los enlaces completos y clicables.

## Datos de estudiantes

Las listas de grupos exportadas de Moodle (`Grupos/*.csv`) contienen datos personales y **no se suben a GitHub** (están en `.gitignore`). Se cargan únicamente en el panel administrativo del servidor. Detalles en [`backend/README.md`](backend/README.md#equipos-códigos-y-panel-administrativo).

## Créditos

Desarrollado para el curso de **Gestión de Infraestructura TI**, Uniminuto, 2026-2.
Librerías externas: [Chart.js](https://www.chartjs.org/) (CDN) y fuentes de Google Fonts (Space Grotesk, Inter, JetBrains Mono).
