# Clasificación Tier de centros de datos (Uptime Institute)
# Resumen académico propio.

## [TIER-00] Qué es la clasificación Tier
tags: tier uptime institute centro datos clasificacion niveles i ii iii iv infraestructura fisica energia climatizacion
El Uptime Institute clasifica la infraestructura física de un centro de datos (energía, climatización y rutas de distribución) en cuatro niveles, Tier I a Tier IV, según su redundancia y su capacidad de mantenerse en operación durante el mantenimiento o ante fallas. Tier no evalúa las aplicaciones ni los procesos de gestión: describe la topología del sitio. La certificación oficial requiere una evaluación del Uptime Institute. TIA-942 es un estándar distinto, con niveles análogos (Rated 1–4).

## [TIER-NOT] Notación de redundancia: N, N+1, 2N
tags: redundancia n n+1 2n 2n+1 componentes capacidad rutas distribucion
N es la capacidad necesaria para la carga. N+1 agrega un componente de respaldo (por ejemplo, un UPS o un equipo de climatización adicional). 2N duplica completamente la capacidad (dos sistemas independientes). 2(N+1) duplica sistemas que ya tienen respaldo. También importan las rutas de distribución: una sola ruta es un punto único de falla aunque los equipos sean redundantes.

## [TIER-I] Tier I · Capacidad básica
tags: tier i basico sin redundancia n una ruta paradas mantenimiento
Infraestructura dedicada (UPS, generador, climatización) sin componentes redundantes (N) y con una sola ruta de distribución. Cualquier mantenimiento o falla de un componente interrumpe la operación. Cifra histórica de referencia: ≈ 99,671 % (unas 28,8 h de indisponibilidad al año).

## [TIER-II] Tier II · Componentes de capacidad redundantes
tags: tier ii redundancia componentes n+1 una ruta
Añade componentes de capacidad redundantes (N+1), pero mantiene una sola ruta de distribución. Tolera la falla de algunos componentes, pero el mantenimiento de la ruta exige detener la operación. Referencia histórica: ≈ 99,741 % (unas 22 h al año).

## [TIER-III] Tier III · Mantenible concurrentemente
tags: tier iii concurrentemente mantenible multiples rutas n+1 mantenimiento sin parada
Componentes redundantes y múltiples rutas de distribución (una activa y otra alterna), de modo que cualquier componente o ruta puede retirarse para mantenimiento planificado sin detener la operación. No garantiza tolerar una falla no planeada durante ese mantenimiento. Referencia histórica: ≈ 99,982 % (unas 1,6 h al año).

## [TIER-IV] Tier IV · Tolerante a fallas
tags: tier iv tolerante fallas 2n compartimentacion rutas activas
Sistemas redundantes independientes y compartimentados, con múltiples rutas activas, de modo que una falla no planeada de cualquier componente o ruta no afecta la operación. Es el nivel de mayor costo. Referencia histórica: ≈ 99,995 % (unos 26 min al año).

## [TIER-USO] Cómo usar Tier en el análisis de un caso
tags: elegir tier costo beneficio negocio disponibilidad requerida nube colocation sitio alterno hibrido servicios criticos
Las cifras de disponibilidad son referencias históricas y no requisitos del estándar: la disponibilidad real depende también de la operación y de las aplicaciones. Para decidir, compara el impacto de una hora de caída de los servicios críticos con el costo de subir de nivel. Alternativas a construir un sitio de mayor Tier: contratar colocation en un centro certificado, usar la nube (con zonas de disponibilidad) o un sitio alterno para recuperación. Un cuarto técnico con un solo UPS, un solo enlace o una sola climatización se parece a Tier I, aunque los servidores estén duplicados. La redundancia de las instalaciones se relaciona con ISO 27001 A.7.11 y A.8.14.
