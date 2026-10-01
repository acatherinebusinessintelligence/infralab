# Business Motivation Model (BMM) — OMG
# Resumen académico propio.

## [BMM-00] Qué es el BMM
tags: bmm business motivation model omg motivacion negocio fines medios influenciadores evaluaciones
El Business Motivation Model, especificación del Object Management Group (OMG), estructura el porqué de las decisiones de una organización. Sus bloques son: fines (lo que se quiere lograr), medios (cómo se logrará), influenciadores (lo que puede afectar a fines y medios) y evaluaciones (el juicio sobre el impacto de cada influenciador). Sirve para justificar decisiones, incluidas las de infraestructura, a partir de la motivación del negocio.

## [BMM-FINES] Fines: visión, metas y objetivos
tags: fines vision metas objetivos smart medibles indicador plazo resultados deseados
La visión es la imagen del estado futuro deseado; es amplia y no se mide directamente. Las metas son estados que se buscan mantener o alcanzar; son cualitativas y de largo plazo, y amplían la visión. Los objetivos son puntos de llegada específicos, medibles y con plazo que cuantifican una meta (SMART: específico, medible, alcanzable, relevante y temporal). Un buen objetivo indica el indicador, el valor meta y la fecha; por ejemplo: «Disponibilidad mensual del servicio X ≥ valor Y antes de la fecha Z».

## [BMM-MEDIOS] Medios: misión, cursos de acción y directivas
tags: medios mision estrategias tacticas cursos accion directivas politicas reglas negocio
La misión describe la actividad continua de la organización y hace operativa la visión. Los cursos de acción son estrategias (enfoque de largo alcance que canaliza esfuerzos hacia las metas) y tácticas (acciones concretas que implementan estrategias y logran objetivos). Las directivas son políticas de negocio (orientan o restringen los cursos de acción; no son directamente verificables) y reglas de negocio (derivadas de las políticas, precisas y verificables).

## [BMM-REL] Relaciones clave del modelo
tags: relaciones trazabilidad misión vision estrategia meta tactica objetivo politica regla coherencia
La misión hace operativa la visión; la estrategia canaliza esfuerzos hacia una meta; la táctica implementa una estrategia y logra un objetivo; el objetivo cuantifica una meta; la regla de negocio se deriva de una política; las directivas gobiernan los cursos de acción. Revisar la trazabilidad permite detectar tácticas sin objetivo (acciones sin propósito medible) y objetivos sin táctica (propósitos sin medios).

## [BMM-INFL] Influenciadores internos y externos
tags: influenciadores internos externos regulacion competencia clientes proveedores tecnologia entorno infraestructura habitos recursos supuestos restricciones
Un influenciador es algo que puede afectar el uso de los medios o el logro de los fines. Son externos, por ejemplo: regulación, clientes, competencia, proveedores, tecnología del mercado o entorno. Son internos, por ejemplo: infraestructura, recursos, hábitos, cultura, supuestos, restricciones y valores. En los casos del taller, las restricciones (presupuesto limitado, sistemas que no se pueden reemplazar, información sensible) son influenciadores.

## [BMM-EVAL] Evaluaciones e impacto (DOFA)
tags: evaluacion dofa foda swot fortalezas debilidades oportunidades amenazas impacto potencial riesgo recompensa
Una evaluación es el juicio sobre cómo un influenciador afecta los fines o los medios. Se suele expresar con DOFA: fortalezas y debilidades (internas), oportunidades y amenazas (externas). Cada evaluación puede tener un impacto potencial (riesgo o recompensa) que motiva nuevas directivas o cursos de acción. Un hecho del inventario (por ejemplo, backups en el mismo sitio) es un influenciador interno que se evalúa como debilidad y justifica una táctica.

## [BMM-INFRA] BMM aplicado a decisiones de infraestructura
tags: bmm infraestructura servicios criticos objetivos tacticas marcos itil cobit iso tier justificacion inversion
Para conectar el BMM con la infraestructura: 1) vincula cada objetivo con los servicios críticos que lo soportan; 2) expresa el objetivo con indicadores de servicio (disponibilidad, MTTR, capacidad, tiempo de respuesta); 3) define tácticas de infraestructura (redundancia, monitoreo, respaldo, segmentación, gestión de cambios) que logren esos objetivos; 4) apoya cada táctica en un marco (una práctica ITIL, un objetivo COBIT, un control ISO/IEC 27001 o un nivel Tier); 5) verifica que las tácticas respeten los influenciadores (presupuesto, regulación, sistemas que no se pueden reemplazar). Una inversión que no traza hasta un objetivo del negocio es difícil de justificar.
