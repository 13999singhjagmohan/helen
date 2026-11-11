// Works with any server exposing the OpenAI-style /chat/completions API.
export function openAICompatibleAdapter({ baseUrl, apiKey, model, allowsExplicit }) {
  return {
    name: 'openai-compatible',
    allowsExplicit,
    async chat({ messages, temperature = 0.9 }) {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens: 400 }),
      });
      if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || '';
    },
  };
}
