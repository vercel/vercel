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

export default async function collectContactInformation(
  client: Client
): Promise<ContactInformation> {
  output.log('');
  output.log('Please provide contact information for domain registration:');

  const firstName = await client.input.text({
    message: 'First name:',
    validate: (val: string) => val.length > 0 || 'First name is required',
  });

  const lastName = await client.input.text({
    message: 'Last name:',
    validate: (val: string) => val.length > 0 || 'Last name is required',
  });

  const email = await client.input.text({
    message: 'Email:',
    validate: (val: string) => {
      if (val.length === 0) return 'Email is required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val))
        return 'Invalid email format';
      return true;
    },
  });

  const phone = await client.input.text({
    message: 'Phone (include country code, e.g., +15551234567):',
    validate: (val: string) => {
      if (val.length === 0) return 'Phone is required';
      if (!/^\+\d{10,15}$/.test(val))
        return 'Phone must start with + and contain 10-15 digits';
      return true;
    },
  });

  const address1 = await client.input.text({
    message: 'Address:',
    validate: (val: string) => val.length > 0 || 'Address is required',
  });

  const city = await client.input.text({
    message: 'City:',
    validate: (val: string) => val.length > 0 || 'City is required',
  });

  const state = await client.input.text({
    message: 'State/Province:',
    validate: (val: string) => val.length > 0 || 'State/Province is required',
  });

  const zip = await client.input.text({
    message: 'Postal/ZIP code:',
    validate: (val: string) => val.length > 0 || 'Postal/ZIP code is required',
  });

  const country = await client.input.text({
    message: 'Country code (2 letters, e.g., US):',
    validate: (val: string) => {
      if (val.length === 0) return 'Country code is required';
      if (!/^[A-Z]{2}$/i.test(val)) return 'Country code must be 2 letters';
      return true;
    },
  });

  const companyName = await client.input.text({
    message: 'Company name (optional):',
  });

  return {
    firstName,
    lastName,
    email,
    phone,
    address1,
    city,
    state,
    zip,
    country: country.toUpperCase(),
    companyName: companyName || undefined,
  };
}
