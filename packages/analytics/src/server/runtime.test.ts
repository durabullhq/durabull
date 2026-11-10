import { describe, expect, it } from 'bun:test'

import { sanitizeTelemetryEvent } from '../sanitizer'
import { resolveCollectRuntimeContext, resolveTelemetryDistribution } from './runtime'

const baseClientRuntime = {
  authless: false,
  env_connections: false,
  environment: 'production',
  persistence: 'postgres',
  stateless: false,
}

describe('resolveTelemetryDistribution', () => {
  it('reports cloud for Durabull Cloud even though it runs the docker image', () => {
    expect(resolveTelemetryDistribution({ cloud: true, releaseChannel: 'docker' })).toBe('cloud')
  })

  it('maps release channels to self-hosted distributions', () => {
    expect(resolveTelemetryDistribution({ cloud: false, releaseChannel: 'docker' })).toBe('docker')
    expect(resolveTelemetryDistribution({ cloud: false, releaseChannel: 'desktop' })).toBe(
      'desktop'
    )
    expect(resolveTelemetryDistribution({ cloud: false, releaseChannel: 'desktop-dev' })).toBe(
      'desktop'
    )
    expect(resolveTelemetryDistribution({ cloud: false, releaseChannel: 'stable' })).toBe('source')
  })
})

describe('resolveCollectRuntimeContext', () => {
  it('forces self_hosted and discards a claimed cloud distribution', () => {
    expect(
      resolveCollectRuntimeContext({
        ...baseClientRuntime,
        deployment: 'cloud',
        distribution: 'cloud',
      })
    ).toMatchObject({ deployment: 'self_hosted', distribution: 'unknown' })
  })

  it('discards unrecognized distributions', () => {
    expect(
      resolveCollectRuntimeContext({ ...baseClientRuntime, distribution: 'mystery' }).distribution
    ).toBe('unknown')
  })

  it('omits absent release channel and version keys', () => {
    const runtime = resolveCollectRuntimeContext(baseClientRuntime)
    expect('release_channel' in runtime).toBe(false)
    expect('app_version' in runtime).toBe(false)
  })
})

describe('deployment properties in the sanitizer', () => {
  it('allows deployment, distribution and surface', () => {
    const result = sanitizeTelemetryEvent('$pageview', {
      deployment: 'self_hosted',
      distribution: 'desktop',
      surface: 'app',
    })

    expect(result.droppedProperties).toEqual([])
    expect(result.properties).toMatchObject({
      deployment: 'self_hosted',
      distribution: 'desktop',
      surface: 'app',
    })
  })
})
