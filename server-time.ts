import type { Handler } from '@netlify/functions';
// Public, no data: lets the browser correct clock skew for the 1-hour display (display only).
export const handler: Handler = async () => ({
  statusCode: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify({ now: Date.now() }),
});
