# Telemetry dimensions: Cloud vs self-hosted

How to separate Durabull Cloud usage from open-source installs in the Durabull PostHog project.

## Properties on every product event

| Property | Values | Set by |
| --- | --- | --- |
| `deployment` | `cloud`, `self_hosted` | API runtime context. The Cloud collector forces `self_hosted` on everything that arrives through `/api/telemetry/collect`, so an install cannot report itself as Cloud. |
| `distribution` | `cloud`, `docker`, `desktop`, `source`, `unknown` | Derived from `DURABULL_CLOUD`/`APP_BASE_URL` and `DURABULL_RELEASE_CHANNEL`. Homebrew installs the desktop cask, so it reports `desktop`. `unknown` means an install from before this field existed. |
| `release_channel` | `docker`, `desktop`, `stable`, ... | The build's `DURABULL_RELEASE_CHANNEL`. Cloud runs the published Docker image, so Cloud reports `docker` here; use `deployment` to split Cloud out. |
| `api_version` | semver | Server build version, stamped by the server. (`app_version` is the web bundle version and only appears on browser events.) |
| `surface` | `app`, `docs` | `app` from the web app; `docs` on every event from the docs and marketing site, which shares the PostHog project. |
| `instance_key` | HMAC hash | Stable per self-hosted install (anonymous events only). |

## Counting units

- **Cloud users:** unique users on events where `deployment = cloud`, `surface != docs`, and
  `instance_key` is not set. Cloud's own anonymous server events (`/events`, MCP, heartbeat) also
  carry `deployment = cloud` but use a per-session distinct id and an `instance_key`; excluding
  them leaves identified persons, which are real users.
- **Self-hosted installs:** unique values of `instance_key` on `instance_active` (or on any event).
  Every running install sends `instance_active` once per UTC day, even with no one in the UI.
  Its distinct id is fixed per install, so unique users on `instance_active` also counts installs.
- **Do not** count unique users on other anonymous self-hosted events: their distinct id is
  `hash(instance:session)`, so it counts browser sessions, not people.

## Suggested insights

1. **Active installs by distribution:** `instance_active`, unique users, daily, filter
   `deployment = self_hosted`, breakdown `distribution`.
2. **Cloud DAU:** all events, unique users, daily, filter `deployment = cloud`,
   `surface != docs`, and `instance_key` is not set.
3. **Docs/site visitors:** `$pageview`, unique users, filter `surface = docs`.

Caveat: a Docker install using PGlite without a persistent volume gets a new installation id each
time the container is recreated, so it can count as several installs.

Data before this change has no `deployment`, `distribution`, or `surface`. Self-hosted installs
only start reporting once they upgrade, because older builds skipped forwarding without a
collect secret.
