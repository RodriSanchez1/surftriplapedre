import { splitLangId } from './localized';

export interface IntegrityInput {
  trip: { fechaInicio: string; fechaFin: string };
  surfistaIds: string[];
  dias: { id: string; sesion?: string }[];
  sesionIds: string[];
  insights: { id: string; data: { surfista: string; fecha: string } }[];
}

/** Revisa las referencias entre archivos de contenido. Devuelve un error legible por problema. */
export function findContentErrors({ trip, surfistaIds, dias, sesionIds, insights }: IntegrityInput): string[] {
  const errors: string[] = [];
  const surfistas = new Set(surfistaIds);
  const sesiones = new Set(sesionIds.map((id) => splitLangId(id).base));

  for (const dia of dias) {
    if (dia.id < trip.fechaInicio || dia.id > trip.fechaFin) {
      errors.push(`dias.yaml: el día ${dia.id} está fuera del trip (${trip.fechaInicio} → ${trip.fechaFin})`);
    }
    if (dia.sesion && !sesiones.has(dia.sesion)) {
      errors.push(`dias.yaml: el día ${dia.id} apunta a la sesión ${dia.sesion}, que no tiene src/content/sesiones/${dia.sesion}.es.md`);
    }
  }

  for (const insight of insights) {
    const { base } = splitLangId(insight.id);
    const [carpeta, archivo] = base.split('/');
    if (!surfistas.has(insight.data.surfista)) {
      errors.push(`insights/${insight.id}.md: el surfista "${insight.data.surfista}" no está en surfistas.yaml`);
    }
    if (carpeta !== insight.data.fecha) {
      errors.push(`insights/${insight.id}.md: la fecha ${insight.data.fecha} no coincide con la carpeta ${carpeta}`);
    }
    if (archivo !== insight.data.surfista) {
      errors.push(`insights/${insight.id}.md: el archivo se llama "${archivo}" pero el surfista es "${insight.data.surfista}"`);
    }
    if (!sesiones.has(insight.data.fecha)) {
      errors.push(`insights/${insight.id}.md: no existe la sesión src/content/sesiones/${insight.data.fecha}.es.md`);
    }
  }

  return errors;
}
