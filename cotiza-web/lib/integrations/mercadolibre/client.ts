import "server-only";
import { z } from "zod";
import { mercadoLibreConfig, MercadoLibreError } from "./config";

const id = z.union([z.string().regex(/^[1-9]\d{0,17}$/), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]).transform(String);
const amount = z.number().finite().nonnegative().max(1e12).refine(n => /^\d+(\.\d{1,6})?$/.test(String(n))).transform(String);
const orderSchema = z.object({
  id, pack_id: id.nullable().optional(), seller: z.object({ id }), buyer: z.object({ id }).optional(),
  status: z.string().min(1).max(60), currency_id: z.string().regex(/^[A-Z]{3}$/),
  date_created: z.string().datetime({ offset: true }), total_amount: amount,
  order_items: z.array(z.object({
    item: z.object({ id: z.string().min(1).max(60), title: z.string().min(1).max(1000),
      seller_sku: z.string().max(200).nullable().optional() }),
    quantity: z.number().int().positive().max(1e9), unit_price: amount,
  })).min(1).max(500),
});
export type MercadoLibreSale = {
  orderId: string; packId: string | null; sellerId: string; buyerId: string | null;
  status: string; currency: string; createdAt: string; total: string;
  items: { itemId: string; title: string; sku: string | null; quantity: number; unitPrice: string }[];
};
export function normalizeOrder(value: unknown, sellerId: string): MercadoLibreSale {
  const parsed = orderSchema.safeParse(value);
  if (!parsed.success) throw new MercadoLibreError("La venta recibida está incompleta; no se importó", 502);
  const row = parsed.data;
  if (row.seller.id !== sellerId) throw new MercadoLibreError("La venta no pertenece a la cuenta conectada", 502);
  return { orderId: row.id, packId: row.pack_id ?? null, sellerId: row.seller.id, buyerId: row.buyer?.id ?? null,
    status: row.status, currency: row.currency_id, createdAt: row.date_created, total: row.total_amount,
    items: row.order_items.map(line => ({ itemId: line.item.id, title: line.item.title, sku: line.item.seller_sku ?? null,
      quantity: line.quantity, unitPrice: line.unit_price })) };
}

export const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1),
  expires_in: z.number().int().positive().max(86400 * 30), user_id: id });
export type MercadoLibreToken = z.infer<typeof tokenSchema>;

async function request(path: string, init: RequestInit) {
  // Fixed HTTPS host, bounded requests, no redirects and no provider bodies in errors/logs.
  try {
    const response = await fetch(`https://api.mercadolibre.com${path}`, {
      ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new MercadoLibreError(response.status === 401 || response.status === 403
      ? "Mercado Libre requiere revisar permisos o reconectar la cuenta" : "Mercado Libre no respondió; intenta consultar más tarde",
      response.status === 401 || response.status === 403 ? 409 : 502);
    return await response.json();
  } catch (error) {
    if (error instanceof MercadoLibreError) throw error;
    throw new MercadoLibreError("No se pudo confirmar la respuesta de Mercado Libre", 502);
  }
}

export async function exchangeToken(fields: Record<string, string>) {
  const config = mercadoLibreConfig();
  const data = await request("/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...fields, client_id: config.clientId, client_secret: config.clientSecret }) });
  const parsed = tokenSchema.safeParse(data);
  if (!parsed.success) throw new MercadoLibreError("No se pudo verificar la autorización de Mercado Libre", 502);
  return parsed.data;
}

export async function verifyAccount(token: MercadoLibreToken) {
  const parsed = z.object({ id, site_id: z.literal("MLM"), nickname: z.string().max(200) }).safeParse(
    await request("/users/me", { headers: { Authorization: `Bearer ${token.access_token}` } }));
  if (!parsed.success || parsed.data.id !== token.user_id) throw new MercadoLibreError("Se requiere una cuenta de Mercado Libre México", 422);
  return parsed.data;
}

export async function searchSales(accessToken: string, sellerId: string, offset: number) {
  const query = new URLSearchParams({ seller: sellerId, sort: "date_desc", limit: "50", offset: String(offset) });
  const data = await request(`/orders/search?${query}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const parsed = z.object({ results: z.array(z.unknown()).max(50),
    paging: z.object({ total: z.number().int().nonnegative(), offset: z.number().int(), limit: z.number().int().positive() }) }).safeParse(data);
  if (!parsed.success || parsed.data.paging.offset !== offset) throw new MercadoLibreError("No se pudo verificar la página de ventas", 502);
  return { sales: parsed.data.results.map(row => normalizeOrder(row, sellerId)), total: parsed.data.paging.total,
    nextOffset: offset + parsed.data.results.length < parsed.data.paging.total && parsed.data.results.length
      ? offset + parsed.data.results.length : null };
}
