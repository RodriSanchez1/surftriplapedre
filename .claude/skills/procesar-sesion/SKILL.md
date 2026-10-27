---
name: procesar-sesion
description: Convierte el audio o la transcripción de una sesión con el coach en los insights de cada surfista (ES y PT) y los carga en el sitio. Usar cuando hay un audio o una transcripción nueva en sesiones/<fecha>/, cuando el usuario pide "procesá la sesión", "generá los insights" o "cargá la sesión de hoy", o cuando lo llama scripts/sesion-auto.mjs.
argument-hint: "[AAAA-MM-DD]"
---

# Procesar una sesión con el coach

Entrada: una fecha `AAAA-MM-DD`. Si no viene, usar la fecha de hoy en la `zonaHoraria` de `src/data/trip.yaml`.
Salida: insights en ES y PT cargados en el sitio, build en verde y un commit. **Nunca push.**

Nombres de personas, coach, lugar y fechas salen siempre de `src/data/`; no los adivines.

## 1. Insumos

En `sesiones/<fecha>/` tiene que haber una de estas cosas, en este orden de preferencia:

1. `transcripcion-cruda.md`: la deja `scripts/transcribir.py`.
2. Audios `<fecha>_<HHmm>[_parteN].<ext>`: transcribirlos con
   `uv run scripts/transcribir.py sesiones/<fecha>/<audio1> [<audio2> ...]`, en orden de hora y parte. Tarda varios minutos.
3. `transcripcion.md` ya curada (por ejemplo, de ElevenLabs): saltear el paso 2.

Si no hay nada, parar y decir qué falta.

Leer además: `src/data/trip.yaml`, `src/data/surfistas.yaml`, `src/data/dias.yaml`, `sesiones/2026-10-26/insights-es.md` (el ejemplo del formato) y los `insights-es.md` de la sesión anterior, si hay, para ver qué foco tenía cada uno.

## 2. Leer la transcripción cruda

Cada línea es `[mm:ss] (idioma) texto`. El idioma se detectó por tramo entre español y portugués, y `(pt?)` indica una detección dudosa.

- **Quién habla.** No hay separación de voces. El coach habla en portugués o portuñol, y los surfistas responden en español. Lo que está en `(pt)` casi siempre es el coach. Las interjecciones cortas ("Sí", "Claro", "Sim") pueden ser de cualquiera.
- **De quién es la ola.** El coach analiza video ola por ola. El surfista se reconoce porque lo nombran ("esa es de Ciro", "Rodri, olha..."). Si no lo nombran, inferirlo por el contexto y marcarlo *(probable)*. Si no se puede, *sin identificar*, y no se le atribuye a nadie.
- **Errores típicos.** Si un tramo se detectó en el idioma equivocado, Whisper puede haber "traducido" o deformado lo que se dijo. Interpretar por el sentido y no citar textual algo que no tiene sentido. Los nombres del roster y los términos de surf (cavada, batida, rasgada, drop, bottom, lip) pueden venir mal escritos.
- **No inventar.** Todo insight tiene que estar en el audio. Si algo es inferencia, decirlo.

## 3. `sesiones/<fecha>/transcripcion.md` (privada)

Mismo formato que la del 26/10: título, ficha (audio, duración, cómo se transcribió, participantes), "Cómo leerla", **índice de tramos** (`| Tiempo | Tramo | Surfista analizado |`) y después el texto por tramos, con `## mm:ss · tema · surfista` y quién habla en negrita. Las palabras dudosas van como *[¿…?]*. Es privada: nunca se commitea.

## 4. `sesiones/<fecha>/insights-es.md`

Mismo formato que `sesiones/2026-10-26/insights-es.md`, porque `scripts/import-sesion.mjs` lo parsea:

```markdown
# Insights sesión surftrip — dd/mm

dd/mm/aaaa

## Resumen
(2 o 3 párrafos o una lista corta con las ideas que se repitieron para todo el grupo)

## <Nombre exacto de surfistas.yaml>
(1 o 2 frases de contexto)

**Lo que salió bien**

- ... (mm:ss)

**En qué trabajar**

- **Idea en negrita.** Explicación con la consigna del coach (mm:ss–mm:ss).

## Plan para la próxima sesión

(una frase: planNota)

| Surfista | Foco principal | Foco secundario | Frase para el agua |
| --- | --- | --- | --- |
| <Nombre> | ... | ... | "..." |

**Logística conversada al cierre**

- ...
```

Reglas:

- Una sección `## <Nombre>` por surfista **del que se habló**, con el nombre tal cual está en `surfistas.yaml`. Si de alguien no se habló, no lleva sección ni fila en la tabla; avisarlo en el mensaje final.
- Cada surfista con sección tiene que tener su fila en la tabla (si no, el import falla).
- Citar el minuto de cada punto entre paréntesis. Las citas del coach van traducidas al español, entre comillas.
- Si la sesión anterior tenía un foco para alguien y en esta se nota avance o se repite el problema, mencionarlo en su contexto.
- "En qué trabajar" ordenado por lo que más repitió el coach. Frases cortas, de voseo rioplatense, sin relleno.
- La "Frase para el agua" es corta y sale del coach cuando se puede.
- La lista de logística va solo si se habló de logística; si no, se omite.

## 5. `sesiones/<fecha>/insights-pt.md`

Traducción al portugués de Brasil (el coach lo lee), con la misma estructura. Los encabezados cambian: `## Resumo`, `**O que saiu bem**`, `**No que trabalhar**`, `## Plano para a próxima sessão`, tabla `| Surfista | Foco principal | Foco secundário | Frase para a água |` y `**Logística combinada no fechamento**`. Los nombres de los surfistas no se traducen. Tomar `sesiones/2026-10-26/insights-pt.md` como ejemplo.

## 6. Cargar en el sitio

1. Títulos cortos: en ES, por ejemplo, "Análisis de video con <coach>"; en PT, "Análise de vídeo com <coach>". Si la sesión fue otra cosa (charla en la playa, teoría), adaptarlo.
2. `npm run import-sesion -- <fecha> "<título ES>" "<título PT>"`
3. En `src/data/dias.yaml`, agregar o actualizar el día `"<fecha>"` con `sesion: "<fecha>"`. Si el día no existía, `actividad` con `es` y `pt` igual al título. Si ya existía, no tocar su actividad.
4. `npm run check && npm test && npm run build`. Si falla, corregir y repetir.

## 7. Commit

- Si estás en `main`, crear antes `feat/sesion-<fecha>`. En cualquier otra rama, commitear ahí.
- `git add` **solo** de: `sesiones/<fecha>/insights-es.md`, `sesiones/<fecha>/insights-pt.md`, `src/content/sesiones/<fecha>.*.md`, `src/content/insights/<fecha>/` y `src/data/dias.yaml`. Nunca `git add -A` ni `.`: en `sesiones/<fecha>/` hay audios y transcripciones privadas.
- Mensaje: `Sesión <dd/mm>: insights`.
- No hacer push ni abrir PR. Eso lo confirma el humano.

## 8. Mensaje final

Corto, en español: qué surfistas tienen insights, de quién no se habló, dudas de interpretación (tramos sin identificar, citas dudosas) y el comando para ver la página: `npm run dev` → `/surftriplapedre/sesiones/<fecha>/`.
