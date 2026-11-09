export const OPERATION_MODES = ["consultative", "pos", "mixed"] as const;
export type OperationMode = typeof OPERATION_MODES[number];

export const OPERATION_MODE_DETAILS: Record<OperationMode, { label: string; description: string }> = {
  consultative: { label: "Venta consultiva", description: "Oportunidades, cotizaciones y propuestas con seguimiento comercial." },
  pos: { label: "Punto de venta", description: "Venta de mostrador. Requiere conectar un POS; la caja y el inventario todavía no están disponibles en Cotiza." },
  mixed: { label: "Mixta", description: "Venta consultiva y mostrador. El uso de mostrador requiere conectar un POS." },
};

export function isOperationMode(value: unknown): value is OperationMode {
  return OPERATION_MODES.some(mode => mode === value);
}
