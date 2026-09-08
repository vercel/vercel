export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatBillingAmount(amount: number, unit: string): string {
  return unit === 'USD'
    ? formatCurrency(amount)
    : formatQuantity(amount, 'MIUs');
}

export function formatQuantity(
  quantity: number,
  unit = '',
  options: { compact?: boolean; showSmallValues?: boolean } = {}
): string {
  if (unit === 'USD') {
    return formatCurrency(quantity);
  }

  const displayUnit = quantity === 1 && unit === 'licenses' ? 'license' : unit;
  const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    notation:
      options.compact && Math.abs(quantity) >= 1000 ? 'compact' : 'standard',
  });
  const formattedQuantity = formatter.format(quantity);
  const roundsToZero =
    formatter.format(Math.abs(quantity)) === formatter.format(0);
  const displayQuantity =
    options.showSmallValues && quantity !== 0 && roundsToZero
      ? quantity > 0
        ? `<${formatter.format(0.01)}`
        : `>${formatter.format(-0.01)}`
      : formattedQuantity;

  return displayUnit ? `${displayQuantity} ${displayUnit}` : displayQuantity;
}

export function extractDatePortion(isoString: string): string {
  return isoString.slice(0, 10);
}
