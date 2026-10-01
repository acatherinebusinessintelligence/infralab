# InfraLab · Backend del Tutor IA (Flask + DeepSeek)

Este backend recibe el trabajo de los estudiantes desde el frontend publicado en GitHub Pages y pide a **DeepSeek** retroalimentación formativa. El tutor **no entrega soluciones**. Cada entrega queda en SQLite para el seguimiento del docente.

```
GitHub Pages (index.html)  ──POST /api/feedback──▶  PythonAnywhere (Flask)  ──▶  api.deepseek.com
docente.html               ──GET /api/teacher/*──▶        │
                                                          └── infralab.db (SQLite)
```

## Base de conocimiento (RAG)

El tutor no responde «de memoria»: en cada solicitud, `rag.py` recupera con BM25 (Python puro, sin dependencias) las fichas más pertinentes y se las entrega al modelo, que debe citarlas por ID. El estudiante ve las fuentes usadas y puede leerlas.

| Fuente | Archivo | Contenido |
|---|---|---|
| ISO/IEC 27001:2022 | `knowledge/iso27001.md` | Cláusulas 4 a 10 y temas del Anexo A (acceso, proveedores y nube, incidentes, continuidad, capacidad, backup, redundancia, logging, redes, cambios…) |
| ITIL 4 | `knowledge/itil4.md` | SVS, principios, cadena de valor y prácticas clave |
| COBIT 2019 | `knowledge/cobit2019.md` | Principios, cascada de metas, capacidad, dominios EDM/APO/BAI/DSS/MEA y RACI |
| Tier (Uptime Institute) | `knowledge/tier.md` | Tier I–IV, notación N/N+1/2N y cómo usarlo en el análisis |
| Business Motivation Model | `knowledge/bmm.md` | Fines, medios, influenciadores, evaluaciones, relaciones y aplicación a la infraestructura |
| Metodología del curso | `knowledge/metodologia.md` | Regla de sustentación, métricas, SPOF, serie/paralelo, RTO/RPO, CAPEX/OPEX… |
| Expediente de cada caso | `../data/bmm_corpus_cXX.json` | Solo se recupera el del caso consultado |

Las fichas son **resúmenes académicos propios**: no reproducen el texto oficial de las normas, que tiene derechos de autor.

**Agregar o corregir conocimiento:** edita o crea un `.md` en `knowledge/` con este formato y recarga la web app:

```markdown
## [ID-UNICO] Título de la ficha
tags: palabras clave sinonimos para mejorar la búsqueda
Texto de la ficha (un párrafo de 80 a 200 palabras funciona mejor).
```

Para probar la búsqueda sin gastar créditos: `GET /api/knowledge/search?q=copias de seguridad&framework=ISO/IEC 27001:2022`.

## Equipos, códigos y panel administrativo

Cada equipo de Moodle recibe un **código de acceso** (por ejemplo `83600-02-K7Q9M`). El estudiante entra al sitio con **ese código y su correo institucional**; el servidor verifica que el correo pertenezca al equipo. Desde ese momento, su avance y sus solicitudes al Tutor IA quedan registrados para el seguimiento del docente.

**Panel administrativo:** `https://<usuario>.pythonanywhere.com/admin` (contraseña `ADMIN_PASSWORD` del `.env`). Pestañas:

| Pestaña | Qué permite |
|---|---|
| Seguimiento | Estado de cada equipo (activo, inactivo más de 7 días, sin ingresos), quién ha ingresado, último acceso, solicitudes al tutor y su último nivel, y avance (ejercicios guiados, preguntas, BMM, cálculos verificados, matriz). Detalle por integrante y exportación a CSV |
| Equipos y códigos | Asignar el caso, copiar o regenerar el código, retirar o reactivar equipos, retirar, eliminar o agregar integrantes, crear equipos a mano, exportar e imprimir los códigos |
| Importar CSV | Subir uno o varios CSV de Moodle con vista previa (equipos nuevos, integrantes que entran y salen, grupos que se retiran) antes de confirmar |
| Periodos y NRC | Crear, abrir y cerrar periodos (2026-2, 2027-1…), retirar, reactivar o eliminar un NRC, e historial de importaciones |
| Tutor IA | Todas las solicitudes con el trabajo enviado y la respuesta del tutor |

