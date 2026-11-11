import { config } from '../config.js';
import { mockAdapter } from './mock.js';
import { openAICompatibleAdapter } from './openai-compatible.js';

// To add a provider: create a file exporting { name, allowsExplicit, chat({messages}) => string }
// and register it here.
export function createAdapter() {
  switch (config.provider) {
    case 'openai-compatible':
      return openAICompatibleAdapter({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        allowsExplicit: config.providerAllowsExplicit,
      });
    case 'mock':
    default:
      return mockAdapter;
  }
}
