import { config } from '../config.js';

// Optional image backend for in-chat photos. Works with any server exposing an
// OpenAI-style /images/generations endpoint (for example a self-hosted Stable Diffusion gateway).
// Disabled unless IMAGE_PROVIDER=openai-compatible.
export function createImageAdapter() {
  if (config.imageProvider !== 'openai-compatible') return null;
  return {
    async generate(prompt) {
      const res = await fetch(`${config.imageBaseUrl.replace(/\/$/, '')}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.imageApiKey ? { Authorization: `Bearer ${config.imageApiKey}` } : {}),
        },
        body: JSON.stringify({ model: config.imageModel, prompt, n: 1, size: '768x1024', response_format: 'b64_json' }),
      });
      if (!res.ok) throw new Error(`Image error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const item = data.data?.[0];
      return item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url;
    },
  };
}
