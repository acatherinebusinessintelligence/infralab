# Clave de respuestas del Mentor IA (confidencial)

Todo lo que está en esta carpeta, salvo este archivo, está en `.gitignore`: la clave de respuestas **no se publica en GitHub**.

1. Genera el borrador desde la raíz del proyecto:

   ```bash
   node backend/answer_key/build_draft.js
   ```

   Se crea `clave_respuestas_borrador.json` con los 15 casos:
   - Tier actual y objetivo aceptables, con sus evidencias.
   - Cálculos con su valor, tolerancia y errores típicos.
   - Clasificación ITIL, COBIT e ISO de cada incidente (principal y aceptables).
   - Preguntas guía: el borrador no trae ideas clave.

2. En el servidor, abre `/admin` → **Clave de respuestas** → **Importar** y sube el archivo.
3. Revisa cada caso. En las preguntas guía puedes pedir a la IA que proponga ideas clave. Marca el caso como **validado** y guarda.
4. Exporta un respaldo JSON desde el panel y guárdalo aquí o en un lugar privado.

El borrador es un punto de partida: las decisiones de Tier y de clasificación de incidentes son criterio docente.
