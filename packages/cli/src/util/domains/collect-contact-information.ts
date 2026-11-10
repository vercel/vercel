import type { Team } from '@vercel-internals/types';
import type Client from '../client';
import output from '../../output-manager';

export type ContactInformation = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  companyName?: string;
};

export type ContactField = keyof ContactInformation;
export type PartialContact = Partial<ContactInformation>;

type RequiredContactField = Exclude<ContactField, 'companyName'>;

/**
 * Each contact field, its `domains buy` flag, and its prompt, in prompt order.
 * `validate` returns `true` or the problem with the value; the prompts and the
 * flags share it so both accept the same details.
 */
export const CONTACT_FIELDS: ReadonlyArray<{
  field: ContactField;
  flag: string;
  label: string;
  prompt: string;
  validate?: (val: string) => true | string;
}> = [
  {
    field: 'firstName',
    flag: '--first-name',
    label: 'First name',
    prompt: 'First name:',
    validate: val => val.length > 0 || 'First name is required',
  },
  {
    field: 'lastName',
    flag: '--last-name',
    label: 'Last name',
    prompt: 'Last name:',
    validate: val => val.length > 0 || 'Last name is required',
  },
  {
    field: 'email',
    flag: '--email',
    label: 'Email',
    prompt: 'Email:',
    validate: val => {
      if (val.length === 0) return 'Email is required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val))
        return 'Invalid email format';
      return true;
    },
  },
  {
    field: 'phone',
    flag: '--phone',
    label: 'Phone',
    prompt: 'Phone (include country code, e.g., +15551234567):',
    validate: val => {
      if (val.length === 0) return 'Phone is required';
      if (!/^\+\d{10,15}$/.test(val))
        return 'Phone must start with + and contain 10-15 digits';
      return true;
    },
  },
  {
    field: 'address1',
    flag: '--address',
    label: 'Address',
    prompt: 'Address:',
    validate: val => val.length > 0 || 'Address is required',
  },
  {
    field: 'city',
    flag: '--city',
    label: 'City',
    prompt: 'City:',
    validate: val => val.length > 0 || 'City is required',
  },
  {
    field: 'state',
    flag: '--state',
    label: 'State',
    prompt: 'State/Province:',
    validate: val => val.length > 0 || 'State/Province is required',
  },
  {
    field: 'zip',
    flag: '--zip',
    label: 'ZIP',
    prompt: 'Postal/ZIP code:',
    validate: val => val.length > 0 || 'Postal/ZIP code is required',
  },
  {
    field: 'country',
    flag: '--country',
    label: 'Country',
    prompt: 'Country code (2 letters, e.g., US):',
    validate: val => {
      if (val.length === 0) return 'Country code is required';
      if (!/^[A-Z]{2}$/i.test(val)) return 'Country code must be 2 letters';
      return true;
    },
  },
  {
    field: 'companyName',
    flag: '--company',
    label: 'Company',
    prompt: 'Company name (optional):',
  },
];

const ADDRESS_FIELDS: ReadonlySet<ContactField> = new Set([
  'address1',
  'city',
  'state',
  'zip',
  'country',
]);

/**
 * Reads the contact flags. Returns the first invalid flag as an error message,
 * which names the flag but never echoes its value.
 */
export function readContactFlags(
  flags: Record<string, unknown>
): PartialContact | string {
  const contact: PartialContact = {};
  for (const { field, flag, validate } of CONTACT_FIELDS) {
    const raw = flags[flag];
    if (typeof raw !== 'string') continue;
    // An empty optional field (`--company ''`) is kept as '' so it counts as
    // answered: no company, and no prompt for one.
    const value = raw.trim();
    const result = validate ? validate(value) : true;
    if (result !== true) {
      return `Invalid ${flag}. ${result}.`;
    }
    contact[field] = field === 'country' ? value.toUpperCase() : value;
  }
  return contact;
}

type BillingWithAddress = Team['billing'] & {
  name?: string | null;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  } | null;
};

