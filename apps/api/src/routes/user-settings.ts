import { zValidator } from '@hono/zod-validator'
import { userSettingsRepository, type Theme } from '@durabull/dal'
import { Hono } from 'hono'
import { z } from 'zod'

const themeSchema = z.enum(['light', 'dark', 'system'])

/**
 * User settings routes - all operations are scoped to the authenticated user.
 * Uses the user's ID as the settings ID (1:1 relationship).
 * This prevents IDOR vulnerabilities by ensuring users can only access their own settings.
 */
const userSettingsRoutes = new Hono()
  // Get current user's settings (creates default if not exists)
  .get('/', async (c) => {
    const user = c.get('user')
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    // Use user's ID as settings ID (1:1 relationship)
    let settings = await userSettingsRepository.findById(user.id)

    // Auto-create default settings if they don't exist
    if (!settings) {
      settings = await userSettingsRepository.createForUser(user.id, 'system')
    }

    return c.json(settings)
  })

  // Update current user's settings
  .put('/', zValidator('json', z.object({ theme: themeSchema })), async (c) => {
    const user = c.get('user')
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const { theme } = c.req.valid('json')

    // Ensure settings exist first
    let settings = await userSettingsRepository.findById(user.id)
    if (!settings) {
      settings = await userSettingsRepository.createForUser(user.id, theme as Theme)
    } else {
      settings = await userSettingsRepository.update(user.id, theme as Theme)
    }

    if (!settings) {
      return c.json({ error: 'Failed to update settings' }, 500)
    }

    return c.json(settings)
  })

export default userSettingsRoutes
