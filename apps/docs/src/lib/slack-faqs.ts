/** FAQ for the Slack app landing page. Also emitted as FAQPage structured data. */
export const slackFaqs = [
  {
    question: 'Which Durabull plans include the Slack app?',
    answer:
      'The Slack app is included with Durabull Cloud on the Team plan ($9/month per organization) and above, and with every self-hosted deployment. New organizations can try it with a 14-day Business trial, no payment method required.',
  },
  {
    question: 'Who can acknowledge, resolve or retry from Slack?',
    answer:
      'Durabull matches the Slack user to a member of your Durabull organization by their verified email, and performs the action as that member. People who are not members, Slack Connect guests from other organizations and paused seats are refused with a message only they can see. Admins can turn off actions from Slack entirely.',
  },
  {
    question: 'What data does Durabull send to Slack?',
    answer:
      'Alert messages contain the rule name, connection and queue names, the incident summary and, for failed jobs, the job id, name, attempts and failure reason. Job payloads are never sent to Slack.',
  },
  {
    question: 'Can it post to private channels?',
    answer:
      'Yes. Durabull posts to public channels without joining them. For a private channel, run /invite @Durabull in the channel first.',
  },
  {
    question: 'Does it work with self-hosted Durabull?',
    answer:
      'Yes. Self-hosted deployments create their own Slack app from a manifest that Durabull generates, so tokens and requests never leave your infrastructure.',
  },
  {
    question: 'How do I remove it?',
    answer:
      'An organization owner or admin can select Remove under Settings → Integrations in Durabull, which uninstalls the app and revokes its token. Removing the app from Slack is detected automatically too.',
  },
]
