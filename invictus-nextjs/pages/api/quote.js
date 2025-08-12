// Simple stub to inspect form submissions in dev or pipe to a CRM later
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method not allowed' });
  const { name, phone, email, zip, coverage, addons, notes } = req.body || {};
  console.log('Quote request:', { name, phone, email, zip, coverage, addons, notes });
  return res.status(200).json({ ok:true });
}
