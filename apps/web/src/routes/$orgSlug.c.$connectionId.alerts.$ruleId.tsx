import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Legacy deep-link: rule editing moved under /alerts/rules/$ruleId.
 * The static `rules` segment outranks `$ruleId` in route ranking, so
 * /alerts/rules never matches this route.
 */
export const Route = createFileRoute('/$orgSlug/c/$connectionId/alerts/$ruleId')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$orgSlug/c/$connectionId/alerts/rules/$ruleId',
      params,
      replace: true,
    })
  },
})