### Flujo de cada semestre

1. En Moodle, exporta la actividad **«Auto-selección de grupo»** de cada NRC (CSV). El NRC se lee del nombre del archivo (`…_60-83600_…`) y puedes corregirlo en la vista previa. Si la descripción del grupo dice «Caso 8», el caso se asigna solo.
2. En **Importar CSV**, escribe el periodo (`2026-2`), sube los archivos y revisa la vista previa.
3. Elige el modo:
   - **Sincronizar** (recomendado): el CSV manda. Agrega y actualiza, y **retira** a los integrantes y grupos de ese NRC que ya no estén en el archivo.
   - **Solo agregar:** agrega y actualiza sin retirar a nadie.
4. En **Equipos y códigos**, asigna el caso de cada equipo y exporta o imprime los códigos para repartirlos.
5. Cuando cambie la conformación de los grupos, vuelve a exportar desde Moodle y reimporta en modo «Sincronizar». Si un estudiante aparece en otro grupo del mismo periodo, se mueve automáticamente.
6. Al terminar el semestre, **cierra el periodo** en «Periodos y NRC»: nadie de ese periodo podrá ingresar, pero su historial se conserva para consulta.

Retirar a un integrante o a un equipo, regenerar un código o cerrar el periodo **bloquea el acceso de inmediato**, incluso si el estudiante ya había ingresado.

### Datos personales

- Los CSV de Moodle contienen datos personales. La carpeta `Grupos/` y los `*.csv` están en `.gitignore`: **no los subas a GitHub**. Súbelos solo por el panel.
- El servidor **no guarda el número de documento**: solo nombre, usuario y correo, lo mínimo para verificar la pertenencia al equipo.
- La base de datos (`infralab.db`) vive solo en PythonAnywhere y está excluida del repositorio.
- Informa a los estudiantes qué se registra (accesos, avance y solicitudes al tutor) y con qué fin (seguimiento académico), conforme a la política de tratamiento de datos de la institución (Ley 1581 de 2012).

