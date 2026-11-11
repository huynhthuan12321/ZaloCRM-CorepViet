// Local fixture only; no live connector is installed.
export function mockChannelEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return ['development', 'test'].includes(env.NODE_ENV ?? '')
    && env.CHANNELS_ENABLED?.trim().toLowerCase() === 'true'
    && env.MOCK_CHANNEL_ENABLED?.trim().toLowerCase() === 'true';
}
