# ITIL 4 — Gestión de servicios de TI
# Resumen académico propio.

## [ITIL-SVS] Sistema de valor del servicio (SVS)
tags: itil 4 sistema valor servicio svs cadena valor principios gobierno mejora continua practicas
ITIL 4 describe cómo los componentes de una organización trabajan juntos para crear valor mediante servicios habilitados por TI. El Sistema de Valor del Servicio integra: principios guía, gobierno, cadena de valor del servicio, prácticas y mejora continua. Parte de una oportunidad o demanda y termina en valor para las partes interesadas. ITIL 4 reemplazó los «procesos» de ITIL v3 por 34 «prácticas» agrupadas en generales, de gestión de servicios y técnicas.

## [ITIL-PRIN] Los siete principios guía
tags: principios guia valor comenzar donde estas progresar iterativamente colaborar visibilidad holistico simplicidad optimizar automatizar
1) Enfocarse en el valor. 2) Comenzar donde se está (aprovechar lo existente antes de reemplazarlo). 3) Progresar iterativamente con retroalimentación. 4) Colaborar y promover la visibilidad. 5) Pensar y trabajar de forma holística. 6) Mantenerlo simple y práctico. 7) Optimizar y automatizar. «Comenzar donde se está» y «progresar iterativamente» son especialmente útiles cuando un caso impide reemplazar un sistema o exige una modernización gradual.

## [ITIL-CADENA] Cadena de valor del servicio y cuatro dimensiones
tags: cadena valor planificar mejorar involucrar diseñar transicion obtener construir entregar soporte cuatro dimensiones organizaciones personas informacion tecnologia socios proveedores flujos procesos
La cadena de valor tiene seis actividades: planificar, mejorar, involucrar, diseñar y hacer la transición, obtener/construir, y entregar y dar soporte. Toda solución debe considerar cuatro dimensiones: organizaciones y personas; información y tecnología; socios y proveedores; flujos de valor y procesos. Una propuesta que solo compra tecnología, sin procesos ni personas, está incompleta.

## [ITIL-INC] Gestión de incidentes
tags: incidentes registro priorizacion impacto urgencia restauracion mttr mesa servicio escalamiento canal unico whatsapp telefono
Objetivo: minimizar el impacto negativo de los incidentes restaurando la operación normal lo antes posible. Requiere registrar todos los incidentes en una herramienta única, clasificarlos y priorizarlos por impacto y urgencia, escalarlos de forma definida y medir tiempos (detección, respuesta, restauración). Reportar incidentes por teléfono o mensajería sin ticket impide medir el MTTR y detectar patrones.

## [ITIL-PROB] Gestión de problemas
tags: problemas causa raiz recurrentes errores conocidos soluciones temporales analisis
Objetivo: reducir la probabilidad e impacto de los incidentes identificando causas reales y potenciales, y gestionando soluciones temporales y errores conocidos. Tiene tres fases: identificación (tendencias de incidentes recurrentes), control (análisis de causa raíz) y control de errores. Liberar espacio a mano cada vez que el disco se llena es una solución temporal; la gestión de problemas busca la causa (crecimiento sin política de retención, por ejemplo).

## [ITIL-CHG] Habilitación de cambios
tags: cambios habilitacion autorizacion riesgo reversa rollback cab ventana estandar normal emergencia calendario
Objetivo: maximizar el número de cambios exitosos asegurando que los riesgos se evalúen, que los cambios se autoricen y que el calendario se gestione. Hay cambios estándar (preautorizados, de bajo riesgo), normales (evaluados y autorizados según el riesgo) y de emergencia. Cada cambio debería tener evaluación de impacto, pruebas, plan de reversa y ventana adecuada. Indicadores: porcentaje de cambios exitosos y porcentaje de incidentes causados por cambios.

## [ITIL-DISP] Gestión de la disponibilidad
tags: disponibilidad mtbf mttr confiabilidad mantenibilidad spof redundancia objetivos disponibilidad
Objetivo: asegurar que los servicios entreguen los niveles de disponibilidad acordados. Considera la confiabilidad (MTBF: tiempo entre fallas) y la restaurabilidad (MTTR: tiempo de recuperación), identifica puntos únicos de falla y propone mejoras. La disponibilidad se mide desde la perspectiva del usuario, no solo del servidor.

