export const runtime = 'nodejs';
export const preferredRegion = ['iad1', 'sfo1'];
export const dynamic = 'force-dynamic';

export default function NodeSpecific() {
  return <div>Node Specific Regions</div>;
}
