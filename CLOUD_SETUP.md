# Running Helen in the cloud

Helen talks to any model server that speaks the OpenAI-style `/v1/chat/completions` API. There are two cloud routes.

## Option A: your own model on a rented GPU server (most control)

You rent a GPU machine, run an open-weight model on it, and Helen runs next to it. Nothing leaves your server, and the content rules are set by the model's license and your hosting provider's terms, not by a third-party API.

1. **Rent a GPU server** from any cloud or GPU-rental provider. A GPU with 24 GB of memory comfortably runs 7B to 14B parameter models; larger models need more. Check the provider's acceptable use policy for adult content before you sign up.
2. **Install Docker and the NVIDIA container toolkit** on the server (most GPU providers offer images with these preinstalled).
3. **Copy this folder to the server**, then:
   ```bash
   cp .env.example .env
   # edit .env: set LLM_MODEL to the model you choose
   # set PROVIDER_ALLOWS_EXPLICIT=true only if that model's license and your host's terms permit it
   docker compose up -d
   docker compose exec model ollama pull <model-name>
   ```
4. **Check the connection**: `docker compose exec helen npm run check-model`
5. Open `http://<server-ip>:3000`.

**Choosing a model:** browse the Ollama model library or Hugging Face and read each model's license and model card. Licenses differ on what they allow and change over time, so verify the current terms yourself.

For more speed with many users, swap the `model` service for a dedicated inference server such as vLLM, which also exposes an OpenAI-compatible API. Only `LLM_BASE_URL` needs to change.

## Option B: a hosted inference API (least setup)

Some services host open-weight models behind an OpenAI-compatible API, so you need no GPU. Set:

```
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=<the provider's base URL, ending in /v1>
LLM_API_KEY=<your key>
LLM_MODEL=<model id from the provider>
```

Then run `npm run check-model`. Before enabling explicit content, read the provider's usage policy: many hosted APIs prohibit sexually explicit output even when the underlying model allows it.

## Before going public

- Put Helen behind HTTPS (a reverse proxy such as Caddy or Nginx, or your host's load balancer).
- Keep the model server private: only Helen should reach port 11434. The compose file does not publish it.
- Replace the date-of-birth gate with real age verification if your country requires it for adult services.
- Add user accounts with passwords; the current version identifies users by a browser cookie only.
- Check local laws on adult content, data protection (for example GDPR in the EU) and record-keeping.
