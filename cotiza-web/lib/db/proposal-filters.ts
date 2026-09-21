import type { Prisma } from "@prisma/client";

// Excluye las propuestas descartadas SIN excluir las que no tienen outcome.
//
// OJO: en Prisma `outcome: { not: "discarded" }` NO devuelve las filas con
// outcome NULL (logica de tres valores de SQL: NULL <> 'x' no es verdadero).
// Como casi toda propuesta viva (borrador, enviada, en revision) tiene
// outcome NULL, ese filtro solo dejaba ver las ya etiquetadas ganada/perdida
// -- las demas desaparecian de /propuestas (2026-09-17 al 2026-09-21). Por eso
// el NULL se pide de forma explicita. Se usa dentro de AND: [...] para no
// pisar el OR de scoping por vendedor.
export const NOT_DISCARDED_WHERE: Prisma.proposalsWhereInput = {
  OR: [{ outcome: null }, { outcome: { not: "discarded" } }],
};
