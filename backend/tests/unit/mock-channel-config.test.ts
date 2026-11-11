import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockChannelEnabled } from '../../src/config/mock-channel-config.js';
import { browserChannelCapabilities } from '../../src/modules/channels/channel-capabilities.js';

afterEach(() => vi.unstubAllEnvs());

describe('remaining local channel configuration', () => {
  it.each(['development', 'test', 'production', ''])('only enables explicit local fixtures in %s', NODE_ENV => {
    expect(mockChannelEnabled({ NODE_ENV, CHANNELS_ENABLED: 'true', MOCK_CHANNEL_ENABLED: 'true' }))
      .toBe(['development', 'test'].includes(NODE_ENV));
    expect(mockChannelEnabled({ NODE_ENV, CHANNELS_ENABLED: 'false', MOCK_CHANNEL_ENABLED: 'true' })).toBe(false);
    expect(mockChannelEnabled({ NODE_ENV, CHANNELS_ENABLED: 'true' })).toBe(false);
  });

  it('denies retired providers while retaining the local mock capabilities', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('CHANNELS_ENABLED', 'true');
    vi.stubEnv('MOCK_CHANNEL_ENABLED', 'true');
    expect(browserChannelCapabilities('MOCK_BROWSER')).toMatchObject({ textRead: true, textSend: true });
    expect(browserChannelCapabilities('TIKTOK_WEB_SESSION')).toMatchObject({ textRead: false, textSend: false });
    expect(browserChannelCapabilities('UNKNOWN')).toMatchObject({ textRead: false, textSend: false });
  });
});
