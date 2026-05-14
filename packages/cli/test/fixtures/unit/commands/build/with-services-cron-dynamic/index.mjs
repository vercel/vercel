// A cron service whose schedule list is computed at build time. The
// default export is awaited by `getServiceCrons` to discover entries;
// each entry's `handler` names a function export on this module that
// the dispatcher invokes at runtime.
export default async function getCrons() {
  return [
    { handler: 'hourly', schedule: '0 * * * *' },
    { handler: 'daily', schedule: '0 0 * * *' },
  ];
}

export async function hourly() {
  // hourly job
}

export async function daily() {
  // daily job
}
