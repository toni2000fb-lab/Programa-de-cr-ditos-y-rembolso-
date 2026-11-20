/** Utilidades de dinero. Internamente todo se maneja en centavos enteros. */

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatUSD(cents: number): string {
  return usd.format(cents / 100);
}
