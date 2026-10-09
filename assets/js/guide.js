/* Archivo generado por tools/build_guide.py — no editar a mano. */
window.GUIDE = {
 "title": "Taller guiado de Gestión de Infraestructura TI",
 "subtitle": "Diez etapas para analizar tu caso, cada una con un ejemplo de otra organización y los errores típicos que conviene evitar",
 "intro": [
  "Este taller no te entrega la solución de ningún caso. Te acompaña, etapa por etapa, para que descubras para qué sirve cada parte del análisis y cómo se conecta con la siguiente.",
  "En cada etapa verás un ejemplo de un caso distinto al tuyo, con un intento de respuesta que contiene errores frecuentes. Primero intenta encontrarlos; después lee la explicación (en el sitio, con el botón «Ver errores»; en este documento, en el anexo final). Luego aplica la etapa a tu propio caso en la hoja «Tu turno».",
  "Regla de oro del curso: toda afirmación se sustenta con la secuencia problema → evidencia → impacto → decisión → métrica."
 ],
 "how": [
  "Haz primero los ejercicios guiados en la web",
  "Lee «Para qué sirve» de cada etapa",
  "Encuentra los errores del ejemplo",
  "Usa las herramientas en tu caso",
  "Completa la hoja «Tu turno»"
 ],
 "steps": [
  {
   "id": 1,
   "title": "Comprender el negocio",
   "icon": "building",
   "purpose": "Antes de hablar de servidores hay que saber qué no puede dejar de funcionar y por qué. Esta etapa define qué es crítico; todas las decisiones posteriores se justifican desde aquí.",
   "discover": "Que la criticidad la define el impacto en el negocio, no la cantidad de usuarios ni la tecnología.",
   "case_id": "C06",
   "case_label": "C06 · Alcaldía Municipal de San Gabriel",
   "tab": "Expediente · Retos · BMM (tabla de servicios)",
   "activities": [
    "Lee el expediente y la tabla de servicios con su criticidad informada por TI.",
    "Identifica a los usuarios de cada servicio crítico y qué hacen cuando el servicio falla.",
    "Estima el impacto de una hora de caída con datos del caso (volúmenes, fechas críticas, obligaciones).",
    "Lista las restricciones que condicionan cualquier recomendación."
   ],
   "attempt": [
    "La Alcaldía es una entidad pública con muchos sistemas.",
    "El servicio más importante es el correo institucional, porque lo usan todos los funcionarios.",
    "El problema principal es que los servidores son viejos.",
    "Una hora de caída no afecta mucho, porque los ciudadanos pueden volver otro día."
   ],
   "errors": [
    {
     "e": "Elige el servicio más importante por número de usuarios.",
     "why": "El caso informa la criticidad de cada servicio. Revisa la tabla: ¿qué criticidad tiene el correo frente al portal ciudadano y al sistema tributario?"
    },
    {
     "e": "Afirma un problema que el caso no evidencia («servidores viejos»).",
     "why": "Ningún dato del inventario habla de la antigüedad. Un diagnóstico se basa en evidencia: CPU, almacenamiento, incidentes, prácticas."
    },
    {
     "e": "Minimiza el impacto sin datos.",
     "why": "El caso da cifras de solicitudes diarias, temporadas tributarias y obligaciones de cumplimiento público. El impacto debe expresarse con esos datos."
    },
    {
     "e": "Omite las restricciones.",
     "why": "El presupuesto público, la modernización gradual y los sistemas que no se pueden reemplazar cambian qué alternativas son viables."
    }
   ],
   "checks": [
    "Usé la criticidad informada por TI, no mi percepción.",
    "Cuantifiqué el impacto con al menos un dato del caso.",
    "Identifiqué a los usuarios afectados y su alternativa manual (si existe).",
    "Listé las restricciones del caso."
   ],
   "worksheet": {
    "cols": [
     "Servicio crítico",
     "Usuarios",
     "Impacto de 1 h de caída (con dato)",
     "Restricción que condiciona"
    ],
    "rows": 4
   },
   "tools": [
    {
     "tool": "casos",
     "do": "Filtra por sector y compara la tarjeta de tu caso con la del caso de ejemplo; luego lee el expediente completo de tu caso.",
     "trap": "Quedarse con la tarjeta resumen y saltarse el expediente y la tabla de servicios."
    },
    {
     "tool": "exposicion",
     "do": "Ubica tu caso en el índice de exposición: ¿en qué dimensión destaca frente a los demás? Anótalo como hipótesis para la etapa 6.",
     "trap": "Tomar el índice como diagnóstico: es un conteo de palabras del expediente y solo orienta."
    }
   ],
   "tours": [
    "casos",
    "expediente",
    "exposicion"
   ]
  },
  {
   "id": 2,
   "title": "Inventario y arquitectura AS-IS",
   "icon": "sitemap",
   "purpose": "Dibujar la situación actual tal como es, con nombres reales, ubicaciones y dependencias. Sin este mapa no se pueden ver los puntos únicos de falla ni el efecto cascada.",
   "discover": "Que un diagrama genérico («usuarios → servidores → base de datos») no sirve: lo valioso son las dependencias concretas del caso.",
   "case_id": "C07",
   "case_label": "C07 · TransLogica Express",
   "tab": "Inventario · Arquitectura",
   "activities": [
    "Toma la tabla de servidores y ubica cada uno (centro de datos, sede, nube).",
    "Agrega red y conectividad: enlaces por sede, VPN, firewall, dispositivos.",
    "Incluye terceros e integraciones.",
    "Dibuja flechas «depende de» entre servicios y componentes; valida las relaciones inferidas del grafo del sitio."
   ],
   "attempt": [
    "Diagrama: Usuarios → Internet → Servidores → Base de datos.",
    "Los centros regionales usan el sistema.",
    "Componentes: servidores, base de datos y firewall."
   ],
   "errors": [
    {
     "e": "El diagrama sirve para cualquier empresa.",
     "why": "No usa nombres reales (WMS-SRV01, TMS-SRV01, API-SRV01…) ni muestra qué servicio corre en cada servidor."
    },
    {
     "e": "Omite cómo se conectan las sedes.",
     "why": "Revisa cuántos enlaces tiene cada centro regional y por dónde llegan a los sistemas centrales."
    },
    {
     "e": "Olvida los dispositivos y los terceros.",
     "why": "Hay más de mil dispositivos móviles sobre redes celulares e integraciones con clientes y transportadoras: también son dependencias."
    },
    {
     "e": "No hay flechas de dependencia.",
     "why": "Sin dependencias no se puede simular qué se cae cuando falla un componente."
    }
   ],
   "checks": [
    "Cada componente tiene su nombre real y su ubicación.",
    "Aparecen sedes, enlaces y su cantidad.",
    "Incluí terceros, dispositivos e identidad (AD/DNS).",
    "Las flechas muestran quién depende de quién."
   ],
   "worksheet": {
    "cols": [
     "Componente (nombre real)",
     "Ubicación",
     "Depende de",
     "Lo usan (servicios / sedes)"
    ],
    "rows": 6
   },
   "tools": [
    {
     "tool": "mapa",
     "do": "Recorre el mapa de referencia y marca qué componentes existen en tu caso y cuáles no aparecen (monitoreo, segundo sitio, balanceador…).",
     "trap": "Copiar el mapa de referencia como si fuera la arquitectura de tu caso."
    },
    {
     "tool": "casos",
     "do": "En la pestaña Arquitectura de tu caso, valida cada relación inferida (línea punteada) contra el inventario.",
     "trap": "Aceptar las relaciones inferidas sin verificarlas en el documento oficial."
    }
   ],
   "tours": [
    "mapa",
    "expediente"
   ]
  },
  {
   "id": 3,
   "title": "Puntos únicos de falla (SPOF)",
   "icon": "alert",
   "purpose": "Encontrar los componentes cuya falla detiene un servicio crítico porque no tienen respaldo. Esta etapa orienta dónde vale la pena invertir.",
   "discover": "Que no todo componente único es un SPOF crítico, y que algunos SPOF no son servidores: enlaces, proveedores o personas.",
   "case_id": "C04",
   "case_label": "C04 · Comercial NovaRetail",
   "tab": "Arquitectura (simulador de fallas) · Inventario",
   "activities": [
    "Recorre las dependencias de cada servicio crítico.",
    "Para cada componente, pregunta: si falla ahora, ¿qué deja de funcionar? ¿Hay algo que lo reemplace?",
    "Usa el simulador de fallas del sitio para ver la cascada.",
    "Clasifica la criticidad del SPOF según el servicio que soporta."
   ],
   "attempt": [
    "SPOF: WEB-SRV01 y WEB-SRV02.",
    "También son SPOF todos los servidores.",
    "Internet es un SPOF."
   ],
   "errors": [
    {
     "e": "Marca como SPOF componentes redundantes.",
     "why": "Revisa cómo trabajan WEB-SRV01 y WEB-SRV02 y qué hay delante de ellos. Si uno falla, ¿el otro sigue atendiendo?"
    },
    {
     "e": "«Todos los servidores» no es un análisis.",
     "why": "Hay que justificar cada SPOF con evidencia (observaciones como «instancia principal» o «nodo principal») y con su impacto."
    },
    {
     "e": "Afirma sin verificar el inventario.",
     "why": "Revisa cuántos enlaces de Internet tiene el centro de datos antes de declararlo SPOF."
    },
    {
     "e": "Olvida la red, los terceros y las personas.",
     "why": "Firewall, balanceador, proveedor de pagos o un único administrador también pueden detener el servicio."
    }
   ],
   "checks": [
    "Cada SPOF tiene evidencia del caso y servicios afectados.",
    "Descarté lo que sí tiene redundancia.",
    "Revisé red, terceros, identidad y personas.",
    "Prioricé por la criticidad del servicio."
   ],
   "worksheet": {
    "cols": [
     "Componente",
     "¿Por qué podría ser SPOF? (evidencia)",
     "Servicios afectados",
     "Criticidad"
    ],
    "rows": 5
   },
   "tools": [
    {
     "tool": "radiografia",
     "do": "Compara los SPOF de tu caso con los de casos del mismo sector o con la misma arquitectura.",
     "trap": "Leer el gris como «sin riesgo»: significa «no evidenciado» y puede esconder un SPOF."
    },
    {
     "tool": "serie",
     "do": "Arma en el laboratorio la cadena de un servicio crítico de tu organización y duplica el componente más débil: ¿cuánto mejora?",
     "trap": "Duplicar un componente sin que las fallas sean independientes (misma energía, misma ruta, mismo proveedor)."
    },
    {
     "tool": "mapa",
     "do": "Abre en el mapa la ficha del componente sospechoso y lee «Cuando falla…».",
     "trap": "Declarar SPOF por intuición sin revisar cómo falla realmente el componente."
    }
   ],
   "tours": [
    "falla",
    "laboratorio",
    "radiografia"
   ]
  },
  {
   "id": 4,
   "title": "Métricas de disponibilidad",
   "icon": "gauge",
   "purpose": "Convertir los datos operacionales en indicadores: disponibilidad, MTTR y MTBF. Son la evidencia que justifica (o descarta) una inversión.",
   "discover": "Que cada fórmula usa un dato específico y que un buen número no siempre significa un buen servicio.",
   "case_id": "C08",
   "case_label": "C08 · ConectaPlus CX",
   "tab": "Métricas (verificador de cálculos)",
   "activities": [
    "Identifica en el caso: periodo observado, tiempo fuera de servicio, número de incidentes y tiempo de recuperación.",
    "Calcula disponibilidad, MTTR y MTBF y compruébalos en el verificador del sitio.",
    "Compara la disponibilidad con metas posibles (99 %, 99,5 %, 99,9 %).",
    "Interpreta: ¿qué significan los números para este negocio?"
   ],
   "attempt": [
    "Disponibilidad del CRM = 9,4 / 720 = 1,3 %.",
    "MTTR = 9,4 h / 13 incidentes = 0,72 h.",
    "MTBF = 720 / 13 = 55,4 h.",
    "Como el CRM casi no se cae, la operación del contact center está bien."
   ],
   "errors": [
    {
     "e": "Calcula otra cosa y la llama disponibilidad.",
     "why": "9,4 / 720 es la fracción de tiempo caído. Revisa la fórmula de disponibilidad."
    },
    {
     "e": "Usa el dato equivocado para el MTTR.",
     "why": "El caso entrega por separado el tiempo fuera de servicio y el tiempo total empleado en recuperación. ¿Cuál corresponde al MTTR?"
    },
    {
     "e": "No descuenta el tiempo caído en el MTBF.",
     "why": "El MTBF mide tiempo de operación entre fallas: ¿debe contar las horas en que el servicio estuvo caído?"
    },
    {
     "e": "Concluye solo con disponibilidad.",
     "why": "En un contact center la calidad importa: revisa el jitter de la voz en los incidentes. Un servicio «disponible» con voz entrecortada también falla."
    },
    {
     "e": "No compara con ninguna meta.",
     "why": "Un número sin referencia (SLA, meta del negocio) no permite decidir."
    }
   ],
   "checks": [
    "Usé el dato correcto en cada fórmula y comprobé el resultado en el verificador.",
    "Comparé con al menos una meta de disponibilidad.",
    "Interpreté el resultado para el negocio, no solo el número.",
    "Revisé indicadores de calidad además de la disponibilidad."
   ],
   "worksheet": {
    "cols": [
     "Indicador",
     "Datos usados",
     "Resultado",
     "¿Qué significa para el negocio?"
    ],
    "rows": 4
   },
   "tools": [
    {
     "tool": "formulas",
     "do": "Lee la ficha de cada fórmula y anota qué dato del caso va en cada parte.",
     "trap": "Memorizar la fórmula sin saber qué dato corresponde a cada término."
    },
    {
     "tool": "calc",
     "do": "Prueba los datos de tu servicio en la calculadora y luego valídalos en el verificador de tu caso.",
     "trap": "Confundir horas fuera de servicio con horas de recuperación al pasar los datos."
    },
    {
     "tool": "nueves",
     "do": "Traduce a horas por mes la meta que propondrías y compárala con la caída real.",
     "trap": "Proponer 99,99 % sin dimensionar lo que cuesta cada nueve adicional."
    }
   ],
   "tours": [
    "calculadora",
    "nueves",
    "verificador"
   ]
  },
  {
   "id": 5,
   "title": "Capacidad y proyección",
   "icon": "storage",
   "purpose": "Saber cuánto margen queda y cuándo se agota, para planear antes de la saturación. Separa los problemas de capacidad de los de gestión.",
   "discover": "Que proyectar exige cuidar las unidades y el ritmo de crecimiento, y que la capacidad no se resuelve solo comprando.",
   "case_id": "C15",
   "case_label": "C15 · Ciudad Inteligente NovaCiudad",
   "tab": "Métricas (simulador de almacenamiento) · Inventario",
   "activities": [
    "Toma la capacidad total, la usada y el crecimiento mensual.",
    "Calcula el porcentaje de ocupación y el tiempo restante hasta un umbral (por ejemplo 80 %) y hasta llenarse.",
    "Considera los factores que aceleran el crecimiento (nuevos dispositivos, sedes, retención).",
    "Distingue el promedio de los picos en CPU, latencia y conexiones."
   ],
   "attempt": [
    "El almacenamiento local está al 85 %.",
    "Crece 2,4 % mensual, así que tarda bastante en llenarse.",
    "La solución es comprar más discos."
   ],
   "errors": [
    {
     "e": "Confunde unidades.",
     "why": "Revisa si el crecimiento está expresado en porcentaje o en TB por mes. Cambia por completo la proyección."
    },
    {
     "e": "Proyecta con crecimiento constante.",
     "why": "El caso anuncia un aumento importante de dispositivos conectados: ¿el crecimiento seguirá igual?"
    },
    {
     "e": "Ignora el umbral de seguridad.",
     "why": "¿En qué ocupación conviene actuar? ¿Ya se superó?"
    },
    {
     "e": "Salta a una compra.",
     "why": "Antes de comprar hay que revisar la retención del video, el ciclo de vida de los datos y qué puede ir a almacenamiento histórico."
    }
   ],
   "checks": [
    "Revisé las unidades (TB, GB, %).",
    "Calculé el tiempo hasta el umbral y hasta llenarse.",
    "Consideré los factores que aceleran el crecimiento.",
    "Evalué opciones de gestión además de comprar."
   ],
   "worksheet": {
    "cols": [
     "Recurso",
     "Uso actual",
     "Crecimiento",
     "Tiempo hasta 80 % / 100 %"
    ],
    "rows": 4
   },
   "tools": [
    {
     "tool": "casos",
     "do": "Usa el simulador de almacenamiento de la pestaña Métricas de tu caso y las gráficas de promedio vs. pico.",
     "trap": "Mezclar TB, GB y porcentajes al proyectar."
    },
    {
     "tool": "mapa",
     "do": "Lee «Qué medir» en las fichas de almacenamiento, base de datos y servidores.",
     "trap": "Medir solo el promedio y olvidar los picos."
    }
   ],
   "tours": [
    "mapa",
    "verificador"
   ]
  },
  {
   "id": 6,
   "title": "Hallazgos y matriz de diagnóstico",
   "icon": "search",
   "purpose": "Ordenar lo encontrado en hallazgos con evidencia, impacto y criticidad. Es la base de las recomendaciones priorizadas.",
   "discover": "Que un síntoma no es un hallazgo, y que «todo es crítico» equivale a no priorizar.",
   "case_id": "C13",
   "case_label": "C13 · Grupo Empresarial Integra",
   "tab": "Métricas · Incidentes · Inventario",
   "activities": [
    "Redacta cada hallazgo como una condición verificable.",
    "Asocia una evidencia concreta del caso (dato, incidente, práctica).",
    "Describe el impacto y asigna una criticidad diferenciada.",
    "Clasifica su naturaleza: capacidad, disponibilidad, operación, seguridad, gobierno o monitoreo."
   ],
   "attempt": [
    "Hallazgo: el sistema es lento. Evidencia: los usuarios se quejan. Criticidad: alta. Recomendación: comprar servidores nuevos.",
    "Hallazgo: no hay monitoreo. Evidencia: —. Criticidad: alta. Recomendación: instalar una herramienta de monitoreo."
   ],
   "errors": [
    {
     "e": "Describe un síntoma, no un hallazgo.",
     "why": "«Es lento» no dice qué componente, cuándo ni cuánto. Busca qué se observó en el servidor durante las quejas."
    },
    {
     "e": "Evidencia anecdótica o vacía.",
     "why": "El caso trae datos parciales (tickets, registros, CPU observada, uso de la base de datos). Úsalos y declara lo que falta."
    },
    {
     "e": "Todo es «alta».",
     "why": "Sin criticidad diferenciada no hay priorización."
    },
    {
     "e": "La recomendación contradice una restricción.",
     "why": "La empresa no autoriza renovación masiva sin evidencia: ¿qué debe venir primero?"
    },
    {
     "e": "No clasifica la naturaleza del hallazgo.",
     "why": "Un problema de monitoreo o de gobierno no se resuelve con hardware."
    }
   ],
   "checks": [
    "Cada hallazgo es verificable y tiene evidencia.",
    "La criticidad está diferenciada.",
    "Clasifiqué la naturaleza de cada hallazgo.",
    "Las recomendaciones respetan las restricciones."
   ],
   "worksheet": {
    "cols": [
     "Hallazgo",
     "Evidencia",
     "Impacto",
     "Criticidad",
     "Naturaleza"
    ],
    "rows": 6
   },
   "tools": [
    {
     "tool": "radiografia",
     "do": "Revisa la calidad de la evidencia de tu caso y declara qué información falta para cada hallazgo.",
     "trap": "Presentar estimaciones o datos parciales como si fueran completos."
    },
    {
     "tool": "exposicion",
     "do": "Contrasta tus hallazgos con las dimensiones más altas de tu caso: ¿te falta revisar alguna?",
     "trap": "Inventar hallazgos para «llenar» una dimensión sin evidencia."
    }
   ],
   "tours": [
    "radiografia",
    "exposicion"
   ]
  },
  {
   "id": 7,
   "title": "Gobierno: ITIL, COBIT e ISO/IEC 27001",
   "icon": "ticket",
   "purpose": "Relacionar los problemas con prácticas de gestión (ITIL), decisiones de gobierno con responsables (COBIT) y riesgos de seguridad (ISO/IEC 27001). Muchos problemas no son tecnológicos.",
   "discover": "Que una herramienta no es una práctica, que cada decisión necesita un responsable claro y que amenaza y vulnerabilidad no son lo mismo.",
   "case_id": "C14",
   "case_label": "C14 · Corporación Horizonte",
   "tab": "Incidentes (clasificación ITIL · COBIT · ISO) · Tutor IA (biblioteca)",
   "activities": [
    "ITIL: situación → práctica aplicable → acción → beneficio.",
    "COBIT: problema → decisión de gobierno → responsable (RACI) → indicador.",
    "ISO/IEC 27001: activo → amenaza → vulnerabilidad → impacto → control.",
    "Consulta las fichas de la biblioteca de conocimiento del sitio."
   ],
   "attempt": [
    "ITIL: instalar una herramienta de tickets única resuelve los problemas.",
    "COBIT: el CIO es responsable de todas las decisiones.",
    "ISO 27001: Activo: ERP. Amenaza: no hay MFA. Vulnerabilidad: hackers. Impacto: alto."
   ],
   "errors": [
    {
     "e": "Confunde herramienta con práctica.",
     "why": "El caso ya tiene tres herramientas de tickets. Sin proceso, roles y criterios comunes, una cuarta no cambia nada."
    },
    {
     "e": "Un solo responsable de todo.",
     "why": "En una matriz RACI cada decisión tiene un único «A», pero distintas decisiones pueden tener responsables distintos (filiales, infraestructura, seguridad)."
    },
    {
     "e": "Invierte amenaza y vulnerabilidad.",
     "why": "La vulnerabilidad es la debilidad propia; la amenaza es lo que puede explotarla."
    },
    {
     "e": "Impacto sin consecuencia.",
     "why": "«Alto» no dice qué pasaría: acceso indebido, fraude, interrupción del ERP…"
    },
    {
     "e": "Ignora una restricción de gobierno.",
     "why": "Las filiales conservan autonomía y se piden procesos simples."
    }
   ],
   "checks": [
    "Cada acción ITIL es una práctica con proceso y roles.",
    "Cada decisión COBIT tiene un único responsable que rinde cuentas y un indicador.",
    "Los riesgos ISO distinguen amenaza, vulnerabilidad e impacto.",
    "Respeté las restricciones de gobierno del caso."
   ],
   "worksheet": {
    "cols": [
     "Situación / riesgo",
     "Marco y práctica / objetivo / control",
     "Responsable",
     "Indicador"
    ],
    "rows": 5
   },
   "tools": [
    {
     "tool": "casos",
     "do": "Clasifica los incidentes de tu caso con práctica ITIL, objetivo COBIT y control ISO, y consulta las fichas en la biblioteca del Tutor IA.",
     "trap": "Elegir un control o una práctica por el nombre, sin leer su ficha."
    }
   ],
   "tours": [
    "incidentes",
    "tutor"
   ]
  },
  {
   "id": 8,
   "title": "Business Motivation Model (BMM)",
   "icon": "compass",
   "purpose": "Conectar el porqué del negocio (fines) con el cómo (medios), considerando influenciadores y su evaluación. Justifica cada decisión de infraestructura desde un objetivo.",
   "discover": "Que una meta no es un objetivo, que una táctica debe lograr un objetivo medible y que las restricciones son influenciadores.",
   "case_id": "C05",
   "case_label": "C05 · Industria Andina SmartPlant",
   "tab": "BMM (constructor paso a paso)",
   "activities": [
    "Clasifica los influenciadores (interno o externo, categoría).",
    "Evalúa con DOFA.",
    "Redacta metas cualitativas y objetivos SMART ligados a servicios críticos.",
    "Define estrategias y tácticas con su marco de referencia; revisa la coherencia en el mapa."
   ],
   "attempt": [
    "Meta: disponibilidad del MES de 99,9 %.",
    "Objetivo: mejorar la planta.",
    "Táctica: comprar un MES nuevo.",
    "Influenciador: «incidentes recurrentes» — externo."
   ],
   "errors": [
    {
     "e": "Meta y objetivo invertidos.",
     "why": "La meta es cualitativa y de largo plazo; el objetivo es medible, con indicador, valor y plazo."
    },
    {
     "e": "Objetivo vago.",
     "why": "«Mejorar la planta» no se puede medir ni verificar."
    },
    {
     "e": "La táctica viola una restricción.",
     "why": "Revisa si los sistemas industriales pueden reemplazarse en este corte."
    },
    {
     "e": "Influenciador mal clasificado.",
     "why": "¿Los incidentes recurrentes vienen del entorno o de la propia organización?"
    },
    {
     "e": "Táctica sin vínculo ni marco.",
     "why": "Cada táctica debe lograr un objetivo e implementarse con una práctica o un control reconocido."
    }
   ],
   "checks": [
    "Las metas son cualitativas y los objetivos son SMART.",
    "Cada objetivo se liga a un servicio crítico.",
    "Cada táctica logra un objetivo, implementa una estrategia y tiene marco.",
    "Las tácticas respetan los influenciadores y restricciones."
   ],
   "worksheet": {
    "cols": [
     "Meta",
     "Objetivo (KPI · valor · plazo)",
     "Táctica",
     "Marco de referencia"
    ],
    "rows": 4
   },
   "tools": [
    {
     "tool": "casos",
     "do": "Construye el BMM de tu caso paso a paso con el banco de evidencias.",
     "trap": "Copiar textos del banco sin redactarlos ni conectarlos con un objetivo."
    }
   ],
   "tours": [
    "bmm"
   ]
  },
  {
   "id": 9,
   "title": "Alternativas y matriz de decisión",
   "icon": "puzzle",
   "purpose": "Formular varias alternativas realmente distintas y compararlas con criterios explícitos. La decisión se vuelve defendible y revisable.",
   "discover": "Que dos variantes de la misma idea no son alternativas, y que los pesos se fijan antes de puntuar.",
   "case_id": "C10",
   "case_label": "C10 · NubeGestión Labs",
   "tab": "Alternativas · Matriz de decisión · Laboratorio serie/paralelo",
   "activities": [
    "Formula al menos tres alternativas diferentes (conservadora, intermedia, transformadora).",
    "Indica qué SPOF o hallazgo ataca cada una y qué riesgo nuevo introduce.",
    "Define criterios y pesos antes de puntuar.",
    "Haz un análisis de sensibilidad: ¿cambia la decisión si cambian los pesos?"
   ],
   "attempt": [
    "Alternativa A: subir las VM a 16 vCPU.",
    "Alternativa B: subir las VM a 32 vCPU.",
    "Alternativa C: salir de la nube a un centro de datos propio.",
    "Matriz: impacto 70 %, costo 10 %, complejidad 10 %, tiempo 10 %. Gana B con 4,8."
   ],
   "errors": [
    {
     "e": "A y B son la misma alternativa.",
     "why": "Ambas son escalamiento vertical; solo cambia el tamaño."
    },
    {
     "e": "C viola una restricción.",
     "why": "Revisa qué dice el caso sobre abandonar la nube."
    },
    {
     "e": "Pesos acomodados.",
     "why": "Un peso de costo tan bajo en un caso donde el costo creció más que los clientes sugiere pesos ajustados para que gane una opción."
    },
    {
     "e": "No ataca los SPOF ni los hallazgos.",
     "why": "¿Qué pasa con la autenticación de instancia única y la región única?"
    },
    {
     "e": "Sin análisis de sensibilidad.",
     "why": "Si un cambio pequeño de pesos cambia la decisión, hay que explicarlo."
    }
   ],
   "checks": [
    "Mis alternativas son distintas entre sí.",
    "Cada una ataca un SPOF o hallazgo concreto y declara su riesgo nuevo.",
    "Fijé los pesos antes de puntuar y los justifiqué.",
    "Hice análisis de sensibilidad."
   ],
   "worksheet": {
    "cols": [
     "Alternativa",
     "Qué ataca",
     "Riesgo nuevo",
     "Costo relativo",
     "Puntaje"
    ],
    "rows": 3
   },
   "tools": [
    {
     "tool": "catalogo",
     "do": "Filtra el catálogo, lee pros, contras y preguntas críticas, y ubica tus alternativas en el gráfico costo vs. complejidad.",
     "trap": "Escoger la ficha que «suena mejor»: ninguna dice cuál es la correcta y varias candidatas no aplican a tu caso."
    },
    {
     "tool": "serie",
     "do": "Estima en el laboratorio cómo cambia la disponibilidad del servicio con cada alternativa.",
     "trap": "Usar las disponibilidades de referencia del laboratorio como si fueran datos del caso."
    }
   ],
   "tours": [
    "catalogo",
    "matriz",
    "laboratorio"
   ]
  },
  {
   "id": 10,
   "title": "Estrategia, CAPEX/OPEX y recomendación final",
   "icon": "target",
   "purpose": "Integrar todo en una recomendación priorizada, con su costo, una hoja de ruta por fases y las métricas que demostrarán el resultado.",
   "discover": "Que «lo moderno» no es un argumento, que OPEX también cuesta y que sin métricas no se puede demostrar el éxito.",
   "case_id": "C11",
   "case_label": "C11 · Banco Capital Andino",
   "tab": "Retos · Matriz de decisión (exportar informe) · Tutor IA",
   "activities": [
    "Elige la estrategia (on-premise, nube, híbrida, edge) con base en evidencia.",
    "Clasifica las inversiones en CAPEX u OPEX y compáralas en costo total.",
    "Propón una hoja de ruta por fases (corto, mediano y largo plazo).",
    "Define métricas de éxito y responsables; pide retroalimentación al Tutor IA."
   ],
   "attempt": [
    "Recomendamos migrar todo a la nube este semestre, porque la nube es más moderna y barata.",
    "Como es OPEX, no requiere inversión."
   ],
   "errors": [
    {
     "e": "Contradice las restricciones.",
     "why": "Revisa qué dice el caso sobre el core bancario y sobre una migración total sin análisis."
    },
    {
     "e": "Argumento sin evidencia.",
     "why": "«Moderna y barata» no es un dato del caso. ¿Qué problema concreto resuelve y con qué evidencia?"
    },
    {
     "e": "Confunde OPEX con «sin costo».",
     "why": "El OPEX es un gasto recurrente; hay que comparar el costo total en el tiempo."
    },
    {
     "e": "Sin fases ni métricas.",
     "why": "Una recomendación necesita hoja de ruta, responsables y los indicadores que demostrarán el resultado."
    },
    {
     "e": "Ignora la regulación y la sensibilidad de los datos.",
     "why": "En banca, la información financiera y el control de cambios condicionan cualquier estrategia."
    }
   ],
   "checks": [
    "La estrategia responde a problemas con evidencia.",
    "Comparé el costo total (CAPEX y OPEX).",
    "Hay hoja de ruta por fases con responsables.",
    "Cada recomendación tiene su métrica de éxito."
   ],
   "worksheet": {
    "cols": [
     "Fase",
     "Acción",
     "CAPEX / OPEX",
     "Responsable",
     "Métrica de éxito"
    ],
    "rows": 4
   },
   "tools": [
    {
     "tool": "catalogo",
     "do": "Usa el costo, la complejidad y el plazo de las fichas para clasificar CAPEX/OPEX y ordenar la hoja de ruta.",
     "trap": "Tomar el costo relativo (1 a 5) como un costo real en dinero."
    },
    {
     "tool": "nueves",
     "do": "Fija el SLA de tu recomendación en horas permitidas y compáralo con la cadena del laboratorio.",
     "trap": "Prometer un SLA que la arquitectura propuesta no puede sostener."
    },
    {
     "tool": "serie",
     "do": "Comprueba que la cadena con tu alternativa recomendada alcanza la meta.",
     "trap": "Recomendar sin verificar el efecto sobre el servicio crítico."
    }
   ],
   "tours": [
    "nueves",
    "matriz",
    "tutor"
   ]
  }
 ],
 "toolkit": [
  {
   "id": "mapa",
   "name": "02 · Mapa de infraestructura de referencia",
   "anchor": "#mapa",
   "steps": [
    2,
    3,
    5
   ],
   "what": "Cada componente explicado: qué es, cómo funciona, cuándo falla y qué medir.",
   "use": "Comparar la arquitectura de tu caso con una de referencia y entender cómo falla cada pieza."
  },
  {
   "id": "formulas",
   "name": "03 · El lenguaje de la disponibilidad (fórmulas)",
   "anchor": "#formula-grid",
   "steps": [
    4,
    5
   ],
   "what": "Disponibilidad, MTTR, MTBF, serie, paralelo y RTO/RPO con ejemplo.",
   "use": "Saber qué dato va en cada fórmula antes de calcular."
  },
  {
   "id": "calc",
   "name": "03 · Calculadora de disponibilidad",
   "anchor": "#lab-disponibilidad",
   "steps": [
    4
   ],
   "what": "Calcula disponibilidad, caída media, MTBF y caída anual a partir de horas e incidentes.",
   "use": "Explorar cómo cambian los indicadores; luego validar en el verificador de tu caso."
  },
  {
   "id": "nueves",
   "name": "03 · ¿Cuánto es un «nueve»?",
   "anchor": "#lab-nueves",
   "steps": [
    4,
    10
   ],
   "what": "Traduce un porcentaje de disponibilidad a horas y minutos de caída permitida.",
   "use": "Proponer metas y SLA realistas y entender el costo de cada nueve adicional."
  },
  {
   "id": "serie",
   "name": "03 · Laboratorio: componentes en serie vs. en paralelo",
   "anchor": "#lab-serie",
   "steps": [
    3,
    9,
    10
   ],
   "what": "Arma la cadena de un servicio de tu organización, pondera la criticidad y simula redundancia.",
   "use": "Ver el eslabón más débil y estimar el efecto de una alternativa sobre la disponibilidad."
  },
  {
   "id": "casos",
   "name": "04 · Casos de estudio (espacio de trabajo)",
   "anchor": "#casos",
   "steps": [
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10
   ],
   "what": "Las 15 organizaciones; cada una abre expediente, inventario, arquitectura, métricas, incidentes, BMM, retos, alternativas, matriz y tutor.",
   "use": "Trabajar todas las etapas sobre tu caso y consultar el caso de ejemplo de cada etapa."
  },
  {
   "id": "radiografia",
   "name": "04 · Radiografía comparativa (SPOF y evidencia)",
   "anchor": "#radiografia",
   "steps": [
    3,
    6
   ],
   "what": "Mapas de calor que comparan los 15 casos: puntos únicos de falla y calidad de la evidencia.",
   "use": "Ubicar tu caso frente a los demás y detectar SPOF o vacíos de evidencia que te falte revisar."
  },
  {
   "id": "exposicion",
   "name": "04 · Índice de exposición por dimensión",
   "anchor": "#exposicion",
   "steps": [
    1,
    6
   ],
   "what": "Frecuencia de señales de riesgo (continuidad, seguridad, capacidad, conectividad, proveedores, gobierno) en cada expediente.",
   "use": "Formular hipótesis sobre dónde buscar hallazgos (no es un diagnóstico)."
  },
  {
   "id": "catalogo",
   "name": "05 · Caja de herramientas: catálogo de alternativas",
   "anchor": "#alternativas",
   "steps": [
    9,
    10
   ],
   "what": "Patrones de solución con pros, contras, costo, complejidad, plazo y preguntas críticas, más el gráfico costo vs. complejidad.",
   "use": "Construir y comparar alternativas propias; ninguna ficha dice cuál es la correcta."
  }
 ],
 "tours": [
  {
   "id": "recorrido",
   "title": "Recorrido general de InfraLab",
   "minutes": 4,
   "group": "Conoce la plataforma",
   "case": "Todo el sitio",
   "purpose": "Conocer las secciones del sitio y para qué sirve cada una antes de trabajar tu caso.",
   "find": "El sitio tiene una ruta de trabajo, herramientas para entender y medir, el espacio de trabajo de cada caso, comparaciones entre casos y un catálogo de alternativas.",
   "yours": "Sigue con el próximo ejercicio del recorrido completo; cada uno profundiza en una de estas secciones.",
   "steps": [
    {
     "t": "Bienvenido a InfraLab. Con el menú superior puedes saltar a cualquier sección en cualquier momento.",
     "target": "#nav",
     "before": [
      [
       "closeWs"
      ]
     ]
    },
    {
     "t": "La «Ruta del taller» resume las cinco etapas del análisis. Toca una etapa para ver qué se espera.",
     "target": "#steps",
     "check": [
      "modal"
     ]
    },
    {
     "t": "Cierra la ficha con la ✕.",
     "target": ".modal-x",
     "check": [
      "noModal"
     ]
    },
    {
     "t": "02 · Componentes: un mapa de infraestructura con la ficha de cada pieza.",
     "target": "#ref-map"
    },
    {
     "t": "03 · Métricas: fórmulas, calculadora, «nueves» y el laboratorio serie/paralelo.",
     "target": "#formula-grid"
    },
    {
     "t": "04 · Casos: las 15 organizaciones. Cada tarjeta abre un espacio de trabajo con diez pestañas.",
     "target": "#case-grid"
    },
    {
     "t": "Radiografía comparativa: compara puntos únicos de falla y calidad de la evidencia de los 15 casos.",
     "target": "#radiografia"
    },
    {
     "t": "05 · Caja de herramientas: patrones de solución con pros, contras, costo y complejidad.",
     "target": "#pattern-grid"
    },
    {
     "t": "06 · Taller guiado: aquí están todos los ejercicios y las diez etapas para trabajar tu caso.",
     "target": "#guide-tours"
    }
   ]
  },
  {
   "id": "casos",
   "title": "Encontrar y abrir un caso",
   "minutes": 2,
   "group": "Conoce la plataforma",
   "case": "Casos de estudio",
   "purpose": "Aprender a filtrar, buscar y abrir el espacio de trabajo de un caso.",
   "find": "Cada caso abre un espacio de trabajo con diez pestañas: expediente, inventario, arquitectura, métricas, incidentes, BMM, retos, alternativas, matriz y tutor.",
   "yours": "Busca y abre tu caso asignado; recorre sus pestañas.",
   "steps": [
    {
     "t": "Filtra por sector: toca «Salud».",
     "target": "#sector-chips",
     "check": [
      "sectorFilter",
      "Salud"
     ],
     "before": [
      [
       "closeWs"
      ]
     ]
    },
    {
     "t": "Vuelve a «Todos».",
     "target": "#sector-chips",
     "check": [
      "sectorFilter",
      "Todos"
     ]
    },
    {
     "t": "Escribe «WMS» en el buscador: también busca por sistemas y componentes.",
     "target": "#case-search",
     "check": [
      "searchHas",
      "wms"
     ]
    },
    {
     "t": "Abre el caso que aparece.",
     "target": "#case-grid",
     "check": [
      "hashPrefix",
      "#caso/"
     ]
    },
    {
     "t": "Este es el espacio de trabajo. Las pestañas de arriba organizan todo el análisis del caso.",
     "target": ".ws-tabs"
    }
   ]
  },
  {
   "id": "mapa",
   "title": "Mapa de componentes: cómo funciona y cómo falla cada pieza",
   "minutes": 3,
   "tool": "mapa",
   "case": "Mapa de referencia",
   "purpose": "Aprender a leer la ficha de un componente: qué es, cómo funciona, cómo falla y qué medir.",
   "find": "Cada componente tiene modos de falla típicos y métricas propias; un componente único que todo el tráfico atraviesa suele ser un punto único de falla.",
   "yours": "Abre las fichas de los componentes que aparecen en el inventario de tu caso y anota cómo fallarían allí y qué medirías.",
   "steps": [
    {
     "t": "Toca el Firewall en el mapa.",
     "target": "#ref-map [data-comp=firewall]",
     "check": [
      "modal",
      "Firewall"
     ],
     "before": [
      [
       "closeWs"
      ],
      [
       "scroll",
       "#mapa"
      ]
     ]
    },
    {
     "t": "Mira «¿Cómo funciona?» (el paquete recorre el flujo) y lee «Cuando falla…»: con un solo firewall se corta todo el acceso externo.",
     "target": ".modal-card .flow"
    },
    {
     "t": "Cierra la ficha con la ✕.",
     "target": ".modal-x",
     "check": [
      "noModal"
     ]
    },
    {
     "t": "Abre ahora Backup y lee «Qué medir»: RPO, RTO y porcentaje de tareas exitosas.",
     "target": "#ref-map [data-comp=backup]",
     "check": [
      "modal",
      "Backup"
     ]
    }
   ],
   "group": "Herramientas de análisis"
  },
  {
   "id": "calculadora",
   "title": "Calculadora de disponibilidad",
   "minutes": 3,
   "tool": "calc",
   "case": "Servicio ficticio de práctica",
   "purpose": "Ver cómo se relacionan las horas caídas, los incidentes, la disponibilidad y el MTBF.",
   "find": "Unas pocas horas de caída al mes bajan mucho la disponibilidad; para 99,9 % solo se permiten 0,72 h de caída en 720 h.",
   "yours": "En la pestaña Métricas de tu caso calcula tus indicadores y valídalos en el verificador. La calculadora estima el MTTR con caída ÷ incidentes; tu caso trae el tiempo real de recuperación.",
   "steps": [
    {
     "t": "La ventana queda en 720 h (un mes). Escribe 14.4 en «Horas fuera de servicio» (servicio ficticio de práctica; según tu navegador puede ser 14,4).",
     "target": "#av-down",
     "check": [
      "input",
      "#av-down",
      14.4
     ],
     "before": [
      [
       "closeWs"
      ],
      [
       "scroll",
       "#lab-disponibilidad"
      ]
     ]
    },
    {
     "t": "Escribe 6 en «Nº de incidentes».",
     "target": "#av-inc",
     "check": [
      "input",
      "#av-inc",
      6
     ]
    },
    {
     "t": "Lee los resultados: disponibilidad, caída media por incidente, MTBF y caída proyectada al año. En rojo: por debajo de 99 %.",
     "target": "#av-out"
    },
    {
     "t": "Ahora escribe 0.72 (o 0,72) en horas fuera de servicio. Esa es la caída máxima mensual para llegar a 99,9 %.",
     "target": "#av-down",
     "check": [
      "input",
      "#av-down",
      0.72
     ]
    }
   ],
   "group": "Herramientas de análisis"
  },
  {
   "id": "nueves",
   "title": "¿Cuánto es un «nueve»?",
   "minutes": 3,
   "group": "Herramientas de análisis",
   "case": "Metas de disponibilidad",
   "purpose": "Traducir un porcentaje de disponibilidad a tiempo real de caída y entender por qué cada «nueve» importa.",
   "find": "Con 70 % el servicio estaría caído cerca de 110 días al año (1 de cada 3 días); con 99,9 %, menos de 9 horas al año. Cada nueve adicional reduce la caída diez veces y cuesta mucho más.",
   "yours": "Decide qué meta es razonable para el servicio crítico de tu caso y justifícala con su impacto en el negocio.",
   "steps": [
    {
     "t": "Toca el botón «70 %».",
     "target": "#nines-presets",
     "check": [
      "ninesAv",
      69.9,
      70.1
     ],
     "before": [
      [
       "closeWs"
      ]
     ]
    },
    {
     "t": "Lee la frase: ¿cuántos días al año podría estar caído? ¿Cada cuántos días fallaría?",
     "target": "#nines-say"
    },
    {
     "t": "Toca «90 %».",
     "target": "#nines-presets",
     "check": [
      "ninesAv",
      89.9,
      90.1
     ]
    },
    {
     "t": "Toca «99 %»: ya no son días al año sino horas.",
     "target": "#nines-presets",
     "check": [
      "ninesAv",
      98.99,
      99.01
     ]
    },
    {
     "t": "Toca «99,9 %»: menos de 9 horas al año.",
     "target": "#nines-presets",
     "check": [
      "ninesAv",
      99.89,
      99.91
     ]
    },
    {
     "t": "Compara en el gráfico: cada nueve reduce diez veces la caída permitida.",
     "target": "#chart-nines"
    }
   ]
  },
  {
   "id": "laboratorio",
   "title": "Laboratorio: componentes en serie y en paralelo",
   "minutes": 8,
   "tool": "serie",
   "case": "C07 · TransLogica Express",
   "purpose": "Entender por qué un servicio que depende de varios componentes «en serie» es menos disponible que cada uno de ellos, y cómo la redundancia «en paralelo» lo mejora.",
   "find": "La disponibilidad del servicio siempre queda por debajo de la de su componente más débil; duplicar el eslabón más débil mejora más que duplicar uno fuerte; la criticidad muestra dónde se concentra el riesgo.",
   "yours": "Elige tu organización y uno de sus servicios críticos. Arma su cadena con los componentes de los que depende, identifica el eslabón más débil y prueba la redundancia. Las disponibilidades son valores de referencia: ajústalas con la evidencia de tu caso y justifícalas.",
   "steps": [
    {
     "t": "En «Organización», elige C07 · TransLogica Express.",
     "target": "#lab-case",
     "check": [
      "labCase",
      "C07"
     ],
     "before": [
      [
       "closeWs"
      ],
      [
       "scroll",
       "#lab-serie"
      ]
     ]
    },
    {
     "t": "En «Servicio a analizar», elige «WMS - Gestión de bodegas». Mira la nota: TI lo informa como Crítico, por eso su importancia queda en 5.",
     "target": "#lab-service",
     "check": [
      "labService",
      "WMS"
     ]
    },
    {
     "t": "Pulsa «+ componente en serie». Aparece el primer componente: algo de lo que el WMS depende para funcionar. (Si ya había componentes de un intento anterior, pulsa primero «Vaciar cadena»).",
     "target": "#chain-add",
     "check": [
      "labCount",
      1
     ]
    },
    {
     "t": "En «Activo / componente» del componente 1 elige «WMS-SRV01 — Gestión de bodegas»: el servidor que ejecuta el WMS.",
     "target": "#chain [data-i='0'] [data-k=asset]",
     "check": [
      "labHas",
      "s:WMS-SRV01"
     ]
    },
    {
     "t": "Pulsa de nuevo «+ componente en serie» y, en el componente nuevo, elige «DB-SRV01 — Base operacional»: el WMS no funciona sin su base de datos.",
     "target": "#chain-add",
     "check": [
      "labHas",
      "s:DB-SRV01"
     ]
    },
    {
     "t": "Agrega un tercer componente y elige «Red WAN / enlaces» (en «Componentes genéricos»): los centros regionales llegan al WMS por un único enlace.",
     "target": "#chain-add",
     "check": [
      "labHas",
      "g:wan"
     ]
    },
    {
     "t": "Observa los resultados: la disponibilidad del servicio es MENOR que la de cada componente. Eso es la disponibilidad en serie: basta con que falle uno para que el servicio caiga. ¿Cuál es el eslabón más débil?",
     "target": "#chain-out"
    },
    {
     "t": "Cambia la «Criticidad para el servicio» del enlace WAN a «5 · Crítica» y mira el gráfico de riesgo ponderado: ¿qué componente concentra el riesgo?",
     "target": "#chain [data-i='2'] [data-k=w]",
     "check": [
      "labCrit",
      "g:wan",
      5
     ]
    },
    {
     "t": "Ahora el paralelo: en el enlace WAN pulsa «+» junto a «En paralelo» para simular un segundo enlace redundante. Mira cuánto sube la disponibilidad.",
     "target": "#chain [data-i='2'] .rep",
     "check": [
      "labParallel",
      "g:wan",
      2
     ]
    },
    {
     "t": "Compara antes y después: duplicar el eslabón más débil mejora mucho más que duplicar uno fuerte. Ojo: solo vale si las fallas son independientes (otro operador, otra ruta física).",
     "target": "#chain-out"
    }
   ],
   "group": "Herramientas de análisis"
  },
  {
   "id": "expediente",
   "title": "Expediente, inventario y redundancia",
   "minutes": 4,
   "group": "Espacio de trabajo del caso",
   "case": "C09 · Clínica VidaPlena",
   "purpose": "Saber dónde está la información oficial del caso y cómo leer el inventario.",
   "find": "El expediente trae los hechos con sus términos explicados; el inventario muestra servidores, almacenamiento, backup, red, seguridad y equipo; la observación de cada servidor da pistas de SPOF.",
   "yours": "Lee el expediente y el inventario de tu caso, identifica qué componentes son únicos y cuáles tienen respaldo, y define qué información de la instalación necesitarías para clasificar su Tier.",
   "steps": [
    {
     "t": "Este es el expediente: fichas con la información oficial del caso.",
     "target": ".chunks",
     "before": [
      [
       "openCase",
       "C09",
       "expediente"
      ]
     ]
    },
    {
     "t": "Las palabras subrayadas son términos técnicos: pasa el cursor o tócalas para ver su definición.",
     "target": ".chunk .term",
     "check": [
      "termTip"
     ]
    },
    {
     "t": "Ve a la pestaña «Inventario».",
     "target": ".ws-tab[data-tab=inventario]",
     "check": [
      "tab",
      "inventario"
     ]
    },
    {
     "t": "Revisa la tabla de servidores: la columna «Observación» da pistas como «instancia principal» o «nodo principal».",
     "target": ".rubric.inv"
    },
    {
     "t": "En redundancia de la arquitectura TI, elige el nivel que mejor describe la situación actual según el inventario. Es tu criterio: no hay respuesta automática.",
     "target": "[data-tier=actual]",
     "check": [
      "tierSet"
     ]
    }
   ]
  },
  {
   "id": "falla",
   "title": "Simulador de fallas en cascada",
   "minutes": 4,
   "tool": "casos",
   "case": "C04 · Comercial NovaRetail",
   "purpose": "Ver qué servicios y usuarios se afectan cuando falla un componente, para priorizar los puntos únicos de falla.",
   "find": "Una base de datos de nodo único tumba casi todos los servicios; un tercero también puede detener la operación. El simulador no modela redundancia: si un componente tiene respaldo (como WEB-SRV01/02), interprétalo tú.",
   "yours": "En tu caso, simula la falla de cada componente marcado con «!» y de los que sospeches. Ordénalos por impacto.",
   "steps": [
    {
     "t": "Abre el caso C04 · Retail con demanda pico.",
     "target": ".case-card[data-open-case=C04]",
     "check": [
      "hash",
      "#caso/C04"
     ],
     "before": [
      [
       "closeWs"
      ],
      [
       "resetCases"
      ],
      [
       "scroll",
       "#casos"
      ]
     ]
    },
    {
     "t": "Ve a la pestaña «Arquitectura».",
     "target": ".ws-tab[data-tab=arquitectura]",
     "check": [
      "tab",
      "arquitectura"
     ]
    },
    {
     "t": "Activa «Simular falla».",
     "target": "#g-mode [data-mode=fail]",
     "check": [
      "simMode"
     ]
    },
    {
     "t": "Haz clic en el nodo DB-SRV01 (PostgreSQL).",
     "target": ".g-node[data-n=db]",
     "check": [
      "simNode",
      "db"
     ]
    },
    {
     "t": "Lee el resultado: cuántos servicios y actores caen. Por eso una base de datos de nodo único es un SPOF crítico.",
     "target": "#sim-out"
    },
    {
     "t": "Ahora haz clic en «Proveedor de pagos» (un tercero) y compara su impacto.",
     "target": ".g-node[data-n=gw]",
     "check": [
      "simNode",
      "gw"
     ]
    }
   ],
   "group": "Espacio de trabajo del caso"
  },
  {
   "id": "verificador",
   "title": "Verificador de cálculos",
   "minutes": 3,
   "tool": "casos",
   "case": "C08 · ConectaPlus CX",
   "purpose": "Practicar el cálculo de disponibilidad y MTTR con datos reales y recibir validación sin que el sitio revele el resultado.",
   "find": "El verificador solo dice si tu resultado es correcto y te avisa si usaste un dato equivocado (por ejemplo, horas caídas en lugar de horas de recuperación).",
   "yours": "Calcula los indicadores de tu caso en su pestaña Métricas y verifícalos uno por uno.",
   "steps": [
    {
     "t": "En «Disponibilidad» escribe 98 (un valor de prueba) y pulsa «Verificar».",
     "target": ".calc-row[data-calc=av]",
     "check": [
      "calcTried",
      "av"
     ],
     "before": [
      [
       "openCase",
       "C08",
       "metricas"
      ]
     ]
    },
    {
     "t": "Pulsa el botón 💡 para ver la fórmula.",
     "target": ".calc-row[data-calc=av] [data-hint]",
     "check": [
      "hintOpen",
      "av"
     ]
    },
    {
     "t": "Toma de las tarjetas superiores el periodo y el tiempo fuera de servicio, aplica la fórmula y verifica hasta obtener «¡Correcto!».",
     "target": ".calc-row[data-calc=av]",
     "check": [
      "calcOk",
      "av"
     ]
    },
    {
     "t": "Haz lo mismo con el MTTR. Si aparece una advertencia amarilla, lee la pista: estás usando un dato equivocado.",
     "target": ".calc-row[data-calc=mttr]",
     "check": [
      "calcOk",
      "mttr"
     ]
    }
   ],
   "group": "Espacio de trabajo del caso"
  },
  {
   "id": "incidentes",
   "title": "Incidentes: ITIL, COBIT e ISO/IEC 27001",
   "minutes": 3,
   "group": "Espacio de trabajo del caso",
   "case": "C01 · MedNova IPS",
   "purpose": "Relacionar cada incidente con la práctica, el objetivo de gobierno y el control que ayudarían a evitarlo.",
   "find": "Un mismo incidente puede leerse desde la gestión de servicios (ITIL), el gobierno (COBIT) y la seguridad (ISO 27001).",
   "yours": "Clasifica los incidentes de tu caso y pide al Tutor IA que revise tu clasificación.",
   "steps": [
    {
     "t": "El gráfico muestra la duración de los incidentes; los que no aparecen no tienen duración documentada.",
     "target": "#ch-inc",
     "before": [
      [
       "openCase",
       "C01",
       "incidentes"
      ]
     ]
    },
    {
     "t": "Para el incidente A elige la práctica ITIL que más ayudaría a evitarlo o gestionarlo.",
     "target": "select[data-inc=A][data-fw=itil]",
     "check": [
      "incSel",
      "A",
      "itil"
     ]
    },
    {
     "t": "Elige ahora el objetivo COBIT.",
     "target": "select[data-inc=A][data-fw=cobit]",
     "check": [
      "incSel",
      "A",
      "cobit"
     ]
    },
    {
     "t": "Y el control de ISO/IEC 27001.",
     "target": "select[data-inc=A][data-fw=iso]",
     "check": [
      "incSel",
      "A",
      "iso"
     ]
    }
   ]
  },
  {
   "id": "bmm",
   "title": "Construir el BMM paso a paso",
   "minutes": 6,
   "group": "Espacio de trabajo del caso",
   "case": "C05 · Industria Andina SmartPlant",
   "purpose": "Conocer el constructor del Business Motivation Model y su banco de evidencias.",
   "find": "El BMM se arma en seis pasos; el banco de evidencias trae los hechos del caso y los constructores te ayudan a redactar metas, objetivos y tácticas.",
   "yours": "Construye el BMM de tu caso completo y revisa la coherencia en el paso 6.",
   "steps": [
    {
     "t": "El BMM se construye en seis pasos. Empiezas por los influenciadores.",
     "target": ".stepper",
     "before": [
      [
       "openCase",
       "C05",
       "bmm"
      ],
      [
       "click",
       ".stp[data-step='0']"
      ]
     ]
    },
    {
     "t": "Marca si el primer influenciador es «Interno» o «Externo».",
     "target": ".infl2-row .seg",
     "check": [
      "bmmInfl",
      "C05"
     ]
    },
    {
     "t": "Pasa al paso 2 · Evaluación DOFA.",
     "target": ".stp[data-step='1']",
     "check": [
      "bmmStep",
      1
     ]
    },
    {
     "t": "En el banco de la derecha, clasifica un influenciador con F, D, O o A.",
     "target": ".bank-list",
     "check": [
      "bmmDofa",
      "C05"
     ]
    },
    {
     "t": "Pasa al paso 3 · Fines.",
     "target": ".stp[data-step='2']",
     "check": [
      "bmmStep",
      2
     ]
    },
    {
     "t": "En el constructor de metas elige un verbo y un tema, y pulsa «+ Agregar meta».",
     "target": ".builder",
     "check": [
      "bmmCount",
      "C05",
      "metas",
      1
     ]
    },
    {
     "t": "Salta al paso 6 · Mapa y revisión.",
     "target": ".stp[data-step='5']",
     "check": [
      "bmmStep",
      5
     ]
    },
    {
     "t": "Aquí ves el mapa y los chequeos de coherencia.",
     "target": ".bmm-canvas"
    }
   ]
  },
  {
   "id": "retos",
   "title": "Retos y preguntas guía",
   "minutes": 2,
   "group": "Espacio de trabajo del caso",
   "case": "C02 · UniFuturo",
   "purpose": "Conocer la pregunta central, las preguntas de razonamiento y cómo registrar tus respuestas.",
   "find": "Las respuestas se guardan en tu navegador y se incluyen en el informe y en la revisión del Tutor IA.",
   "yours": "Responde las preguntas guía de tu caso a medida que avanzas.",
   "steps": [
    {
     "t": "La pregunta central y las de razonamiento vienen del documento oficial.",
     "target": ".central",
     "before": [
      [
       "openCase",
       "C02",
       "retos"
      ]
     ]
    },
    {
     "t": "Escribe una hipótesis en la primera pregunta guía.",
     "target": ".q-item textarea",
     "check": [
      "qAnswered",
      "C02"
     ]
    },
    {
     "t": "Márcala como respondida.",
     "target": ".q-item input[type=checkbox]",
     "check": [
      "qDone",
      "C02"
     ]
    }
   ]
  },
  {
   "id": "matriz",
   "title": "Alternativas y matriz de decisión",
   "minutes": 5,
   "group": "Espacio de trabajo del caso",
   "case": "C10 · NubeGestión Labs",
   "purpose": "Pasar de las alternativas candidatas a una matriz de decisión ponderada.",
   "find": "La matriz compara tus alternativas con criterios y pesos explícitos; el radar muestra fortalezas y debilidades de cada una.",
   "yours": "Arma la matriz de tu caso con al menos tres alternativas propias y prueba cambiar los pesos.",
   "steps": [
    {
     "t": "Estas son las alternativas candidatas del caso: abre una ficha.",
     "target": "#ws-body .pattern-grid",
     "check": [
      "modal"
     ],
     "before": [
      [
       "openCase",
       "C10",
       "alternativas"
      ]
     ]
    },
    {
     "t": "Pulsa «Agregar a mi matriz de decisión».",
     "target": "[data-add-alt]",
     "check": [
      "matrixAlts",
      "C10",
      1
     ]
    },
    {
     "t": "Cierra la ficha con la ✕.",
     "target": ".modal-x",
     "check": [
      "noModal"
     ]
    },
    {
     "t": "Ve a la pestaña «Matriz de decisión».",
     "target": ".ws-tab[data-tab=matriz]",
     "check": [
      "tab",
      "matriz"
     ]
    },
    {
     "t": "Agrega otra alternativa desde la lista (o escribe una propia).",
     "target": ".pick-list",
     "check": [
      "matrixAlts",
      "C10",
      2
     ]
    },
    {
     "t": "Cambia algún puntaje (1 = peor, 5 = mejor) y mira cómo cambia el radar.",
     "target": ".matrix",
     "check": [
      "matrixScored",
      "C10"
     ]
    }
   ]
  },
  {
   "id": "tutor",
   "title": "Tutor IA y biblioteca de conocimiento",
   "minutes": 2,
   "group": "Espacio de trabajo del caso",
   "case": "C03 · NovaPay Digital",
   "purpose": "Saber cómo ingresar con tu equipo, pedir retroalimentación al tutor y consultar la base de conocimiento.",
   "find": "El tutor revisa lo que eliges, responde con preguntas y cita fuentes de ISO 27001, ITIL, COBIT, Tier y BMM, sin darte la solución.",
   "yours": "Cuando tengas avances en tu caso, pide retroalimentación y revisa las fuentes que cita.",
   "steps": [
    {
     "t": "Esta es la tarjeta «Mi equipo»: ingresas con el código de tu equipo (te lo entrega tu docente) y tu correo institucional. Sin ingresar, el tutor no responde.",
     "target": ".team-card",
     "before": [
      [
       "openCase",
       "C03",
       "tutor"
      ]
     ]
    },
    {
     "t": "Elige qué quieres que revise el tutor: preguntas, BMM, cálculos, incidentes, Tier, laboratorio, matriz o una propuesta libre.",
     "target": ".sec-picks"
    },
    {
     "t": "La biblioteca busca en la base de conocimiento sin gastar solicitudes (requiere el servidor del curso).",
     "target": "#kb-q"
    },
    {
     "t": "Cuando tengas avances, pide retroalimentación: el tutor responde con preguntas y cita fuentes, sin darte la solución. Tu equipo comparte el historial.",
     "target": "#tutor-send"
    }
   ]
  },
  {
   "id": "radiografia",
   "title": "Radiografía comparativa de los 15 casos",
   "minutes": 2,
   "tool": "radiografia",
   "case": "Comparación entre casos",
   "purpose": "Ubicar un caso frente a los demás: qué puntos únicos de falla comparte y qué tan completa es su evidencia.",
   "find": "Hay patrones que se repiten entre organizaciones (base de datos de nodo único, enlace único); el gris significa «no evidenciado», no «sin riesgo».",
   "yours": "Compara la fila de tu caso con la de otros de su sector: ¿qué SPOF comparten? ¿qué evidencia te falta?",
   "steps": [
    {
     "t": "Mira la columna «BD nodo único» del mapa de SPOF: ¿cuántos casos la tienen?",
     "target": "#heat-spof",
     "before": [
      [
       "closeWs"
      ],
      [
       "scroll",
       "#radiografia"
      ]
     ]
    },
    {
     "t": "Ahora mira la fila C13 en «Calidad de la evidencia»: es la única con datos parciales y faltantes.",
     "target": "#heat-evidence"
    },
    {
     "t": "Toca la fila C13 del mapa de SPOF para abrir ese caso.",
     "target": "#heat-spof tr[data-open-case=C13]",
     "check": [
      "hash",
      "#caso/C13"
     ]
    }
   ],
   "group": "Comparar y decidir"
  },
  {
   "id": "exposicion",
   "title": "Índice de exposición por dimensión",
   "minutes": 2,
   "group": "Comparar y decidir",
   "case": "Comparación entre casos",
   "purpose": "Ver en qué dimensiones de riesgo destaca cada caso para formular hipótesis.",
   "find": "El índice cuenta señales de riesgo en el texto de cada expediente: orienta dónde buscar, pero no es un diagnóstico.",
   "yours": "Ubica tu caso en el índice y anota la dimensión en la que más destaca como hipótesis para tus hallazgos.",
   "steps": [
    {
     "t": "Cada barra suma señales de continuidad, seguridad, capacidad, conectividad, proveedores y gobierno en el expediente.",
     "target": "#exposicion",
     "before": [
      [
       "closeWs"
      ]
     ]
    },
    {
     "t": "Toca la barra de un caso para abrirlo.",
     "target": "#chart-exposure",
     "check": [
      "hashPrefix",
      "#caso/"
     ]
    }
   ]
  },
  {
   "id": "catalogo",
   "title": "Catálogo de alternativas",
   "minutes": 3,
   "tool": "catalogo",
   "case": "Caja de herramientas",
   "purpose": "Aprender a leer una alternativa: qué resuelve, qué cuesta y qué riesgos nuevos crea.",
   "find": "Toda alternativa resuelve algo y crea un riesgo nuevo; ninguna ficha dice cuál es la correcta para tu caso.",
   "yours": "En la pestaña Alternativas de tu caso, revisa las candidatas: ¿cuáles no aplican por una restricción? ¿cuáles son insuficientes solas?",
   "steps": [
    {
     "t": "Filtra el catálogo por «Resiliencia».",
     "target": "#pattern-chips",
     "check": [
      "patFilter",
      "Resiliencia"
     ],
     "before": [
      [
       "closeWs"
      ],
      [
       "scroll",
       "#alternativas"
      ]
     ]
    },
    {
     "t": "Abre cualquier ficha de alternativa.",
     "target": "#pattern-grid",
     "check": [
      "modal"
     ]
    },
    {
     "t": "Lee «A favor» y «En contra / riesgos nuevos».",
     "target": ".modal-card .m-two"
    },
    {
     "t": "Cierra la ficha con la ✕.",
     "target": ".modal-x",
     "check": [
      "noModal"
     ]
    },
    {
     "t": "En el gráfico «Costo vs. complejidad», toca una burbuja para abrir su ficha. Arriba a la derecha: caro y complejo.",
     "target": "#chart-patterns",
     "check": [
      "modal"
     ]
    }
   ],
   "group": "Comparar y decidir"
  }
 ],
 "site_url": "https://acatherinebusinessintelligence.github.io/infralab/"
};
