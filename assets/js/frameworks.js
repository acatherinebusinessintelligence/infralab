/* Catálogos de marcos de referencia para los desplegables del taller.
 * Títulos resumidos/traducidos con fines académicos (no reproducen el texto oficial de las normas). */
window.FRAMEWORKS = {
  itil: {
    name: "ITIL 4 · prácticas",
    groups: {
      "Prácticas de gestión general": [
        "Gestión de la arquitectura", "Mejora continua", "Gestión de la seguridad de la información", "Gestión del conocimiento",
        "Medición y reporte", "Gestión del cambio organizacional", "Gestión del portafolio", "Gestión de proyectos",
        "Gestión de relaciones", "Gestión de riesgos", "Gestión financiera de servicios", "Gestión de la estrategia",
        "Gestión de proveedores", "Gestión del talento y la fuerza laboral",
      ],
      "Prácticas de gestión de servicios": [
        "Gestión de la disponibilidad", "Análisis del negocio", "Gestión de la capacidad y el rendimiento", "Habilitación de cambios",
        "Gestión de incidentes", "Gestión de activos de TI", "Monitoreo y gestión de eventos", "Gestión de problemas",
        "Gestión de liberaciones", "Gestión del catálogo de servicios", "Gestión de la configuración del servicio",
        "Gestión de la continuidad del servicio", "Diseño de servicios", "Mesa de servicio", "Gestión de niveles de servicio",
        "Gestión de solicitudes de servicio", "Validación y pruebas del servicio",
      ],
      "Prácticas de gestión técnica": ["Gestión del despliegue", "Gestión de infraestructura y plataformas", "Desarrollo y gestión de software"],
    },
  },
  cobit: {
    name: "COBIT 2019 · objetivos",
    groups: {
      "EDM · Evaluar, Dirigir y Monitorear": [
        "EDM01 Asegurar el establecimiento y mantenimiento del marco de gobierno", "EDM02 Asegurar la entrega de beneficios",
        "EDM03 Asegurar la optimización del riesgo", "EDM04 Asegurar la optimización de recursos", "EDM05 Asegurar el compromiso de las partes interesadas",
      ],
      "APO · Alinear, Planificar y Organizar": [
        "APO01 Marco de gestión de I&T", "APO02 Estrategia", "APO03 Arquitectura empresarial", "APO04 Innovación", "APO05 Portafolio",
        "APO06 Presupuesto y costos", "APO07 Recursos humanos", "APO08 Relaciones", "APO09 Acuerdos de servicio", "APO10 Proveedores",
        "APO11 Calidad", "APO12 Riesgo", "APO13 Seguridad", "APO14 Datos",
      ],
      "BAI · Construir, Adquirir e Implementar": [
        "BAI01 Programas", "BAI02 Definición de requisitos", "BAI03 Identificación y construcción de soluciones", "BAI04 Disponibilidad y capacidad",
        "BAI05 Cambio organizacional", "BAI06 Cambios de TI", "BAI07 Aceptación y transición de cambios", "BAI08 Conocimiento",
        "BAI09 Activos", "BAI10 Configuración", "BAI11 Proyectos",
      ],
      "DSS · Entregar, dar Servicio y Soporte": [
        "DSS01 Operaciones", "DSS02 Solicitudes de servicio e incidentes", "DSS03 Problemas", "DSS04 Continuidad",
        "DSS05 Servicios de seguridad", "DSS06 Controles de procesos de negocio",
      ],
      "MEA · Monitorear, Evaluar y Valorar": [
        "MEA01 Monitoreo del desempeño y la conformidad", "MEA02 Sistema de control interno", "MEA03 Cumplimiento de requisitos externos", "MEA04 Aseguramiento",
      ],
    },
  },
  iso: {
    name: "ISO/IEC 27001:2022 · Anexo A",
    groups: {
      "A.5 Controles organizacionales": [
        "A.5.1 Políticas de seguridad de la información", "A.5.2 Roles y responsabilidades", "A.5.3 Segregación de funciones", "A.5.4 Responsabilidades de la dirección",
        "A.5.5 Contacto con autoridades", "A.5.6 Contacto con grupos de interés especial", "A.5.7 Inteligencia de amenazas", "A.5.8 Seguridad en la gestión de proyectos",
        "A.5.9 Inventario de información y activos asociados", "A.5.10 Uso aceptable de activos", "A.5.11 Devolución de activos", "A.5.12 Clasificación de la información",
        "A.5.13 Etiquetado de la información", "A.5.14 Transferencia de información", "A.5.15 Control de acceso", "A.5.16 Gestión de identidades",
        "A.5.17 Información de autenticación", "A.5.18 Derechos de acceso", "A.5.19 Seguridad en las relaciones con proveedores", "A.5.20 Seguridad en los acuerdos con proveedores",
        "A.5.21 Seguridad en la cadena de suministro TIC", "A.5.22 Seguimiento y cambios de servicios de proveedores", "A.5.23 Seguridad en el uso de servicios en la nube",
        "A.5.24 Planificación de la gestión de incidentes", "A.5.25 Evaluación y decisión sobre eventos", "A.5.26 Respuesta a incidentes", "A.5.27 Aprendizaje de los incidentes",
        "A.5.28 Recolección de evidencia", "A.5.29 Seguridad durante una interrupción", "A.5.30 Preparación de las TIC para la continuidad del negocio",
        "A.5.31 Requisitos legales, regulatorios y contractuales", "A.5.32 Derechos de propiedad intelectual", "A.5.33 Protección de registros", "A.5.34 Privacidad y protección de datos personales",
        "A.5.35 Revisión independiente de la seguridad", "A.5.36 Cumplimiento de políticas y normas", "A.5.37 Procedimientos operativos documentados",
      ],
      "A.6 Controles de personas": [
        "A.6.1 Verificación de antecedentes", "A.6.2 Términos y condiciones de empleo", "A.6.3 Concienciación, educación y formación", "A.6.4 Proceso disciplinario",
        "A.6.5 Responsabilidades tras la terminación o cambio de empleo", "A.6.6 Acuerdos de confidencialidad", "A.6.7 Trabajo remoto", "A.6.8 Reporte de eventos de seguridad",
      ],
      "A.7 Controles físicos": [
        "A.7.1 Perímetros de seguridad física", "A.7.2 Controles de entrada física", "A.7.3 Seguridad de oficinas y recintos", "A.7.4 Monitoreo de seguridad física",
        "A.7.5 Protección contra amenazas físicas y ambientales", "A.7.6 Trabajo en áreas seguras", "A.7.7 Escritorio y pantalla limpios", "A.7.8 Ubicación y protección de equipos",
        "A.7.9 Seguridad de activos fuera de las instalaciones", "A.7.10 Medios de almacenamiento", "A.7.11 Servicios de suministro (energía, climatización)", "A.7.12 Seguridad del cableado",
        "A.7.13 Mantenimiento de equipos", "A.7.14 Eliminación o reutilización segura de equipos",
      ],
      "A.8 Controles tecnológicos": [
        "A.8.1 Dispositivos de usuario final", "A.8.2 Derechos de acceso privilegiado", "A.8.3 Restricción de acceso a la información", "A.8.4 Acceso al código fuente",
        "A.8.5 Autenticación segura", "A.8.6 Gestión de la capacidad", "A.8.7 Protección contra malware", "A.8.8 Gestión de vulnerabilidades técnicas",
        "A.8.9 Gestión de la configuración", "A.8.10 Eliminación de información", "A.8.11 Enmascaramiento de datos", "A.8.12 Prevención de fuga de datos",
        "A.8.13 Copias de seguridad de la información", "A.8.14 Redundancia de las instalaciones de procesamiento", "A.8.15 Registro de eventos (logging)", "A.8.16 Actividades de monitoreo",
        "A.8.17 Sincronización de relojes", "A.8.18 Uso de programas utilitarios privilegiados", "A.8.19 Instalación de software en sistemas operativos", "A.8.20 Seguridad de redes",
        "A.8.21 Seguridad de los servicios de red", "A.8.22 Segregación de redes", "A.8.23 Filtrado web", "A.8.24 Uso de criptografía",
        "A.8.25 Ciclo de vida de desarrollo seguro", "A.8.26 Requisitos de seguridad de aplicaciones", "A.8.27 Arquitectura y principios de ingeniería segura", "A.8.28 Codificación segura",
        "A.8.29 Pruebas de seguridad en desarrollo y aceptación", "A.8.30 Desarrollo externalizado", "A.8.31 Separación de ambientes de desarrollo, prueba y producción", "A.8.32 Gestión de cambios",
        "A.8.33 Información de prueba", "A.8.34 Protección de sistemas durante pruebas de auditoría",
      ],
    },
  },
  tier: {
    name: "Tier (Uptime Institute)",
    groups: {
      "Clasificación de centros de datos": [
        "Tier I · Capacidad básica", "Tier II · Componentes de capacidad redundantes", "Tier III · Mantenible concurrentemente", "Tier IV · Tolerante a fallas",
      ],
    },
  },
};

