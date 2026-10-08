import { cp } from 'node:fs/promises'
import { resolve } from 'node:path'

// The production dashboard CSS uses /fonts. Marketing assets already provide
// screenshots and videos; keep its robots, sitemap, and icons untouched.
const output = resolve(import.meta.dir, '../out')
await cp(resolve(output, 'ui/fonts'), resolve(output, 'fonts'), { recursive: true })
console.info('UI catalog published at /ui/ with production dashboard fonts.')
