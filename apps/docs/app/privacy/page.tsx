import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingLayout } from '@/components'
import { createMetadata } from '@/lib/seo'

const policyDescription =
  'How Durabull collects, uses, shares, and retains data across its website, Cloud service, and BullMQ & Redis plugin, and the controls available to you.'

export const metadata: Metadata = createMetadata(
  {
    title: 'Privacy Policy',
    description: policyDescription,
    keywords: ['Durabull privacy', 'privacy policy', 'plugin data handling', 'data retention'],
  },
  '/privacy'
)

const sections = [
  ['scope', 'Who this policy covers'],
  ['collection', 'Data we collect and why'],
  ['plugin', 'ChatGPT, Codex, and other MCP clients'],
  ['analytics', 'Cookies, analytics, and telemetry'],
  ['sharing', 'Who receives data'],
  ['retention', 'How long data is kept'],
  ['controls', 'Your choices and requests'],
  ['security', 'Security and sensitive data'],
  ['changes', 'Changes and contact'],
] as const

const collectionRows = [
  {
    category: 'Account and organization data',
    data: 'Name, email address, profile image, user ID, sign-in provider and provider account ID, verification status, sign-in times, organization name and slug, membership, role, and invitation details.',
    purpose:
      'Create and authenticate accounts, manage organizations, apply permissions, and send invitations.',
  },
  {
    category: 'Authentication and connection data',
    data: 'Password hashes; session records, IP address and user agent; OAuth client metadata, redirect URLs, consent, scopes, access and refresh tokens; service-account identifiers and secret hashes; Redis connection names, environments, URLs, credentials, and configuration supplied through Durabull setup.',
    purpose:
      'Keep you signed in, authorize the plugin, connect to Redis, and enforce organization and tool permissions. Supply connection credentials through setup, never through a chat or tool argument.',
  },
  {
    category: 'BullMQ and Redis operational data',
    data: 'Connection, queue, job, worker, and scheduler identifiers and names; job states, payloads, results, options, progress, attempts, timestamps, failure reasons, logs, and stack traces; worker network addresses and activity; queue counts and throughput; cron patterns, timezones, schedule bounds and template data; Redis memory, CPU, clients, capacity, errors, and health history.',
    purpose:
      'Display requested information, diagnose failures and backlogs, monitor health, and carry out authorized actions. This content may contain personal or business information that you or your applications put there.',
  },
  {
    category: 'Alerts and optional integrations',
    data: 'Rule names, thresholds, queue filters, notification routing including email addresses and webhook URLs, destination and integration settings, incident summaries and context, acknowledgements, resolution and snooze times, delivery attempts and errors, and external issue IDs and links.',
    purpose:
      'Evaluate alerts, deliver configured notifications, coordinate incident handling, and synchronize issues with integrations you enable.',
  },
  {
    category: 'Requests, audit, and technical usage data',
    data: 'Tool and resource names, scoped arguments, pagination and filters; authorization decisions, required scopes, principal, organization and connection IDs, correlation IDs and input hashes; event times, status and error categories, duration, client and protocol metadata, application versions, usage counts, and pseudonymous identifiers. Web and hosting services also receive IP addresses and browser information.',
    purpose:
      'Execute requests, investigate errors, enforce rate limits, prevent abuse, audit access, and understand feature usage and reliability.',
  },
  {
    category: 'Website analytics and support communications',
    data: 'Page URLs and referrers, interactions, browser and device details, cookie or local-storage identifiers, and diagnostics when analytics is configured; your email address, message, attachments, and troubleshooting details when you contact support.',
    purpose:
      'Measure website and product use, diagnose browser problems, answer questions, and handle privacy and security requests.',
  },
] as const

