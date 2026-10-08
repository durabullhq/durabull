import { describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import { MCP_TOOL_NAMES } from '../../packages/mcp/src/tools/tool-catalog'
import { buildPlugin, validateEndpoint } from './build-mcp-plugin'
import mcpSchema from './schemas/mcp.schema.json'
import pluginSchema from './schemas/plugin.schema.json'

const root = resolve(import.meta.dir, '../../plugins/durabull')
const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'))

describe('Durabull plugin distribution', () => {
  it('validates portable files against the published Agent Plugins 1.0 schemas', async () => {
    const ajv = new Ajv2020({ strict: false, allErrors: true })
    for (const [schema, path] of [
      [pluginSchema, 'plugin.json'],
      [mcpSchema, 'mcp.json'],
    ] as const) {
      const validate = ajv.compile(schema)
      expect(validate(await json(resolve(root, path)))).toBe(true)
      expect(validate.errors).toBeNull()
    }
    await buildPlugin({ check: true })
    const portable = await json(resolve(root, 'plugin.json'))
    const claude = await json(resolve(root, '.claude-plugin/plugin.json'))
    expect(claude.version).toBe(portable.version)
    expect(claude.name).toBe(portable.name)
    expect(claude.extensions).toBeUndefined()
    const presentation = portable.extensions['com.openai'].interface
    for (const asset of [presentation.logo, ...presentation.screenshots]) {
      expect(asset).toMatch(/^\.\/assets\//)
      expect((await readFile(resolve(root, asset))).length).toBeGreaterThan(0)
    }
    const covered = new Set<string>()
    const evals = await json(resolve(root, 'evals.json'))
    for (const entry of await readdir(resolve(root, 'skills'), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const source = await readFile(resolve(root, `skills/${entry.name}/SKILL.md`), 'utf8')
      const frontmatter = Bun.YAML.parse(source.split('---')[1]) as {
        name: string; description: string; metadata: { 'short-description': string }
      }
      expect(frontmatter.name).toBe(entry.name)
      expect(frontmatter.description.length).toBeLessThan(1024)
      expect(frontmatter.metadata['short-description'].length).toBeGreaterThanOrEqual(25)
      expect(frontmatter.metadata['short-description'].length).toBeLessThanOrEqual(64)
      const config = Bun.YAML.parse(await readFile(resolve(root, `skills/${entry.name}/agents/openai.yaml`), 'utf8')) as {
        dependencies: { tools: Array<{ value: string; url: string }> }
      }
      expect(config.dependencies.tools).toEqual([expect.objectContaining({ value: 'durabull', url: 'https://app.durabull.io/mcp' })])
      const tokens = source.match(/\b(?:ping|(?:list|get|find|explain|retry|promote|pause|resume|resolve|acknowledge|unacknowledge|snooze|unsnooze)_[a-z_]+)\b/g) ?? []
      for (const token of tokens) {
        expect(MCP_TOOL_NAMES).toContain(token)
        covered.add(token)
      }
      const cases = evals.cases.filter((item: { skill: string }) => item.skill === entry.name)
      expect(cases.length).toBeGreaterThanOrEqual(2)
      for (const item of cases) {
        for (const tool of item.expectedTools) {
          expect(MCP_TOOL_NAMES).toContain(tool)
          expect(tokens).toContain(tool)
        }
      }
    }
    // Any future tool needs a documented workflow, not just a schema entry.
    expect([...covered].sort()).toEqual([...MCP_TOOL_NAMES].sort())
  })

  it('creates a self-hosted package without changing the Cloud source', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'durabull-plugin-'))
    try {
      const endpoint = 'https://queues.example.com/mcp'
      const output = await buildPlugin({ endpoint, out: resolve(directory, 'durabull') })
      expect((await json(resolve(output, 'mcp.json'))).mcpServers.durabull).toEqual({
        type: 'streamable-http',
        url: endpoint,
      })
      expect((await json(resolve(output, '.mcp.json'))).mcpServers.durabull).toEqual({
        type: 'http',
        url: endpoint,
      })
      expect((await json(resolve(root, 'mcp.json'))).mcpServers.durabull.url).toBe(
        'https://app.durabull.io/mcp'
      )
      expect(await readFile(resolve(output, 'skills/setup/SKILL.md'), 'utf8')).toContain(
        'list_connections'
      )
      for (const entry of await readdir(resolve(output, 'skills'), { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const config = await readFile(resolve(output, 'skills', entry.name, 'agents/openai.yaml'), 'utf8')
        expect(config).toContain(endpoint)
        expect(config).not.toContain('https://app.durabull.io/mcp')
      }
      await buildPlugin({ endpoint, out: output, check: true })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects credentials and nonlocal cleartext endpoints', () => {
    for (const input of [
      'http://queues.example.com/mcp',
      'https://user:secret@example.com/mcp',
      'https://example.com/mcp?token=secret',
      'https://example.com/mcp#secret',
      'https://example.com/api',
    ]) {
      expect(() => validateEndpoint(input)).toThrow()
    }
    expect(validateEndpoint('http://localhost:3001/mcp')).toBe('http://localhost:3001/mcp')
  })

  it('rejects outputs overlapping the canonical package, including dot-prefixed names', async () => {
    for (const out of [resolve(root, '..'), resolve(root, 'nested'), resolve(root, '..hidden')]) {
      await expect(buildPlugin({ out })).rejects.toThrow('Output must not contain')
    }
    await expect(
      buildPlugin({
        endpoint: 'https://queues.example.com/mcp',
        out: root,
      })
    ).rejects.toThrow('Use --out')
    expect((await json(resolve(root, 'mcp.json'))).mcpServers.durabull.url).toBe(
      'https://app.durabull.io/mcp'
    )
  })
})