/**
 * Registrant defaults from the team's billing info. The API only returns the
 * billing address and email to roles that can read them, and billing never has
 * the registrant's name or phone. The billing name isn't used as the company:
 * on a personal team it's a person. Values that wouldn't pass validation are
 * left out so they're asked for instead.
 */
export function getBillingContact(team: Team | null): PartialContact {
  const billing = team?.billing as BillingWithAddress | undefined;
  if (!billing) return {};
  const address = billing.address;
  const line1 = address?.line1?.trim();
  const line2 = address?.line2?.trim();
  const country = address?.country?.trim().toUpperCase();
  // Billing stores states with a country prefix (`US-TX`, `CA-ON`), or
  // sometimes as the full name. The prefix is dropped for every country; a US
  // state that isn't a 2-letter code is asked for instead.
  const rawState = address?.state?.trim();
  const state =
    country && rawState?.toUpperCase().startsWith(`${country}-`)
      ? rawState.slice(country.length + 1)
      : rawState;
  const candidates: PartialContact = {
    email: billing.email,
    address1: line1 && line2 ? `${line1}, ${line2}` : line1,
    city: address?.city,
    state: country === 'US' && !/^[A-Z]{2}$/i.test(state ?? '') ? '' : state,
    zip: address?.postalCode,
    country,
  };

  const contact: PartialContact = {};
  for (const { field, validate } of CONTACT_FIELDS) {
    const value = candidates[field]?.trim();
    if (value && (!validate || validate(value) === true)) {
      contact[field] = value;
    }
  }
  return contact;
}

/**
 * Fills the fields not passed as flags from the billing defaults. Replacing a
 * billing address value with a flag skips the whole billing address, so a new
 * street never mixes with the old city. Filling an address field billing
 * doesn't have (a missing state) keeps the rest of it.
 */
export function mergeContact(
  fromFlags: PartialContact,
  billing: PartialContact
): PartialContact {
  const ownAddress = [...ADDRESS_FIELDS].some(
    field => fromFlags[field] !== undefined && billing[field] !== undefined
  );
  const merged: PartialContact = {};
  for (const { field } of CONTACT_FIELDS) {
    const fallback =
      ownAddress && ADDRESS_FIELDS.has(field) ? undefined : billing[field];
    const value = fromFlags[field] ?? fallback;
    if (value !== undefined) merged[field] = value;
  }
  return merged;
}

/**
 * The billing fields `mergeContact` would actually use: not replaced by a
 * flag, and no billing address once a flag replaces part of it.
 */
export function billingFieldsUsed(
  fromFlags: PartialContact,
  billing: PartialContact
): PartialContact {
  const merged = mergeContact(fromFlags, billing);
  const used: PartialContact = {};
  for (const { field } of CONTACT_FIELDS) {
    if (fromFlags[field] === undefined && merged[field] !== undefined) {
      used[field] = merged[field];
    }
  }
  return used;
}

/** The required fields still missing, in prompt order. */
export function missingContactFields(
  contact: PartialContact
): RequiredContactField[] {
  return CONTACT_FIELDS.filter(
    ({ field, validate }) => validate && !contact[field]
  ).map(({ field }) => field as RequiredContactField);
}

/**
 * Prompts for each contact field not already in `provided`, showing the
 * billing value as the default so Enter accepts it.
 */
export default async function collectContactInformation(
  client: Client,
  {
    provided = {},
    defaults = {},
  }: { provided?: PartialContact; defaults?: PartialContact } = {}
): Promise<ContactInformation> {
  const contact: PartialContact = { ...provided };
  const pending = CONTACT_FIELDS.filter(({ field }) => !(field in provided));

  if (pending.length > 0) {
    output.log('');
    output.log('Please provide contact information for domain registration:');
  }

  for (const { field, prompt, validate } of pending) {
    const value = await client.input.text({
      message: prompt,
      default: defaults[field],
      validate,
    });
    if (value) contact[field] = value;
  }

  return {
    ...(contact as ContactInformation),
    country: (contact.country as string).toUpperCase(),
    companyName: contact.companyName || undefined,
  };
}
