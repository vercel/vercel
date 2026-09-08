export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatBillingAmount(amount: number, unit: string): string {
  return unit === 'managed_infrastructure_units'
    ? formatQuantity(amount, 'MIUs')
    : formatCurrency(amount);
}

export function formatQuantity(
  quantity: number,
  unit = '',
  options: {
    compact?: boolean;
    showSmallValues?: boolean;
    singularUnit?: string;
    unitKind?: string;
  } = {}
): string {
  if (unit === 'USD') {
    return formatCurrency(quantity);
  }

  if (options.unitKind === 'digitalStorage') {
    return formatStorageQuantity(quantity, unit);
  }

  const displayUnit =
    quantity === 1 && options.singularUnit ? options.singularUnit : unit;
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

function formatStorageQuantity(quantity: number, unit: string): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'];
  const symbols = ['B', 'KB', 'MB', 'GB', 'TB'];
  const startIndex = units.indexOf(unit.toLowerCase());
  if (startIndex === -1) return formatQuantity(quantity, unit);

  let value = quantity;
  let unitIndex = startIndex;
  while (Math.abs(value) >= 1000 && unitIndex < symbols.length - 1) {
    value /= 1000;
    unitIndex++;
  }

  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value)} ${symbols[unitIndex]}`;
}

export function extractDatePortion(isoString: string): string {
  return isoString.slice(0, 10);
}
