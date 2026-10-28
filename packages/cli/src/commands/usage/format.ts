export function formatUsageAmount(amount: number, unit: string): string {
  if (unit === 'managed_infrastructure_units') {
    return formatUsageQuantity(amount, 'MIUs', { showSmallValues: true });
  }

  const formattedAmount = amount.toFixed(2);
  if (amount !== 0 && Number(formattedAmount) === 0) {
    return amount > 0 ? '<$0.01' : '>-$0.01';
  }
  return `$${formattedAmount}`;
}

export function formatUsageQuantity(
  quantity: number,
  unit = '',
  options: {
    compact?: boolean;
    showSmallValues?: boolean;
    singularUnit?: string;
    unitKind?: string;
  } = {}
): string {
  const displayUnit =
    quantity === 1 && options.singularUnit ? options.singularUnit : unit;

  if (options.unitKind === 'digitalStorage') {
    return formatStorageQuantity(quantity, unit, options.showSmallValues);
  }

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

function formatStorageQuantity(
  quantity: number,
  unit: string,
  showSmallValues = false
): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'];
  const symbols = ['B', 'KB', 'MB', 'GB', 'TB'];
  const startIndex = units.indexOf(unit.toLowerCase());
  if (startIndex === -1) {
    return formatUsageQuantity(quantity, unit, { showSmallValues });
  }

  let value = quantity;
  let unitIndex = startIndex;
  while (Math.abs(value) >= 1000 && unitIndex < symbols.length - 1) {
    value /= 1000;
    unitIndex++;
  }

  return formatUsageQuantity(value, symbols[unitIndex], { showSmallValues });
}