## [ITIL-CAP] Gestión de la capacidad y el rendimiento
tags: capacidad rendimiento demanda picos proyeccion cpu ram almacenamiento latencia pruebas carga dimensionamiento sobredimensionamiento
Objetivo: asegurar que los servicios alcancen el rendimiento acordado atendiendo la demanda actual y futura de manera costo-efectiva. Incluye monitorear el uso, modelar la demanda (normal y picos), proyectar el crecimiento, hacer pruebas de carga y ajustar la capacidad. Dimensionar todo para el pico máximo puede ser tan ineficiente como quedarse corto; la elasticidad (nube, autoescalado) es una opción que debe justificarse con datos.

## [ITIL-CONT] Gestión de la continuidad del servicio
tags: continuidad servicio desastre bia analisis impacto negocio rto rpo plan recuperacion pruebas simulacro
Objetivo: asegurar que la disponibilidad y el rendimiento se mantengan en un nivel suficiente ante un desastre. Parte de un análisis de impacto en el negocio (BIA) que define RTO y RPO por servicio, diseña las estrategias de recuperación y las prueba periódicamente.

## [ITIL-MON] Monitoreo y gestión de eventos
tags: monitoreo eventos alertas umbrales ruido falsos positivos correlacion observabilidad dashboard mttd deteccion
Objetivo: observar sistemáticamente servicios y componentes, registrar e informar cambios de estado (eventos) y responder a ellos. Se definen qué monitorear, los umbrales, la clasificación de eventos (informativos, advertencias, excepciones) y las respuestas. Demasiadas alertas sin correlación generan fatiga; ninguna alerta implica que el usuario detecta los fallos antes que TI.

## [ITIL-SLM] Gestión de niveles de servicio
tags: sla niveles servicio acuerdos objetivos slo indicadores sli catalogo cliente
Objetivo: fijar metas de nivel de servicio claras basadas en el negocio y evaluar, monitorear y gestionar su cumplimiento. Los SLA deben reflejar lo que importa al usuario (disponibilidad, tiempos de respuesta, tiempos de atención) y medirse con datos confiables.

## [ITIL-CAT] Gestión del catálogo de servicios
tags: catalogo servicios oferta servicios estandarizacion duplicidad
Proporciona una fuente única de información consistente sobre todos los servicios y ofertas de servicio. Permite saber qué se ofrece, a quién, con qué nivel y qué dependencias tiene. Es clave en organizaciones con herramientas duplicadas o filiales descoordinadas.

## [ITIL-CONF] Gestión de activos y configuración
tags: activos configuracion cmdb inventario dependencias ci relaciones obsolescencia
La gestión de activos de TI planifica y controla el ciclo de vida de los activos (costo, riesgo, obsolescencia). La gestión de la configuración del servicio mantiene información precisa de los elementos de configuración y sus relaciones (CMDB), lo que hace visibles las dependencias y los puntos únicos de falla.

## [ITIL-PROV] Gestión de proveedores
tags: proveedores contratos desempeño sla terceros riesgos dependencia multiproveedor
Asegura que los proveedores y su desempeño se gestionen adecuadamente: selección, contratos con niveles de servicio medibles, seguimiento, gestión de riesgos y de la relación. Un SLA con un proveedor no evita la caída; define responsabilidades y compensaciones.

## [ITIL-SEG] Gestión de la seguridad de la información
tags: seguridad informacion confidencialidad integridad disponibilidad controles riesgos
Protege la información que la organización necesita, gestionando riesgos de confidencialidad, integridad y disponibilidad, así como la autenticación y el no repudio. Se apoya en marcos como ISO/IEC 27001.

## [ITIL-OTRAS] Otras prácticas relevantes
tags: mesa servicio solicitudes medicion reporte mejora continua riesgos financiera arquitectura despliegue infraestructura plataformas
Mesa de servicio (punto único de contacto con los usuarios), gestión de solicitudes de servicio, medición y reporte (decisiones basadas en datos), mejora continua, gestión de riesgos, gestión financiera de servicios (costos, CAPEX/OPEX), gestión de la arquitectura, gestión del despliegue y gestión de infraestructura y plataformas (incluye la nube).
