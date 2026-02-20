export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

export function formatQuantity(quantity: number, unit: string): string {
  if (unit === 'USD') {
    return `$${quantity.toFixed(4)}`;
  }
  return quantity.toFixed(4);
}

export function extractDatePortion(isoString: string): string {
  return isoString.slice(0, 10);
}
