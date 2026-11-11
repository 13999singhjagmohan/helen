import { readFileSync, existsSync } from 'node:fs';

// Minimal .env loader (no dependencies).
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

export const config = {
  port: Number(process.env.PORT || 3000),
  provider: process.env.LLM_PROVIDER || 'mock',
  baseUrl: process.env.LLM_BASE_URL || 'http://localhost:11434/v1',
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'llama3.1',
  providerAllowsExplicit: process.env.PROVIDER_ALLOWS_EXPLICIT === 'true',
  imageProvider: process.env.IMAGE_PROVIDER || 'none',
  imageBaseUrl: process.env.IMAGE_BASE_URL || 'http://localhost:7860/v1',
  imageApiKey: process.env.IMAGE_API_KEY || '',
  imageModel: process.env.IMAGE_MODEL || 'sdxl',
  appName: process.env.APP_NAME || 'Helen',
  minAge: 18,
};
