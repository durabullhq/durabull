import { describe, expect, it } from 'bun:test'

import { sanitizeTelemetryEvent } from '../sanitizer'
import { resolveCollectRuntimeContext, resolveTelemetryDeployment } from './runtime'

const baseClientRuntime = {
  authless: false,
  env_connections: false,
  environment: 'production',
  persistence: 'postgres',
  stateless: false,
}

describe('resolveTelemetryDeployment', () => {
  it('reports cloud for Durabull Cloud even though it runs the docker image', () => {
    expect(resolveTelemetryDeployment({ cloud: true, releaseChannel: 'docker' })).toEqual({
      deployment: 'cloud',
      distribution: 'cloud',
    })
  })

  it('maps release channels to self-hosted distributions', () => {
    const distributionFor = (releaseChannel: string) =>
      resolveTelemetryDeployment({ cloud: false, releaseChannel })

    expect(distributionFor('docker')).toEqual({ deployment: 'self_hosted', distribution: 'docker' })
    expect(distributionFor('desktop').distribution).toBe('desktop')
    expect(distributionFor('desktop-dev').distribution).toBe('desktop')
    expect(distributionFor('stable').distribution).toBe('source')
  })
})

describe('resolveCollectRuntimeContext', () => {
  it('forces self_hosted and discards a claimed cloud distribution', () => {
    expect(
      resolveCollectRuntimeContext({ ...baseClientRuntime, distribution: 'cloud' })
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
    expect('api_version' in runtime).toBe(false)
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
