# Metodología del taller y conceptos de gestión de infraestructura
# Resumen académico propio.

## [MET-SUST] Regla de sustentación del curso
tags: sustentacion problema evidencia impacto decision metrica justificar recomendacion
Toda recomendación se sustenta con la secuencia problema → evidencia → impacto → decisión → métrica. No basta con afirmar «migrar a la nube» o «comprar servidores»: hay que explicar qué problema identificado se resuelve, qué datos del caso lo evidencian, qué impacto tiene en el negocio, cuál es la decisión y con qué indicador se comprobará el resultado.

## [MET-DISP] Disponibilidad, MTTR y MTBF
tags: disponibilidad mttr mtbf formula calculo tiempo fuera servicio recuperacion incidentes periodo
La disponibilidad es la proporción del periodo observado en que el servicio estuvo operativo: (periodo − tiempo fuera de servicio) / periodo. El MTTR es el tiempo medio de recuperación: tiempo total de recuperación / número de incidentes. El MTBF es el tiempo medio entre fallas: tiempo operativo / número de incidentes. Hay que cuidar qué dato se usa en cada fórmula: el tiempo fuera de servicio no siempre coincide con el tiempo de recuperación (puede haber degradación sin caída total). Un «nueve» adicional reduce la caída permitida por un factor de 10.

## [MET-SPOF] Puntos únicos de falla (SPOF)
tags: spof punto unico falla dependencia redundancia cascada instancia unica nodo principal enlace unico
Un SPOF es un componente cuya falla detiene el servicio porque no tiene respaldo. Se identifican siguiendo las dependencias del servicio: servidor de aplicación, base de datos, directorio o autenticación, firewall, enlace WAN o VPN, almacenamiento, proveedor externo e incluso una sola persona que conoce el sistema. No todo componente único es un SPOF crítico: depende del servicio al que soporta y de su criticidad.

## [MET-SERIE] Disponibilidad en serie y en paralelo
tags: serie paralelo redundancia cadena disponibilidad compuesta producto
Si un servicio necesita que todos sus componentes funcionen (serie), la disponibilidad total es el producto de las disponibilidades y siempre es menor que la del componente más débil. Si hay componentes redundantes independientes (paralelo), la disponibilidad es 1 − (1 − A)^n. La redundancia solo aporta si las fallas son independientes (energía, ruta o proveedor distintos).

## [MET-RTO] RTO, RPO y análisis de impacto
tags: rto rpo bia impacto negocio recuperacion perdida datos tiempo
El RTO es el tiempo máximo aceptable para restablecer un servicio; el RPO, la cantidad máxima de datos (medida en tiempo) que se puede perder. Los define el negocio mediante un análisis de impacto (BIA), y la arquitectura de respaldo y recuperación debe cumplirlos.

## [MET-CAP] Capacidad, demanda y picos
tags: capacidad picos demanda estacional proyeccion crecimiento almacenamiento meses sobredimensionar elasticidad
Se debe distinguir entre la carga promedio y los picos (matrículas, Black Friday, cierres, cambios de turno). Dimensionar todo para el pico puede generar capacidad ociosa; no planificarlo genera saturación. Para el almacenamiento, los meses hasta llenarse se estiman con la capacidad libre dividida entre el crecimiento mensual, y conviene actuar antes de umbrales como el 80 %.

## [MET-ARQ] Estrategia: on-premise, nube, híbrida y edge
tags: on premise cloud nube hibrida edge borde latencia conectividad dependencia proveedor costos variables migracion gradual
On-premise da control y costos más predecibles, pero exige inversión y operación propias. La nube ofrece elasticidad y servicios administrados, con costos variables y dependencia del proveedor. La arquitectura híbrida combina ambos para modernizar gradualmente. Edge procesa cerca del origen cuando la latencia o la conectividad lo exigen (plantas, tiendas, ciudades). La elección depende de los servicios críticos, las restricciones y los datos del caso.

## [MET-CAPEX] CAPEX y OPEX
tags: capex opex inversion gasto operativo compra suscripcion costo total
CAPEX es la inversión en activos (comprar servidores, almacenamiento o licencias perpetuas); OPEX es el gasto operativo recurrente (suscripciones cloud, servicios gestionados, soporte). Comparar alternativas exige considerar el costo total, la capacidad, el riesgo, la operación, la flexibilidad y las métricas, no solo el precio inicial.

## [MET-HALL] Hallazgos y matriz de diagnóstico
tags: hallazgos diagnostico matriz criticidad recomendacion capacidad disponibilidad operacion seguridad gobierno monitoreo
Un hallazgo se documenta con su evidencia, su impacto, su criticidad y una recomendación, y se clasifica según su naturaleza: capacidad, disponibilidad, operación, seguridad, gobierno o monitoreo. Distinguir la naturaleza evita proponer tecnología para resolver problemas de proceso o de gobierno.
