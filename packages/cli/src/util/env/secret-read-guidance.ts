export function getUnavailableSecretValuesMessage(
  environment: string,
  count: number
): string {
  const values = count === 1 ? 'value' : 'values';
  if (environment === 'development') {
    return `${count} Development Secret ${values} ${
      count === 1 ? 'was' : 'were'
    } not returned by Vercel.`;
  }
  return `${count} Secret ${values} cannot be pulled from the \`${environment}\` Environment.`;
}

export function getLocalSecretFallbackMessage(count: number): string {
  return ` Define ${count === 1 ? 'it' : 'them'} in a local .env file.`;
}
