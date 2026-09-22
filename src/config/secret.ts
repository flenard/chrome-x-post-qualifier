import localSecret from './local-secret.json';

const rawKey = (localSecret as any)?.apiKey;
export const INITIAL_API_KEY: string = typeof rawKey === 'string' ? rawKey.trim() : (rawKey?.apiKey || '');

