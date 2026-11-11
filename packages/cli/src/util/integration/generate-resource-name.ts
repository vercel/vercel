const COLORS = [
  'gray',
  'red',
  'rose',
  'yellow',
  'amber',
  'green',
  'lime',
  'emerald',
  'blue',
  'cyan',
  'purple',
  'violet',
  'fuchsia',
  'orange',
  'pink',
  'indigo',
  'teal',
  'sky',
  'aero',
  'alizarin',
  'almond',
  'amethyst',
  'apricot',
  'aqua',
  'aquamarine',
  'aureolin',
  'beige',
  'bisque',
  'bistre',
  'bole',
  'bronze',
  'byzantine',
  'byzantium',
  'camel',
  'canary',
  'carmine',
  'celeste',
  'cerise',
  'cerulean',
  'champagne',
  'charcoal',
  'chestnut',
  'cinereous',
  'cinnabar',
  'citrine',
  'citron',
  'claret',
  'cobalt',
  'coffee',
  'copper',
  'coquelicot',
  'coral',
  'cordovan',
  'crimson',
  'cyclamen',
  'erin',
  'fulvous',
];

const NOUNS = [
  'apple',
  'ball',
  'car',
  'dog',
  'elephant',
  'flower',
  'garden',
  'house',
  'island',
  'jacket',
  'kite',
  'lamp',
  'mountain',
  'notebook',
  'ocean',
  'park',
  'queen',
  'river',
  'school',
  'tree',
  'umbrella',
  'village',
  'window',
  'xylophone',
  'yacht',
  'zebra',
  'book',
  'chair',
  'door',
  'grass',
  'anchor',
  'arrow',
  'basket',
  'battery',
  'bell',
  'blanket',
  'branch',
  'bridge',
  'brush',
  'bucket',
  'button',
  'cable',
  'candle',
  'canvas',
  'castle',
  'cave',
  'clock',
  'cloud',
  'coin',
  'compass',
  'crystal',
  'curtain',
  'cushion',
  'desert',
  'diamond',
  'drawer',
  'drum',
  'engine',
  'envelope',
  'feather',
  'fence',
  'ferry',
  'field',
  'flame',
  'flask',
  'forest',
  'fountain',
  'globe',
  'harbor',
  'helmet',
  'horizon',
  'kettle',
  'ladder',
  'lantern',
  'leaf',
  'lens',
  'lever',
  'lighthouse',
  'magnet',
  'marble',
  'mirror',
  'nest',
  'paddle',
  'pebble',
  'pendant',
  'pillar',
  'pillow',
  'planet',
  'plank',
  'pocket',
  'prism',
  'ribbon',
  'ridge',
  'saddle',
  'sail',
];

/**
 * Longest name the CLI generates when `--name` is not passed. It fits the
 * strictest known partner limit: MongoDB Atlas truncates cluster names to 23
 * characters (and rejects a truncated name ending in "-"), and Turso caps
 * database names at 26.
 */
export const MAX_GENERATED_NAME_LENGTH = 23;

const UNIQUE_SUFFIX_LENGTH = 4;
const UNIQUE_SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomElement<T>(arr: ArrayLike<T>): T {
  return arr[Math.floor(arr.length * Math.random())];
}

/**
 * Generates a random resource name suffix in the format `{color}-{noun}`.
 * Uses the same word lists as the web UI for consistency.
 */
export function generateRandomNameSuffix(): string {
  return `${randomElement(COLORS)}-${randomElement(NOUNS)}`;
}

/**
 * Generates a short random suffix of lowercase letters and digits (36^4,
 * about 1.7 million values), so a generated name is unlikely to collide with
 * a resource that already exists at the partner.
 */
export function generateUniqueNameSuffix(): string {
  let suffix = '';
  for (let i = 0; i < UNIQUE_SUFFIX_LENGTH; i++) {
    suffix += randomElement(UNIQUE_SUFFIX_ALPHABET);
  }
  return suffix;
}

/**
 * Generates a default resource name: the longest whole-word prefix of
 * `{productSlug}-{color}-{noun}` that fits, followed by a random unique
 * suffix, e.g. `neon-gray-apple-k3x9` or `upstash-redis-gray-k3x9`.
 *
 * The suffix is always kept, so the name stays unique however much of the
 * prefix has to be dropped, and the result never exceeds
 * `MAX_GENERATED_NAME_LENGTH` (or `maxLength`, when that is lower).
 */
export function generateDefaultResourceName(
  productSlug: string,
  maxLength = MAX_GENERATED_NAME_LENGTH
): string {
  const limit = Math.min(maxLength, MAX_GENERATED_NAME_LENGTH);
  const words = `${productSlug}-${generateRandomNameSuffix()}`
    .split('-')
    .filter(Boolean);
  const suffix = generateUniqueNameSuffix();
  // Room left for the prefix once the suffix and its "-" are reserved.
  const budget = Math.max(limit - suffix.length - 1, 0);

  let prefix = '';
  for (const word of words) {
    const next = prefix ? `${prefix}-${word}` : word;
    if (next.length > budget) {
      break;
    }
    prefix = next;
  }
  if (!prefix) {
    // The first word alone does not fit: keep as much of it as possible.
    prefix = words[0]?.slice(0, budget) ?? '';
  }

  const name = prefix ? `${prefix}-${suffix}` : suffix;
  return name.slice(0, limit);
}

