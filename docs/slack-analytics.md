# Slack analytics

Every Slack touchpoint is captured in PostHog. Server events record outcomes and are the source of
truth; browser events record intent in the settings UI. Event names live in
`packages/analytics/src/events.ts`; the server helper is `apps/api/src/lib/slack/analytics.ts`.

## Identity

- **Identified copy** (no `instance_key`), sent to the app PostHog project. Every event carries
  `$groups.organization` = the organization id, matching `identifyOrganization` in the browser.
  - A Durabull member (signed-in web user, or a Slack user matched to a member by email) is the
    person: `distinct_id` is their user id and `$process_person_profile = true`, so Slack activity
    joins their web activity.
  - Anything else is never a person (`$process_person_profile = false`): unmatched Slack users use
    an HMAC-hashed per-workspace key, and events with nobody behind them (alert posts, message
    updates, uninstall) use an HMAC-hashed organization key. Person counts therefore stay real
    users, as `docs/telemetry-dimensions.md` requires; count organizations with the group.
- **Anonymous copy** (with `instance_key`): the usual sanitized telemetry, so self-hosted Slack
  usage is counted too. Events with no organization at all (a Slack-initiated install bounced to
  the install URL, an expired OAuth state) only have this copy.
- Matching a link click or help request to a member reads the Slack profile; that lookup runs only
  when analytics is on and is cached for 5 minutes per Slack user.
- `slack_identified_member` says whether a Durabull member was matched.
- Never sent: Slack workspace, channel, user or message ids, channel names, or anything typed in
  Slack. The sanitizer rejects any property not on its allowlist.

## Events

| Event | When | Key properties |
| --- | --- | --- |
| `slack_install_link_opened` | Direct install URL visited (`slack_source = install_page`), Slack-initiated install bounced to it (`slack_initiated`), or the integrations page acting on it (`integrations_page`) | `slack_outcome` |
| `slack_connect_clicked` | Add to Slack / Reconnect clicked in the app, or Add to Slack on the marketing site (`slack_surface = marketing_site`, `slack_source` = placement) | `slack_return_to`, `slack_reinstall`, `slack_source` |
| `slack_connect_started` | OAuth URL issued | `slack_return_to`, `slack_reinstall`, `slack_reason` (`new`, `reconnect`, `scopes`) |
| `slack_connected` | OAuth finished | `slack_reason` (`new`, `reconnect`, `scopes`, `workspace_changed`), `slack_missing_scope_count` |
| `slack_connect_failed` | Connecting was refused before OAuth (`slack_surface = settings`) or OAuth did not finish (`oauth`) | `slack_reason` (`cancelled`, `expired`, `wrong_user`, `not_admin`, `not_entitled`, `not_configured`, `slack_error`, `internal_error`, ...), `slack_error_code` (known OAuth errors only) |
| `slack_settings_updated` | Actions or link previews toggled | `slack_setting` (`actions`, `unfurls`), `slack_enabled` |
| `slack_connection_tested` | Test connection | `success`, `slack_error_code` |
| `slack_disconnected` | Removed in Durabull | `success`, `slack_revoked_token`, `slack_shared_workspace` |
| `slack_uninstalled_from_slack` | App uninstalled or tokens revoked in Slack | `slack_reason` |
| `slack_destination_created` / `_updated` / `_deleted` / `_tested` | Slack alert destinations | `slack_mention`, `slack_user_group_count`, `slack_thread_updates`, `success` |
| `slack_alert_posted` / `slack_alert_post_failed` | Incident posted to a channel | `slack_rule_type`, `slack_alert_state`, `slack_mention`, `slack_error_code`, `slack_reason` |
| `slack_alert_message_synced` | A posted incident message was updated | `slack_alert_state`, `slack_state_changed`, `slack_thread_reply_posted` |
| `slack_command_run` | `/durabull`, `@Durabull` or a DM | `slack_surface` (`slash_command`, `mention`, `direct_message`), `slack_command`, `slack_outcome` (`ok`, `help`, `usage`, `not_found`, `unknown_command`, `not_connected`, `denied`, `error`), `slack_organization_count` |
| `slack_action_performed` | Button or menu in Slack | `slack_action` (`acknowledge`, `unacknowledge`, `resolve`, `snooze`, `retry`, `pause_queue`, `resume_queue`, `refresh_home`), `slack_surface`, `success`, `slack_reason`, `slack_snooze_minutes` |
| `slack_link_clicked` | Open-in-Durabull buttons | `slack_link_kind`, `slack_surface` |
| `slack_app_home_opened` | Home tab opened (recorded even if Slack rejects the view) | `slack_outcome`, `success`, `slack_error_code` |
| `slack_links_unfurled` | Durabull links pasted in Slack; `ok` only once Slack accepts the previews | `slack_outcome` (`ok`, `denied`, `unfurls_disabled`, `not_found`, `not_connected`, `error`), `slack_link_kind`, `slack_link_count`, `slack_error_code` |
| `slack_manifest_viewed` / `slack_manifest_copied` / `slack_docs_clicked` | Self-hosted setup card (browser); `slack_docs_clicked` also on the marketing site | `slack_source` |
| `slack_channels_refreshed` | Channel list reloaded (browser) | `success` |
| `dialog_opened` / `dialog_closed` | Remove Slack dialog | `dialog_type = remove_slack` |

`slack_alert_post_failed` is recorded for each failed attempt, so a delivery that is retried and
then succeeds shows failures followed by one `slack_alert_posted`.

`slack_thread_updates` is the destination's setting (thread replies on or off);
`slack_thread_reply_posted` says whether a reply was actually posted for a message update.

A command answered for a member of several organizations records one `slack_command_run` per
organization (`slack_organization_count` > 1), so per-organization counts stay right; divide by it
to count commands.

## Suggested insights

1. **Slack adoption funnel:** `slack_connect_clicked` → `slack_connect_started` →
   `slack_connected` → `slack_destination_created` → `slack_alert_posted`, aggregated by
   organization group.
2. **Weekly Slack-active organizations:** unique organizations on `slack_command_run`,
   `slack_action_performed`, `slack_app_home_opened`, `slack_links_unfurled`,
   `slack_link_clicked`, identified copies only.
3. **Incident response from Slack:** `slack_action_performed`, breakdown `slack_action`, filter
   `success = true`.
4. **Churn signals:** `slack_disconnected` and `slack_uninstalled_from_slack` by week.
5. **Delivery health:** `slack_alert_post_failed` breakdown `slack_error_code`.
