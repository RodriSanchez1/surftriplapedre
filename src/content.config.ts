import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usar formato AAAA-MM-DD entre comillas');
const texto = z.object({ es: z.string().min(1), pt: z.string().min(1).optional() });
/** Colores de acento disponibles para cada surfista (ver src/styles/tokens.css). */
export const ACCENTS = ['red', 'sky', 'yellow', 'green', 'pink'] as const;

/** Quita la extensión para que el id quede '<base>.<lang>' (p. ej. '2026-10-26/juan.es'). */
const idFromPath = ({ entry }: { entry: string }) => entry.replace(/\.md$/, '');

const trip = defineCollection({
  loader: file('src/data/trip.yaml'),
  schema: z.object({
    nombre: z.string(),
    equipo: z.string(),
    lugar: z.string(),
    coach: z.string(),
    fechaInicio: isoDate,
    fechaFin: isoDate,
    zonaHoraria: z.string(),
  }),
});

const dias = defineCollection({
  loader: file('src/data/dias.yaml'),
  schema: z.object({
    actividad: texto.optional(),
    spot: z.string().optional(),
    horario: z.string().optional(),
    sesion: isoDate.optional(),
  }),
});

const surfistas = defineCollection({
  loader: file('src/data/surfistas.yaml'),
  schema: z.object({
    nombre: z.string(),
    color: z.enum(ACCENTS),
  }),
});

const sesiones = defineCollection({
  loader: glob({ pattern: '*.{es,pt}.md', base: 'src/content/sesiones', generateId: idFromPath }),
  schema: z.object({
    fecha: isoDate,
    titulo: z.string(),
    planNota: z.string().optional(),
    logistica: z.array(z.string()).default([]),
  }),
});

const insights = defineCollection({
  loader: glob({ pattern: '*/*.{es,pt}.md', base: 'src/content/insights', generateId: idFromPath }),
  schema: z.object({
    fecha: isoDate,
    surfista: z.string(),
    foco: z.string(),
    focoSecundario: z.string(),
    frase: z.string(),
  }),
});

export const collections = { trip, dias, surfistas, sesiones, insights };
