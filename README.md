# Ledgerline on Supabase (end-to-end encrypted)

## Deploy
1. Create a project at supabase.com.
2. SQL editor: run `supabase/schema.sql`.
3. Authentication > URL configuration: add the address where you host the app as Site URL and redirect URL. (Email confirmation can stay on.)
4. Edge Function: `supabase functions deploy ai`, then
   `supabase secrets set ANTHROPIC_API_KEY=... ALLOWED_ORIGIN=https://your-site DAILY_AI_LIMIT=200`
   (optional `AI_MODEL`). In the CLI deploy, keep JWT verification on.
5. Edit `config.js` with your project URL and anon (public) key. Never put the service-role key there.
6. Host `index.html` and `config.js` on any static host (Netlify, Cloudflare Pages, Vercel, GitHub Pages).
7. Open the site, create an account, choose a passphrase, store the recovery key.

## What the administrator can and cannot see
- Cannot read: income, loans, goals, records, logs. All are encrypted in the browser (AES-256-GCM) before upload. The key is wrapped by your passphrase (PBKDF2, 600k rounds) and by the recovery key.
- Can see: email, sign-up and update times, vault size, number of AI calls per day.
- Each user's row is protected by row-level security, so one user cannot read another's.

## Honest limits
- Forget the passphrase and lose the recovery key: the data is gone. Nobody can reset it.
- AI reading and advisers: when a user presses a button, the decrypted content goes through your Edge Function to the AI provider. The function does not log or store it, but this part is not hidden from the server at that moment. Say so in your terms.
- Trust in the hosted app code: whoever controls the hosting could change the code. Host it yourself and publish what you ship.
- You pay for hosting and AI usage; the daily limit caps it per user.
- This build was tested in a simulated browser with a mocked Supabase, not against a live project or Deno. Test sign-up, unlock, a second device and one AI read before selling.
- Before selling worldwide, get legal advice on privacy law, terms, and financial-software disclaimers.