window.TIERS = [
  { id: "I", name: "Tier I · Capacidad básica", red: "N (sin redundancia)", path: "Una sola ruta de distribución", maint: "Paradas para mantenimiento", ref: "≈ 99,671 %" },
  { id: "II", name: "Tier II · Componentes redundantes", red: "N+1 en componentes de capacidad", path: "Una sola ruta de distribución", maint: "Algunas paradas planeadas", ref: "≈ 99,741 %" },
  { id: "III", name: "Tier III · Mantenible concurrentemente", red: "N+1", path: "Múltiples rutas (una activa)", maint: "Mantenimiento sin detener la operación", ref: "≈ 99,982 %" },
  { id: "IV", name: "Tier IV · Tolerante a fallas", red: "2N o 2(N+1)", path: "Múltiples rutas activas y compartimentadas", maint: "Resiste una falla no planeada sin impacto", ref: "≈ 99,995 %" },
];

/* Opciones genéricas que complementan las del caso en el BMM. */
window.BMM_GUIDE = {
  plazos: ["1 mes", "3 meses", "6 meses", "12 meses", "18 meses", "24 meses", "Antes del próximo pico de demanda"],
  estrategias: ["Resiliencia y continuidad del servicio", "Gestión basada en evidencia y métricas", "Modernización gradual (híbrida)", "Optimización de costos y capacidad",
    "Seguridad y cumplimiento por diseño", "Gobierno y estandarización de TI", "Escalabilidad bajo demanda", "Gestión de proveedores y dependencias", "Operación distribuida / degradada"],
  politicas: ["Gestión de cambios", "Copias de seguridad y restauración", "Control de acceso e identidades", "Gestión de la capacidad", "Continuidad y recuperación",
    "Gestión de proveedores", "Monitoreo y eventos", "Clasificación y retención de la información", "Gestión de vulnerabilidades y parches", "Niveles de servicio (SLA)"],
  kpis: ["Disponibilidad mensual (%)", "MTTR (h)", "MTBF (h)", "MTTD — tiempo medio de detección", "Incidentes por mes", "% de incidentes detectados por monitoreo",
    "% de backups exitosos verificados", "% de restauraciones probadas", "RPO alcanzado", "RTO alcanzado", "% de cambios con plan de reversa", "% de cambios exitosos",
    "% de cuentas privilegiadas con MFA", "Cuentas inactivas sin revisar", "Ocupación de almacenamiento (%)", "CPU en hora pico (%)", "Latencia percentil 95 (ms)",
    "% de servicios con SLA definido", "Costo por usuario / transacción", "Satisfacción del usuario"],
};
