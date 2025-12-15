That can work fine for a read-only client-side thing. Different situation to PiggyBack though — Up Bank pushes real-time transactions via webhooks, and there are cron jobs that sync in the background, so the token has to live server-side. It gets encrypted (AES-256-GCM) and stored in the database.

For your Strike setup, if the browser is making all the API calls directly and there's no server component, localStorage is reasonable. Main risk is XSS — any script on your page (or a dodgy browser extension) can read it, so worth having a tight CSP. And yeah, checking the scope and rejecting write-access tokens is a good call.

Short version: perfectly fine for a client-only read tool, just wouldn't work for PiggyBack because of the webhook and background sync stuff.
