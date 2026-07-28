import type Client from '../client';
import output from '../../output-manager';
import { COUNTRIES } from './country-codes';

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

export interface ContactFieldDefinition {
  key: keyof ContactInformation;
  /** CLI flag that prefills this field (e.g. '--first-name'). */
  flag: string;
  label: string;
  required: boolean;
  validate: (value: string) => true | string;
}

const nonEmpty = (label: string) => (value: string) =>
  value.length > 0 || `${label} is required`;

/**
 * Single source of truth for registrant contact fields: flag names, prompt
 * labels, and validation shared by `domains buy` flags and interactive prompts.
 */
export const CONTACT_FIELDS: readonly ContactFieldDefinition[] = [
  {
    key: 'firstName',
    flag: '--first-name',
    label: 'First name',
    required: true,
    validate: nonEmpty('First name'),
  },
  {
    key: 'lastName',
    flag: '--last-name',
    label: 'Last name',
    required: true,
    validate: nonEmpty('Last name'),
  },
  {
    key: 'email',
    flag: '--email',
    label: 'Email',
    required: true,
    validate: (value: string) => {
      if (value.length === 0) return 'Email is required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        return 'Invalid email format';
      return true;
    },
  },
  {
    key: 'phone',
    flag: '--phone',
    label: 'Phone',
    required: true,
    validate: (value: string) => {
      if (value.length === 0) return 'Phone is required';
      if (!/^\+\d{10,15}$/.test(value))
        return 'Phone must start with + and contain 10-15 digits';
      return true;
    },
  },
  {
    key: 'address1',
    flag: '--address',
    label: 'Address',
    required: true,
    validate: nonEmpty('Address'),
  },
  {
    key: 'city',
    flag: '--city',
    label: 'City',
    required: true,
    validate: nonEmpty('City'),
  },
  {
    key: 'state',
    flag: '--state',
    label: 'State/Province',
    required: true,
    validate: nonEmpty('State/Province'),
  },
  {
    key: 'zip',
    flag: '--zip',
    label: 'Postal/ZIP code',
    required: true,
    validate: nonEmpty('Postal/ZIP code'),
  },
  {
    key: 'country',
    flag: '--country',
    label: 'Country',
    required: true,
    validate: (value: string) => {
      if (value.length === 0) return 'Country code is required';
      if (!/^[A-Z]{2}$/i.test(value)) return 'Country code must be 2 letters';
      return true;
    },
  },
  {
    key: 'companyName',
    flag: '--company',
    label: 'Company name',
    required: false,
    validate: () => true,
  },
];

/**
 * Validates prefilled contact values (e.g. from flags).
 * Returns one problem string per invalid field, empty when all valid.
 */
export function validateContactInformation(
  contact: Partial<ContactInformation>
): string[] {
  const problems: string[] = [];
  for (const field of CONTACT_FIELDS) {
    const value = contact[field.key];
    if (value === undefined) {
      continue;
    }
    const result = field.validate(value);
    if (result !== true) {
      problems.push(`Invalid ${field.flag}: ${result}`);
    }
  }
  return problems;
}

/** Uppercases the country code; leaves everything else untouched. */
export function normalizeContactInformation<
  T extends Partial<ContactInformation>,
>(contact: T): T {
  if (contact.country) {
    return { ...contact, country: contact.country.toUpperCase() };
  }
  return contact;
}

/**
 * Collects registrant contact information. Fields already present in
 * `prefill` (e.g. provided as flags) are used as-is and not prompted for.
 */
export default async function collectContactInformation(
  client: Client,
  prefill: Partial<ContactInformation> = {}
): Promise<ContactInformation> {
  const provided = normalizeContactInformation(prefill);
  const missingRequired = CONTACT_FIELDS.filter(
    field => field.required && provided[field.key] === undefined
  );
  // Only ask for optional fields (company) when a prompt session is needed
  // anyway; fully prefilled required fields mean zero prompts.
  const missing = missingRequired.length
    ? CONTACT_FIELDS.filter(field => provided[field.key] === undefined)
    : [];

  if (missing.length > 0) {
    output.log('');
    output.log('Please provide contact information for domain registration:');
  }

  const collected: Partial<ContactInformation> = { ...provided };
  for (const field of missing) {
    collected[field.key] = await promptContactField(client, field);
  }

  const companyName = collected.companyName || undefined;
  return normalizeContactInformation({
    firstName: collected.firstName as string,
    lastName: collected.lastName as string,
    email: collected.email as string,
    phone: collected.phone as string,
    address1: collected.address1 as string,
    city: collected.city as string,
    state: collected.state as string,
    zip: collected.zip as string,
    country: collected.country as string,
    ...(companyName ? { companyName } : {}),
  });
}

async function promptContactField(
  client: Client,
  field: ContactFieldDefinition
): Promise<string> {
  if (field.key === 'country') {
    return promptCountry(client);
  }
  if (field.key === 'phone') {
    return client.input.text({
      message: 'Phone (include country code, e.g., +15551234567):',
      validate: field.validate,
    });
  }
  if (field.key === 'companyName') {
    return client.input.text({
      message: 'Company name (optional):',
    });
  }
  return client.input.text({
    message: `${field.label}:`,
    validate: field.validate,
  });
}

async function promptCountry(client: Client): Promise<string> {
  const choices = COUNTRIES.map(country => ({
    name: `${country.name} (${country.code})`,
    value: country.code,
  }));
  return client.input.search<string>({
    message: 'Country:',
    pageSize: 10,
    source: term => {
      const searchTerm = term?.trim().toLowerCase();
      if (!searchTerm) {
        return choices;
      }
      return choices.filter(
        choice =>
          choice.name.toLowerCase().includes(searchTerm) ||
          choice.value.toLowerCase() === searchTerm
      );
    },
  });
}
