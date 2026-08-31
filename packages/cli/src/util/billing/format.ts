export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatQuantity(quantity: number, unit: string): string {
  if (unit === 'USD') {
    return formatCurrency(quantity);
  }

  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    notation: Math.abs(quantity) >= 1000 ? 'compact' : 'standard',
  }).format(quantity)} ${unit}`;
}

export function extractDatePortion(isoString: string): string {
  return isoString.slice(0, 10);
}
