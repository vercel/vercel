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
  'lightblue',
  'cyan',
  'purple',
  'violet',
  'fuchsia',
  'orange',
  'pink',
  'indigo',
  'teal',
  'sky',
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
];

function randomElement<T>(arr: T[]): T {
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
 * Generates a default resource name in the format `{productSlug}-{color}-{noun}`.
 * Matches the pattern used by the web checkout flow.
 * Truncates to maxLength characters if the generated name is too long.
 */
export function generateDefaultResourceName(
  productSlug: string,
  maxLength = 128
): string {
  const suffix = generateRandomNameSuffix();
  const fullName = `${productSlug}-${suffix}`;
  if (fullName.length <= maxLength) {
    return fullName;
  }
  return fullName.slice(0, maxLength).replace(/-+$/, '');
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
 * Validates a user-provided resource name.
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
 * Uses the provided name if given (with validation), otherwise auto-generates one.
 */
export function resolveResourceName(
  productSlug: string,
  resourceNameArg?: string
): { resourceName: string } | { error: string } {
  const rule = getValidationRuleForProduct(productSlug);
  const resourceName =
    resourceNameArg ?? generateDefaultResourceName(productSlug, rule.maxLength);

  if (resourceNameArg !== undefined) {
    const validationError = validateResourceName(resourceNameArg, productSlug);
    if (validationError) {
      return { error: validationError };
    }
  }

  return { resourceName };
}
