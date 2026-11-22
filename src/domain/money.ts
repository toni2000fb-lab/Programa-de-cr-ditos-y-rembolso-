/** Utilidades de dinero. Internamente todo se maneja en centavos enteros. */

/**
 * Moneda de presentación. Los importes son los mismos números de siempre: no hay conversión,
 * solo cambia cómo se muestran. Para volver a dólares basta con cambiar estas dos constantes.
 */
export const CURRENCY_CODE = "GTQ";
export const CURRENCY_SYMBOL = "Q";

/** Tope de cualquier importe que se escribe en un formulario (10 millones), para evitar desbordes. */
export const MAX_MONEY = 10_000_000;

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

// Separador de miles con coma y decimales con punto, como se escribe en Guatemala.
// Se fija el idioma para que el resultado no dependa de los datos regionales del servidor.
const amount = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Da formato de moneda a un importe en centavos, por ejemplo `Q50,000.00`. */
export function formatMoney(cents: number): string {
  return `${cents < 0 ? "-" : ""}${CURRENCY_SYMBOL}${amount.format(Math.abs(cents) / 100)}`;
}