## Endpoints

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/health` | Estado del servidor, si hay clave de DeepSeek y cuántas fichas tiene la base |
| GET | `/api/knowledge/search?q=&framework=&case_id=` | Búsqueda en la base de conocimiento (sin LLM) |
| POST | `/api/feedback` | Estudiante: envía secciones de su trabajo y recibe retroalimentación (JSON) |
| GET | `/api/history?case_id=` | Estudiante: historial de retroalimentaciones (compartido por el equipo) |
| POST | `/api/auth/login` | Estudiante: ingresa con `{code, email}` y recibe un token firmado (30 días) |
| GET | `/api/auth/me` | Estudiante: valida la sesión y devuelve el equipo |
| POST | `/api/progress` | Estudiante: guarda la foto de su avance en el caso |
| GET | `/admin` | Panel administrativo (sesión con `ADMIN_PASSWORD`) |
| * | `/api/admin/*` | API del panel: periodos, NRC, importación, equipos, integrantes, códigos y seguimiento (CSV) |
| GET | `/api/teacher/stats` | Docente (Bearer token): totales por caso, nivel y grupo |
| GET | `/api/teacher/submissions` | Docente: lista con filtros `case_id`, `group`, `level`, `q` |
| GET | `/api/teacher/submissions/<id>` | Docente: detalle con el trabajo enviado y la respuesta del tutor |
| GET | `/api/teacher/export.csv` | Docente: exportación a CSV (se abre en Excel) |

## Despliegue en PythonAnywhere

> ⚠️ **Cuentas gratuitas:** PythonAnywhere solo permite conexiones salientes a los dominios de su [lista blanca](https://www.pythonanywhere.com/whitelist/). Verifica que `api.deepseek.com` esté incluido. Si no lo está, puedes pedir que lo agreguen desde su foro o soporte, o usar una cuenta de pago (plan *Hacker*), que no tiene esa restricción. Además, en el plan gratuito la web app debe renovarse cada 3 meses con el botón *Run until 3 months from today*.

1. **Crea la cuenta** en <https://www.pythonanywhere.com> y abre una consola **Bash**.
2. **Clona el repositorio**:
   ```bash
   git clone https://github.com/<usuario>/<repositorio>.git infralab   # el repositorio completo: el RAG lee ../data
   cd infralab/backend
   ```
3. **Crea el entorno virtual e instala las dependencias**:
   ```bash
   mkvirtualenv --python=/usr/bin/python3.10 infralab
   pip install -r requirements.txt
   ```
4. **Configura los secretos**:
   ```bash
   cp .env.example .env
   nano .env      # DEEPSEEK_API_KEY, ADMIN_PASSWORD, SECRET_KEY, ALLOWED_ORIGINS=https://<usuario>.github.io
   ```
5. **Crea la web app**: pestaña *Web* → *Add a new web app* → *Manual configuration* → Python 3.10.
   - **Virtualenv:** `/home/<usuario>/.virtualenvs/infralab`
   - **Source code:** `/home/<usuario>/infralab/backend`
6. **Edita el archivo WSGI** (enlace en la pestaña *Web*) y reemplaza su contenido por:
   ```python
   import sys
   path = "/home/<usuario>/infralab/backend"
   if path not in sys.path:
       sys.path.insert(0, path)
   from flask_app import app as application
   ```
7. Pulsa **Reload** y prueba `https://<usuario>.pythonanywhere.com/api/health`. Debe responder `{"ok": true, "llm_configured": true, ...}`.
8. **Conecta el frontend**: en `assets/js/config.js` escribe
   `API_BASE: "https://<usuario>.pythonanywhere.com"`, haz commit y push a GitHub.
9. **Panel administrativo**: abre `https://<usuario>.pythonanywhere.com/admin`, ingresa con `ADMIN_PASSWORD` e importa los CSV de Moodle (ver «Equipos, códigos y panel administrativo»).

Para actualizar el backend: `cd ~/infralab && git pull`, y después **Reload** en la pestaña *Web*.

## Prueba local

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate      # Windows  (Linux/Mac: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env                               # y edita la clave
python flask_app.py                                  # http://127.0.0.1:5000/api/health
```

En `assets/js/config.js` usa temporalmente `API_BASE: "http://127.0.0.1:5000"`.

## Seguridad y privacidad

- La clave de DeepSeek **solo** vive en el `.env` del servidor. Nunca va en el frontend ni en GitHub (`.gitignore` la excluye).
- CORS restringido a `ALLOWED_ORIGINS`.
- Límite de solicitudes por equipo y por hora (`RATE_LIMIT_PER_HOUR`) y tamaño máximo por petición, para controlar el costo.
- El panel docente exige `TEACHER_TOKEN`, que se compara en tiempo constante.
- El prompt del sistema trata el trabajo del estudiante como **dato**. Si un estudiante intenta pedir la solución o manipular al tutor, el intento queda marcado en el campo `alerta`.
- Informa a los estudiantes que su nombre, grupo y respuestas se envían al servidor del curso y a DeepSeek. La pestaña Tutor IA lo indica.

## Costos

Cada solicitud usa aproximadamente entre 2.000 y 6.000 tokens de entrada y hasta 1.500 de salida. El número real de tokens queda guardado por entrega (`tokens_in`, `tokens_out`) y puede revisarse en el panel docente. Consulta la tarifa vigente en <https://api-docs.deepseek.com/quick_start/pricing>.