const retentionRows = [
  {
    category: 'Account, organization, connection, and integration settings',
    period:
      'Kept while the account, organization, connection, or integration remains in use, until removed through available settings or a verified deletion request. These records have no automatic age-based expiry.',
  },
  {
    category: 'Sessions, OAuth tokens, and consent',
    period:
      'Login sessions expire after 7 days unless renewed by continued use; the session-cookie cache lasts 5 minutes. OAuth tokens have their own stored expiry times. Expiry stops authorization but does not promise immediate erasure of the record. Consent and client records remain until removed or a verified deletion request is fulfilled.',
  },
  {
    category: 'Job data, results, logs, stack traces, and schedules in your Redis',
    period:
      'Kept under your Redis and BullMQ retention settings until your application or an authorized operator deletes them. Durabull reads this content to fulfill requests and does not create a separate durable archive of MCP tool inputs or outputs. Incident context and downstream notifications can contain excerpts with separate retention.',
  },
  {
    category: 'Redis health samples stored by Durabull',
    period:
      '30 days by default; deployment operators can configure 1–30 days. Older samples are eligible for periodic cleanup, which can be delayed by service downtime, errors, or a backlog.',
  },
  {
    category: 'Alert events and delivery records',
    period:
      'Events that are no longer firing become eligible for cleanup 90 days after they fired. Events awaiting Linear resolution synchronization may remain for up to 365 days before becoming eligible. Firing incidents remain while open. Cleanup is periodic and can be delayed. Completed Linear resolution deduplication records become eligible for cleanup after 365 days.',
  },
  {
    category: 'MCP authorization audit records',
    period:
      'Kept until manually removed by the deployment operator, including in response to a verified deletion request. The application has no automatic audit-record expiry. Disconnecting the plugin or deleting an account does not automatically erase this separate audit trail.',
  },
  {
    category: 'Analytics, hosting logs, support records, and backups',
    period:
      'Retention is controlled by the deployment operator and the provider, rather than an expiry enforced by Durabull. Records can remain until the operator or provider deletes them, including following a verified request; there is no application-enforced maximum retention period. Backup copies can remain after deletion from active systems until overwritten or removed. Contact us for current Cloud provider retention settings or to request deletion.',
  },
  {
    category: 'Copies held by ChatGPT or other recipients',
    period:
      'The receiving client, organization, email service, webhook destination, or issue tracker controls its own copies. Disconnecting Durabull does not delete existing conversations, notifications, issues, or data from those services. Use the recipient’s deletion and retention controls as well.',
  },
] as const

