# @durabull/auth

Durabull's shared [Better Auth](https://www.better-auth.com/) configuration supports email/password
login, Google and GitHub OAuth, sessions, organizations, invitations, and MCP OAuth consent.
Database access uses `@durabull/dal` with PostgreSQL or PGlite.

## Configure authentication

Create a repository-root `.env` using [`.env.example`](../../.env.example). Set:

```dotenv
DURABULL_AUTHLESS=false
APP_BASE_URL=http://localhost:5173
BETTER_AUTH_SECRET=<long-random-secret>
DURABULL_REDIS_URL_ENCRYPTION_KEY=<64-character-hex-key>
```

Replace the placeholders with generated secrets. The normal development browser origin is
`http://localhost:5173`, which proxies `/api/auth` to the API. For a deployment, use the public
HTTPS origin instead.

Email/password login works without OAuth credentials. To enable a social provider, configure both
its client ID and client secret:

| Provider | Environment variables | Callback URI |
| --- | --- | --- |
| Google | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | `{APP_BASE_URL}/api/auth/callback/google` |
| GitHub | `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | `{APP_BASE_URL}/api/auth/callback/github` |

Register the exact callback with your provider. For Google, create a web application OAuth client
in [Google Cloud Console](https://console.cloud.google.com/). For GitHub, create an OAuth App in
[GitHub developer settings](https://github.com/settings/developers).

The DAL applies migrations when the database first initializes. Auth uses the `user`, `session`,
`account`, and `verification` tables, organization membership/invitation tables, and MCP OAuth tables.
Do not configure a separate database for this package.

## Server usage

```ts
import { createAuth } from '@durabull/auth'

const auth = await createAuth({
  baseURL: 'http://localhost:5173',
  trustedOrigins: ['http://localhost:5173'],
})

app.all('/api/auth/*', (c) => auth.handler(c.req.raw))
```

The API's [`getAuth()`](../../apps/api/src/lib/auth.ts) supplies the app origin and an invitation
email sender when Resend is configured. Use that shared instance in the API rather than creating
another auth instance for every request.

## Browser usage

The package exports its client from `@durabull/auth/client`; it follows the current browser origin.
The web app wraps those helpers with `useAuth` in `apps/web/src/hooks/use-auth.ts`.

```tsx
import { useAuth } from '@/hooks/use-auth'

function AccountMenu() {
  const { user, isAuthenticated, signIn, signOut } = useAuth()

  if (!isAuthenticated) {
    return <button onClick={() => signIn.social({ provider: 'google' })}>Sign in</button>
  }

  return <button onClick={() => signOut()}>Sign out {user?.name}</button>
}
```

Social providers do not implicitly create a new user on sign-in. Use the explicit sign-up or
account-linking flow when the account does not already exist.

## Common endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/sign-up/email` | Register with email/password |
| `POST` | `/api/auth/sign-in/email` | Sign in with email/password |
| `POST` | `/api/auth/sign-in/social` | Start social sign-in; provider is in the JSON body |
| `POST` | `/api/auth/sign-out` | Sign out |
| `GET` | `/api/auth/get-session` | Better Auth session snapshot |
| `GET` | `/api/auth/callback/:provider` | OAuth callback |
| `GET` | `/api/session` | Durabull session snapshot including organization context |

MCP clients use a separate bearer flow; see the [OAuth operator guide](../../docs/mcp-oauth-operator.md).
Authless mode is handled by the API and bypasses ordinary login. It does not create an external
identity boundary for callers.

## Security behavior

- Email verification is currently **not required in any environment**. Enabling it requires a
  change to `createAuth` and an email-verification sender; there is no environment toggle.
- Sessions expire after seven days, with a one-day update age and five-minute cookie cache.
- Account linking is enabled for trusted Google/GitHub providers, including different email addresses.
- Use HTTPS and trusted origins in production, keep `.env` private, and preserve the auth secret.
- Organization creation is enabled for users. Apply deployment access controls appropriate to your team.

See [Security and Hardening](../../apps/docs/content/documentation/operations/security-and-hardening.mdx)
for the full deployment guidance.
