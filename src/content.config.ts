import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format, in quotes');
const text = z.object({ es: z.string().min(1), pt: z.string().min(1).optional() });
/** Accent colors available for each surfer (see src/styles/tokens.css). */
export const ACCENTS = ['red', 'sky', 'yellow', 'green', 'pink'] as const;

/** Strips the extension so the id is '<base>.<lang>' (e.g. '2026-10-26/juan.es'). */
const idFromPath = ({ entry }: { entry: string }) => entry.replace(/\.md$/, '');

const trip = defineCollection({
  loader: file('src/data/trip.yaml'),
  schema: z.object({
    name: z.string(),
    team: z.string(),
    location: z.string(),
    coach: z.string(),
    startDate: isoDate,
    endDate: isoDate,
    timeZone: z.string(),
    /** Upload of the coach's audio to Drive (see AGENTS.md). Optional: without it, /upload/ says it is not configured. */
    audio: z
      .object({
        driveFolder: z.string().min(1),
        googleClientId: z.string().endsWith('.apps.googleusercontent.com'),
        contact: z.string().min(1),
      })
      .optional(),
  }),
});

const days = defineCollection({
  loader: file('src/data/days.yaml'),
  schema: z.object({
    activity: text.optional(),
    spot: z.string().optional(),
    time: z.string().optional(),
    session: isoDate.optional(),
  }),
});

const surfers = defineCollection({
  loader: file('src/data/surfers.yaml'),
  schema: z.object({
    name: z.string(),
    color: z.enum(ACCENTS),
  }),
});

const coaches = defineCollection({
  loader: file('src/data/coaches.yaml'),
  schema: z.object({
    name: z.string(),
    color: z.enum(ACCENTS),
  }),
});

/** A coach's profile, one file per language: src/content/coaches/<coach id>.<es|pt>.md. */
const coachProfiles = defineCollection({
  loader: glob({ pattern: '*.{es,pt}.md', base: 'src/content/coaches', generateId: idFromPath }),
  schema: z.object({
    /** Short line under the name. Without it the page says "Coach". */
    tagline: z.string().optional(),
  }),
});

const sessions = defineCollection({
  loader: glob({ pattern: '*.{es,pt}.md', base: 'src/content/sessions', generateId: idFromPath }),
  schema: z.object({
    date: isoDate,
    title: z.string(),
    planNote: z.string().optional(),
    logistics: z.array(z.string()).default([]),
  }),
});

const insights = defineCollection({
  loader: glob({ pattern: '*/*.{es,pt}.md', base: 'src/content/insights', generateId: idFromPath }),
  schema: z.object({
    date: isoDate,
    surfer: z.string(),
    focus: z.string(),
    secondaryFocus: z.string(),
    cue: z.string(),
  }),
});

export const collections = { trip, days, surfers, coaches, coachProfiles, sessions, insights };
