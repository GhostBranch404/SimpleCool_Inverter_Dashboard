# Home Energy

A private, read-only Deye Cloud dashboard for phones, tablets, and wall displays.

## Features

- Battery, Solar PV, Home Load, and Grid cards
- Full screen, subtle charging animation, and recent battery trend
- Daily energy, lifetime generation from TotalActiveProduction, and inverter AC temperature
- Daily power and battery charge charts with a configurable reserve reference
- Wallboard mode, optional export display, and optional Excess label above 98% charge
- Outage runtime estimate and browser-local restoration summary
- Searchable inverter measurements with collapsible groups

## Local development

Use Node.js 22.13 or newer. Install dependencies with npm ci.
Run npm run dev for the local preview, npm run build for a production build,
node scripts/test-energy.mjs for tests, and npx tsc --noEmit for type checking.
The local preview supplies a development identity.

## Configuration and privacy

The current hosted deployment uses Sites private authentication.
SESSION_KEY is a server-only secret containing a base64-encoded 32-byte random key.
Deye App ID, App Secret, email and password are entered through the connection form.
The password is used for authentication. The returned access token is encrypted
into an HttpOnly cookie, tied to the signed-in user, for up to 30 days.
Settings and observed outage records are local to each browser.

## Uploading the source to GitHub

The provided source archive excludes Git history, dependencies, generated builds,
runtime state, local environment files and the current Site project identity.
Extract it and upload the source files to a repository, preferably private.

This snapshot is the source of the Sites-hosted application. Independent hosting
needs a migration of authentication and deployment configuration. GitHub Pages
cannot run the backend API routes. Cloudflare Workers is the closest runtime.
Before a separate deployment, replace Sites sign-in with a verified authentication
provider, preserve server-side authorization on every API route, supply SESSION_KEY,
and configure the Worker build and routing. Do not simply trust client-supplied identity
headers on a publicly reachable Worker.

## Behaviour and limits

Cloud measurements can lag behind the inverter. Missing readings display a dash.
Battery runtime is an approximation using capacity, a 10% cutoff, home load plus
120 W inverter draw minus solar generation. Reserve percentage is a chart reference.
Outages are observed while the dashboard is open. They are not logged by a background
service. A restoration summary stays visible for 24 hours.
Full screen depends on browser support and a user click. Animation respects reduced
motion. The battery trend compares samples five to thirty minutes apart.
No inverter controls are exposed.