const ALREADY_TAKEN_PATTERN =
  /\balready (?:exists?|taken|been taken|in use)\b/i;
const SAME_NAME_PATTERN = /\bsame name\b/i;

/**
 * Whether an auto-provision fallback says that `resourceName` is already taken
 * at the partner, so provisioning again with a different name can succeed.
 *
 * Partner errors arrive as `kind: 'unknown'`, `reason: 'error'` with the
 * partner's text in `error_message`. A message counts only when it says
 * something already exists and either names the requested resource or says
 * "same name". For example:
 * - Supabase: `Project with name "<name>" already exists in your organization.`
 * - Upstash: `database with same name already exists`, or
 *   `database with name <name> already exists`
 * - MongoDB Atlas: `A project named '<name>' already exists in Atlas. …`
 *
 * Other conflicts, such as Supabase's `You are already a member of an
 * organization named "…"` (the organization comes from the team, not the
 * resource name), an installation-level `Organization named "…" already
 * exists`, or a domain that is already registered, do not match, because a
 * new resource name cannot fix them.
 */
export function isResourceNameTakenError(
  result: { kind: string; reason?: string; error_message?: string },
  resourceName: string
): boolean {
  const message = result.error_message;
  if (
    result.kind !== 'unknown' ||
    result.reason !== 'error' ||
    typeof message !== 'string' ||
    !ALREADY_TAKEN_PATTERN.test(message)
  ) {
    return false;
  }
  return (
    message.toLowerCase().includes(resourceName.toLowerCase()) ||
    SAME_NAME_PATTERN.test(message)
  );
}

interface ValidationRule {
  minLength: number;
  maxLength: number;
  pattern: RegExp;
  patternErrorMessage: string;
  customValidation?: (name: string) => string | undefined;
}

const DEFAULT_VALIDATION_RULE: ValidationRule = {
  minLength: 1,
  maxLength: 128,
  pattern: /^[a-zA-Z0-9_-]*$/,
  patternErrorMessage:
    'Resource name can only contain letters, numbers, underscores, and hyphens',
};

const VALIDATION_RULES: Record<string, ValidationRule> = {
  'aws-dsql': {
    minLength: 1,
    maxLength: 128,
    pattern: /^[a-zA-Z0-9_-]*$/,
    patternErrorMessage:
      'Resource name can only contain letters, numbers, underscores, and hyphens',
  },
  'aws-apg': {
    minLength: 1,
    maxLength: 50,
    pattern: /^[a-zA-Z][a-zA-Z0-9-]*$/,
    patternErrorMessage:
      'Resource name must start with a letter and can only contain letters, numbers, and hyphens',
    customValidation: (name: string) => {
      if (name.endsWith('-')) {
        return 'Resource name cannot end with a hyphen';
      }
      if (name.includes('--')) {
        return 'Resource name cannot contain consecutive hyphens';
      }
      return undefined;
    },
  },
  'aws-dynamodb': {
    minLength: 3,
    maxLength: 128,
    pattern: /^[a-zA-Z0-9_-]*$/,
    patternErrorMessage:
      'Resource name can only contain letters, numbers, underscores, and hyphens',
  },
};

/**
 * Gets the validation rule for a product slug.
 */
export function getValidationRuleForProduct(
  productSlug?: string
): ValidationRule {
  if (!productSlug) {
    return DEFAULT_VALIDATION_RULE;
  }
  return VALIDATION_RULES[productSlug.toLowerCase()] ?? DEFAULT_VALIDATION_RULE;
}

/**
 * Validates a resource name.
 * Returns an error message if invalid, or undefined if valid.
 * Optionally accepts a product slug for product-specific validation.
 */
export function validateResourceName(
  name: string,
  productSlug?: string
): string | undefined {
  const rule = getValidationRuleForProduct(productSlug);

  if (!name || name.trim().length === 0) {
    return 'Resource name cannot be empty';
  }

  if (name.length < rule.minLength) {
    return `Resource name must be at least ${rule.minLength} character${rule.minLength === 1 ? '' : 's'}`;
  }

  if (name.length > rule.maxLength) {
    return `Resource name cannot exceed ${rule.maxLength} characters`;
  }

  if (!rule.pattern.test(name)) {
    return rule.patternErrorMessage;
  }

  if (rule.customValidation) {
    const customError = rule.customValidation(name);
    if (customError) {
      return customError;
    }
  }

  return undefined;
}

/**
 * Resolves and validates the resource name for provisioning.
 * Uses the provided name if given, otherwise auto-generates one.
 * Validates the resolved name against product-specific rules in either case.
 * `isGenerated` is true when the CLI chose the name, so callers may replace it.
 */
export function resolveResourceName(
  productSlug: string,
  resourceNameArg?: string
): { resourceName: string; isGenerated: boolean } | { error: string } {
  const rule = getValidationRuleForProduct(productSlug);
  const isGenerated = resourceNameArg === undefined;
  const resourceName =
    resourceNameArg ?? generateDefaultResourceName(productSlug, rule.maxLength);

  const validationError = validateResourceName(resourceName, productSlug);
  if (validationError) {
    return {
      error: isGenerated
        ? `${validationError}. Use --name to provide a valid resource name.`
        : validationError,
    };
  }

  return { resourceName, isGenerated };
}
