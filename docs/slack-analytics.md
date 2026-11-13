# Slack analytics

Every Slack touchpoint is captured in PostHog. Server events record outcomes and are the source of
truth; browser events record intent in the settings UI. Event names live in
`packages/analytics/src/events.ts`; the server helper is `apps/api/src/lib/slack/analytics.ts`.

## Identity

- **Identified copy** (`$process_person_profile = true`): `distinct_id` is the Durabull user id when
  known (signed-in web user, or a Slack user matched to a member by email), so Slack activity joins
  the same person as their web activity. `$groups.organization` is the organization id, matching
  `identifyOrganization` in the browser. Slack users that match no member get a hashed
  per-workspace key; events with no person (alert delivery, uninstall) use the organization id.
- **Anonymous copy** (`$process_person_profile = false`): the usual sanitized telemetry with
  `instance_key`, so self-hosted Slack usage is counted too.
- `slack_identified_member` says whether a Durabull member was matched.
- Never sent: Slack workspace, channel, user or message ids, channel names, or anything typed in
  Slack. The sanitizer rejects any property not on its allowlist.

## Events

| Event | When | Key properties |
| --- | --- | --- |
| `slack_install_link_opened` | Direct install URL visited (`slack_source = install_page`), Slack-initiated install bounced to it (`slack_initiated`), or the integrations page acting on it (`integrations_page`) | `slack_outcome` |
| `slack_connect_clicked` | Add to Slack / Reconnect clicked (browser) | `slack_return_to`, `slack_reinstall` |
| `slack_connect_started` | OAuth URL issued | `slack_return_to`, `slack_reinstall`, `slack_reason` (`new`, `reconnect`, `scopes`) |
| `slack_connected` | OAuth finished | `slack_reason` (`new`, `reconnect`, `scopes`, `workspace_changed`), `slack_missing_scope_count` |
| `slack_connect_failed` | OAuth did not finish | `slack_reason` (`cancelled`, `expired`, `wrong_user`, `not_admin`, `not_entitled`, `slack_error`, ...), `slack_error_code` |
| `slack_settings_updated` | Actions or link previews toggled | `slack_setting` (`actions`, `unfurls`), `slack_enabled` |
| `slack_connection_tested` | Test connection | `success`, `slack_error_code` |
| `slack_disconnected` | Removed in Durabull | `success`, `slack_revoked_token`, `slack_shared_workspace` |
| `slack_uninstalled_from_slack` | App uninstalled or tokens revoked in Slack | `slack_reason` |
| `slack_destination_created` / `_updated` / `_deleted` / `_tested` | Slack alert destinations | `slack_mention`, `slack_user_group_count`, `slack_thread_updates`, `success` |
| `slack_alert_posted` / `slack_alert_post_failed` | Incident posted to a channel | `slack_rule_type`, `slack_alert_state`, `slack_mention`, `slack_error_code`, `slack_reason` |
| `slack_alert_message_synced` | A posted incident message was updated | `slack_alert_state`, `slack_state_changed`, `slack_thread_updates` |
| `slack_command_run` | `/durabull`, `@Durabull` or a DM | `slack_surface` (`slash_command`, `mention`, `direct_message`), `slack_command`, `slack_outcome` (`ok`, `help`, `usage`, `not_found`, `unknown_command`, `not_connected`, `denied`, `error`), `slack_organization_count` |
| `slack_action_performed` | Button or menu in Slack | `slack_action` (`acknowledge`, `unacknowledge`, `resolve`, `snooze`, `retry`, `pause_queue`, `resume_queue`, `refresh_home`), `slack_surface`, `success`, `slack_reason`, `slack_snooze_minutes` |
| `slack_link_clicked` | Open-in-Durabull buttons | `slack_link_kind`, `slack_surface` |
| `slack_app_home_opened` | Home tab opened | `slack_outcome` |
| `slack_links_unfurled` | Durabull links pasted in Slack | `slack_outcome` (`ok`, `denied`, `unfurls_disabled`, `not_found`, `error`), `slack_link_kind`, `slack_link_count` |
| `slack_manifest_viewed` / `slack_manifest_copied` / `slack_docs_clicked` | Self-hosted setup card (browser) | |
| `slack_channels_refreshed` | Channel list reloaded (browser) | `success` |
| `dialog_opened` / `dialog_closed` | Remove Slack dialog | `dialog_type = remove_slack` |

`slack_alert_post_failed` is recorded for each failed attempt, so a delivery that is retried and
then succeeds shows failures followed by one `slack_alert_posted`.

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
