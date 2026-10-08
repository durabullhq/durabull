import { members, organizationFixture, user } from '../fixtures/data'

const session = { user, session: { id: 'demo-session', activeOrganizationId: 'demo-org' } }
const response = <T>(data: T) => Promise.resolve({ data, error: null })
let signedIn = true
export function setSignedIn(value: boolean) {
  signedIn = value
}
const useSession = () => ({
  data: signedIn ? session : null,
  isPending: false,
  error: null,
  refetch: () => response(session),
})
export const organization = {
  list: () => response([organizationFixture]),
  getFullOrganization: () => response({ ...organizationFixture, members, invitations: [] }),
  listMembers: () => response({ members }),
  listInvitations: () => response([]),
  setActive: () => response(organizationFixture),
  create: () => response(organizationFixture),
  inviteMember: () => response({}),
  cancelInvitation: () => response({}),
  removeMember: () => response({}),
  updateMemberRole: () => response({}),
}
export const authClient = {
  useSession,
  getSession: () => response(session),
  signIn: { email: () => response(session), social: () => response(session) },
  signUp: { email: () => response(session) },
  signOut: () => response(null),
  linkSocial: () => response({}),
  unlinkAccount: () => response({}),
  listAccounts: () =>
    response([
      {
        id: 'demo-account',
        providerId: 'credential',
        accountId: 'demo-user',
        createdAt: new Date('2026-01-01'),
      },
    ]),
  organization,
}
export { useSession }
export {
  buildLoginRedirectForConsent,
  buildMcpAuthorizeResumeUrl,
  hasMcpAuthorizeQuery,
  labelConsentScopes,
  MCP_OAUTH_CONSENT_PATH,
  parseConsentScopeList,
  parseMcpOAuthConsentSearch,
} from '../../../../packages/auth/src/mcp-consent'
export {
  isSafeAppRedirectPath,
  resolveSafeAppRedirectPath,
} from '../../../../packages/auth/src/safe-redirect'
export const submitOAuthConsent = () => Promise.resolve({ redirectURI: '#' })
