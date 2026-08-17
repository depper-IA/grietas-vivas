/**
 * Server Action — Certified Timestamp
 *
 * Returns the current server timestamp as an ISO 8601 string.
 * Used to provide legally-verifiable timestamps for photo captures.
 */

'use server';

export async function getServerTimestampAction(): Promise<{
  timestamp: string;
  source: 'server';
}> {
  return {
    timestamp: new Date().toISOString(),
    source: 'server',
  };
}
