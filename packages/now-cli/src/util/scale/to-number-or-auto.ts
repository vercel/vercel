const AUTO: 'auto' = 'auto';

export default function toNumberOrAuto(value: string): number | 'auto' {
  return value !== AUTO ? Number(value) : AUTO;
}
