# Running Helen for free

The website itself can be hosted for free. The AI model is the part that usually costs money, so the fully free route runs the model on your own computer.

## Route 1: everything on your computer, shared online with a free tunnel (fully free)

1. Install Node.js 20+ and Ollama on your computer.
2. Download a model: `ollama pull <model-name>` (check its license allows your use).
3. In the Helen folder:
   ```bash
   cp .env.example .env
   # set LLM_PROVIDER=openai-compatible, LLM_BASE_URL=http://localhost:11434/v1, LLM_MODEL=<model-name>
   npm run check-model
   npm start
   ```
4. Install `cloudflared` and run `cloudflared tunnel --url http://localhost:3000`. It prints a public `https://....trycloudflare.com` address anyone can open.

Limits: the site is only online while your computer is on, and the tunnel address changes each time you restart it. Your chats are saved on your computer. Check Cloudflare's terms for adult content.

## Route 2: website on Render's free plan

1. Push this repository to GitHub.
2. On Render choose New, then Blueprint, and pick the repository. `render.yaml` selects the free plan.
3. Set `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` to a model endpoint you can reach from the internet (for example your own computer through the tunnel from Route 1, pointed at port 11434, or a hosted API).

Limits on the free plan: the site sleeps after a period of inactivity and takes a little while to wake, and saved chats and memories are lost whenever it restarts, because the free plan has no persistent disk. Check Render's current free-plan limits and acceptable use policy for adult content.

Without any model configured, set `LLM_PROVIDER=mock` to run a demo with placeholder replies.
