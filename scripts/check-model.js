// Verifies that the configured model endpoint answers. Usage: npm run check-model
import { config } from '../src/config.js';
import { createAdapter } from '../src/adapters/index.js';

const adapter = createAdapter();
console.log(`Provider: ${adapter.name}  Endpoint: ${config.baseUrl}  Model: ${config.model}`);
try {
  const reply = await adapter.chat({ messages: [
    { role: 'system', content: 'Reply with one short friendly sentence.' },
    { role: 'user', content: 'Hi there' },
  ] });
  console.log('OK, model replied:', reply);
} catch (err) {
  console.error('FAILED:', err.message);
  process.exit(1);
}