export default function PrivacyPage() {
  return (
    <LandingLayout>
      <article className="relative mx-auto max-w-5xl px-6 pt-32 pb-20">
        <header className="mb-10 max-w-3xl">
          <p className="mb-4 text-sm font-medium text-emerald-300">Privacy · Durabull</p>
          <h1 className="mb-5 text-4xl font-bold tracking-tight md:text-5xl">Privacy Policy</h1>
          <p className="mb-4 text-lg text-muted-foreground">{policyDescription}</p>
          <p className="text-sm text-muted-foreground">
            Last updated: <time dateTime="2026-10-09">October 9, 2026</time>
          </p>
        </header>

        <nav
          aria-label="Privacy policy contents"
          className="mb-12 rounded-xl border border-border p-6"
        >
          <h2 className="mb-4 font-semibold">Contents</h2>
          <ol className="grid gap-3 text-sm md:grid-cols-2">
            {sections.map(([id, title], index) => (
              <li key={id}>
                <a href={`#${id}`} className="text-emerald-300 underline underline-offset-4">
                  {index + 1}. {title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-12 text-base leading-7 text-muted-foreground [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-foreground [&_p+p]:mt-4 [&_section]:scroll-mt-28 [&_a]:text-emerald-300 [&_a]:underline [&_a]:underline-offset-4">
          <PrivacyScopeSection />

          <PrivacyCollectionSection />

          <PrivacyPluginSection />

          <PrivacyAnalyticsSection />

          <PrivacySharingSection />

          <PrivacyRetentionSection />

          <PrivacyControlsSection />

          <PrivacySecuritySection />

          <PrivacyChangesSection />
        </div>
      </article>
    </LandingLayout>
  )
}

function PrivacyScopeSection() {
  return (
    <section id="scope" aria-labelledby="scope-heading">
      <h2 id="scope-heading">1. Who this policy covers</h2>
      <p>
        Durabull provides software for managing BullMQ queues and monitoring Redis. This policy
        covers durabull.io, Durabull Cloud, support communications, and the Durabull — BullMQ &amp;
        Redis plugin in ChatGPT, Codex, and other MCP clients. Durabull operates the Cloud service;
        contact us at <a href="mailto:hello@durabull.io">hello@durabull.io</a>.
      </p>
      <p>
        For self-hosted and desktop deployments, the deployment operator controls the database,
        Redis access, integrations, hosting logs, and backups. Job data is processed in that
        deployment. Authorized results still go to the connected MCP client, and configured
        telemetry can leave the deployment as described below. Your organization controls the data
        it puts in Redis and who can access it.
      </p>
    </section>
  )
}

function PrivacyCollectionSection() {
  return (
    <section id="collection" aria-labelledby="collection-heading">
      <h2 id="collection-heading">2. Data we collect and why</h2>
      <p className="mb-6">
        We receive data from you, your sign-in provider, authorized Redis connections, the MCP
        client making a request, and integrations you configure. Collection depends on the features
        used and deployment configuration.
      </p>
      <div className="space-y-6">
        {collectionRows.map((row) => (
          <div key={row.category}>
            <h3>{row.category}</h3>
            <p>{row.data}</p>
            <p>
              <strong className="text-foreground">Purpose:</strong> {row.purpose}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

function PrivacyPluginSection() {
  return (
    <section id="plugin" aria-labelledby="plugin-heading">
      <h2 id="plugin-heading">3. ChatGPT, Codex, and other MCP clients</h2>
      <p>
        Connecting the plugin records the OAuth client and permissions you approve. Tool calls send
        an authentication token and scoped arguments, such as connection IDs, queue names, job IDs,
        search filters, time windows, pagination cursors, alert event or rule IDs, and snooze
        durations. Tools do not request your full conversation history or a raw chat transcript. We
        process the explicit arguments and resources the client sends.
      </p>
      <p>
        Read tools can return connection and queue names, job payloads and return values, failure
        reasons, log and stack-trace excerpts, worker addresses, schedule template data, health
        metrics, incident context, delivery errors, and external issue links. Alert-rule tools can
        also return notification routing details such as email targets, webhook URLs, and
        destination, team, or project IDs. This content may identify your staff, customers, or
        systems.
      </p>
      <p>
        Results go to the invoking client. For ChatGPT and Codex, OpenAI receives them to display
        information and respond to your request, including in interactive Durabull views. An MCP
        host can also receive sanitized arguments in view metadata. Durabull filters known secret
        fields and credential patterns and limits output size. This does not remove every kind of
        personal information or guarantee that arbitrary text is free of sensitive data.
      </p>
      <p>
        Authorized write tools retry jobs with their existing payload, promote delayed jobs, pause
        or resume queues, and acknowledge, resolve, or snooze alerts. These actions update Redis or
        Durabull records and return an operation result. Workers may then process a retried or
        promoted job, and configured integrations may receive incident updates.
      </p>
      <p>
        Plugin data supports these operations, permission checks, access audits, troubleshooting,
        and measurement of reliability and use. Durabull does not use tool data to train AI models.
        OpenAI and other clients handle received data under their own terms, privacy policies, and
        account settings; this policy does not determine their retention or model-training
        practices.
      </p>
    </section>
  )
}

function PrivacyAnalyticsSection() {
  return (
    <section id="analytics" aria-labelledby="analytics-heading">
      <h2 id="analytics-heading">4. Cookies, analytics, and telemetry</h2>
      <p>
        Sign-in uses session cookies. When configured, PostHog browser analytics on the website and
        dashboard uses cookies and local storage to associate visits and interactions. The dashboard
        can identify users by user ID, name, email, profile image, and account creation details, and
        associate them with their organization’s ID, name, and slug. Browser analytics can include
        URLs, referrers, device information, interactions, and exception diagnostics. The marketing
        website also loads Google Analytics in production when a measurement ID is configured.
        Provider-enabled features, including session replay, may process page content and
        interactions under the operator’s analytics settings.
      </p>
      <p>
        Durabull’s separate sanitized telemetry stream is enabled in production, including desktop
        and self-hosted builds, and disabled in development, test, and CI. It includes feature and
        normalized route usage, versions, runtime context, event times, counts, status categories,
        and durations. MCP analytics also includes tool and resource names, OAuth stages and scope
        counts, client and protocol metadata, and hashed session, request, client, connection,
        principal, user, and organization identifiers where configured. These are pseudonymous, not
        guaranteed anonymous, and can associate activity across requests.
      </p>
      <p>
        The sanitized stream excludes raw tool arguments and responses, job payloads, results, logs
        and stack traces, queue and job names, Redis URLs, credentials, email addresses, names, and
        raw error messages. These exclusions do not describe the separate browser analytics stream,
        application database, or authorized tool results. Configured Cloud telemetry goes to
        PostHog. Self-hosted sanitized telemetry is forwarded to Durabull Cloud only when a
        forwarding signing secret is configured; a separate PostHog project can receive the
        operator’s analytics stream.
      </p>
      <p>
        There is currently no product-level switch to opt out of sanitized production telemetry.
        Blocking browser analytics does not disable server-side MCP telemetry or audit records. See
        section 7 and the{' '}
        <Link href="/documentation/getting-started/environment-variables/#anonymous-usage-telemetry">
          telemetry documentation
        </Link>{' '}
        for available browser and deployment controls.
      </p>
    </section>
  )
}

function PrivacySharingSection() {
  return (
    <section id="sharing" aria-labelledby="sharing-heading">
      <h2 id="sharing-heading">5. Who receives data</h2>
      <ul className="list-disc space-y-4 pl-6">
        <li>
          <strong className="text-foreground">Your MCP client and provider:</strong> OpenAI for
          ChatGPT and Codex, or another client provider you connect, receives authorized tool
          results and view data to fulfill your requests.
        </li>
        <li>
          <strong className="text-foreground">Your organization and deployment operator:</strong>{' '}
          authorized members access shared operational data according to their roles. Operators
          manage the database, audit records, and integrations.
        </li>
        <li>
          <strong className="text-foreground">Infrastructure and service providers:</strong>{' '}
          hosting, database, storage, backup, network, and support providers process service data
          needed to run Durabull. PostHog receives configured analytics and diagnostics; Google
          receives configured website analytics. Resend processes recipient addresses and email
          content for configured invitations and alerts. Google or GitHub participates in
          authentication when you choose that sign-in provider.
        </li>
        <li>
          <strong className="text-foreground">Destinations you configure:</strong> notification
          recipients, webhook endpoints, and Linear receive incident or issue data for enabled
          workflows, including job identifiers, failure details, and operational context. You choose
          these destinations; their operators control the copies they receive.
        </li>
        <li>
          <strong className="text-foreground">Support and necessary disclosures:</strong> personnel
          handling support and security receive relevant records. We may disclose relevant
          information when required by law, to investigate abuse or protect the service and its
          users, or as part of a business transfer subject to applicable privacy obligations.
        </li>
      </ul>
      <p className="mt-4">
        Recipients may process data outside your country. Ask{' '}
        <a href="mailto:hello@durabull.io">hello@durabull.io</a> for current Cloud infrastructure
        providers and processing locations. For self-hosted deployments, ask your deployment
        operator.
      </p>
    </section>
  )
}

function PrivacyRetentionSection() {
  return (
    <section id="retention" aria-labelledby="retention-heading">
      <h2 id="retention-heading">6. How long data is kept</h2>
      <p className="mb-6">
        Retention depends on where data is stored. Disconnecting a client stops its future use of
        that connection; it does not erase existing records or third-party copies. The current
        application’s retention behavior is described below.
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full table-fixed border-collapse break-words text-left text-sm leading-6">
          <caption className="sr-only">Data categories and current retention periods</caption>
          <thead className="bg-card text-foreground">
            <tr>
              <th scope="col" className="w-2/5 p-3 font-semibold md:w-1/3 md:p-4">
                Data
              </th>
              <th scope="col" className="p-3 font-semibold md:p-4">
                Retention and deletion
              </th>
            </tr>
          </thead>
          <tbody>
            {retentionRows.map((row) => (
              <tr key={row.category} className="border-t border-border align-top">
                <th scope="row" className="p-3 font-medium text-foreground md:p-4">
                  {row.category}
                </th>
                <td className="p-3 md:p-4">{row.period}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4">
        Records needed for an unresolved security incident, dispute, or legal obligation may remain
        until that reason ends. We explain applicable exceptions when handling deletion requests.
        Application cleanup does not delete your Redis data or copies held by clients, external
        integrations, or backups.
      </p>
    </section>
  )
}

function PrivacyControlsSection() {
  return (
    <section id="controls" aria-labelledby="controls-heading">
      <h2 id="controls-heading">7. Your choices and requests</h2>
      <ul className="list-disc space-y-4 pl-6">
        <li>
          <strong className="text-foreground">Limit access:</strong> review OAuth scopes before
          approval, decline permissions you do not need, and choose read access unless you need
          write tools. Your organization controls membership and connection access. Supply only the
          identifiers and filters necessary for your request.
        </li>
        <li>
          <strong className="text-foreground">Disconnect or revoke access:</strong> remove Durabull
          in your MCP client’s connection settings. For server-side revocation of OAuth grants or
          tokens, contact Cloud support or your self-hosted administrator. Administrators can
          disable service accounts and revoke secrets. Removing a client connection does not erase
          previously returned data or audits.
        </li>
        <li>
          <strong className="text-foreground">Manage operational data:</strong> remove unused Redis
          connections, review alert destinations, disable unused integrations, and set BullMQ job
          and log retention in your application. Self-hosting gives your operator control of storage
          and backups; results sent to an external MCP client still share data with that client.
        </li>
        <li>
          <strong className="text-foreground">Manage browser analytics:</strong> use browser
          controls to block analytics requests or third-party scripts and clear cookies and local
          storage. Clearing storage may sign you out; identifiers can be recreated on later visits.
          Operators can omit optional PostHog configuration or the website Google Analytics
          measurement ID. This does not opt out of sanitized production telemetry.
        </li>
        <li>
          <strong className="text-foreground">
            Request access, correction, export, or deletion:
          </strong>{' '}
          email <a href="mailto:hello@durabull.io">hello@durabull.io</a> with your account email,
          organization, and request. Do not include passwords, tokens, or Redis credentials. We
          verify your identity and authority, coordinate requests affecting shared data with the
          organization administrator, and explain retention exceptions. Contact your operator for
          self-hosted data; contact us for data sent to Durabull.
        </li>
      </ul>
      <p className="mt-4">
        Depending on your location, you may also have rights to object to or restrict processing and
        to raise a concern with a data-protection authority. Contact us to exercise applicable
        rights. Direct requests for ChatGPT conversations or another provider’s copies to that
        provider as well.
      </p>
    </section>
  )
}

function PrivacySecuritySection() {
  return (
    <section id="security" aria-labelledby="security-heading">
      <h2 id="security-heading">8. Security and sensitive data</h2>
      <p>
        Durabull checks authentication, OAuth scopes, organization membership, and connection
        authorization before protected operations. The software supports encrypted storage of Redis
        URLs and integration secrets, hashes passwords and service-account secrets, and filters
        known credential patterns from MCP output. Cloud connections use HTTPS; self-hosted
        operators are responsible for transport, encryption keys, storage, and access controls.
      </p>
      <p>
        Do not put passwords, API keys, payment-card data, protected health information, government
        identifiers, or other restricted data in tool arguments or content you ask the plugin to
        return. Redaction does not guarantee that arbitrary payloads, results, logs, or stack traces
        are safe to share. Review queue data and permissions before connecting an external client.
        Durabull is intended for managing software systems and is not directed at children under 13.
      </p>
    </section>
  )
}

function PrivacyChangesSection() {
  return (
    <section id="changes" aria-labelledby="changes-heading">
      <h2 id="changes-heading">9. Changes and contact</h2>
      <p>
        We update this policy when data practices or tools change and revise the date above. The
        current policy is available at <a href="https://durabull.io/privacy">durabull.io/privacy</a>{' '}
        before installing or connecting the plugin. For privacy questions, requests, or concerns,
        email <a href="mailto:hello@durabull.io">hello@durabull.io</a> or visit our{' '}
        <Link href="/contact">contact page</Link>.
      </p>
    </section>
  )
}
