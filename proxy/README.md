# Portraius Studio Worker

One Cloudflare Worker that does the two things M1 found a browser can't do alone
(`docs/notes/m1-findings.md`):

- **`POST /upload`, `GET`/`HEAD`/`DELETE /m/:key`:** hosts short-lived public copies of inputs that
  providers fetch by URL (Seedance reference videos, Kling's edit input, Sync-3). Files go into the
  `portraius-media` R2 bucket under a random 128-bit key. Uploads and deletes need a Comfy key that
  Router accepts. The Worker checks it once with `GET api.comfy.org/v2/models?limit=1` and keeps only a
  hash of it, for 10 minutes. 100 MB cap; MP4, MOV, WAV, MP3, PNG and JPEG only.
- **`GET /fetch?url=`:** streams a result back with CORS headers, for the links in
  `WORKER_FETCH_PREFIXES` (`src/lib/router/hosts.ts`) only. HTTPS only, and redirects aren't followed.

Every route answers only the GitHub Pages site and `localhost`, and limits each IP to 30 requests a
minute. The Worker forwards requests and stores nothing but the uploads. The app deletes each upload
when its job ends, and a lifecycle rule removes anything older than a day.

## Deploy (free tier)

R2 has to be turned on once in the Cloudflare dashboard (R2 Object Storage). Cloudflare asks for a
payment method even on the free tier. Then, from the repo root:

```sh
npx wrangler login
npx wrangler r2 bucket create portraius-media
npx wrangler r2 bucket lifecycle add portraius-media expire-after-1-day --expire-days 1 -y
npm run proxy:deploy
```

The deploy prints the Worker's URL (`https://portraius-proxy.<your-subdomain>.workers.dev`). Point the
app at it in `.env.local` for development, and in the Pages build:

```sh
VITE_WORKER_URL=https://portraius-proxy.<your-subdomain>.workers.dev
VITE_MEDIA_HOST=worker
```

`npm run proxy:dev` runs the Worker locally with a simulated bucket.
