// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChannelMockAccountPanel from './channel-mock-account-panel.vue';

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/api/index', () => ({ api: h }));

const account = {
  id: '00000000-0000-4000-8000-000000000081',
  displayName: 'Mock pilot',
  provider: 'MOCK_BROWSER',
  status: 'CONNECTED',
  outboundEnabled: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  h.get.mockImplementation((url: string) => Promise.resolve({
    data: url.endsWith('/fleet') ? {
      capacity: {
        activeWorkers: 1,
        effectiveLimit: 2,
        remainingSlots: 1,
        headroomBytes: 512 * 1024 * 1024,
        alerts: [],
      },
    } : {
      status: 'DEGRADED',
      worker: { heartbeatAgeMs: 2_000, rssBytes: 128 * 1024 * 1024 },
      outbound: { pending: 1, processing: 0, confirmed: 2, failed: 0, unknown: 1 },
      alerts: ['UNKNOWN_DELIVERY_REVIEW'],
    },
  }));
  h.post.mockResolvedValue({ data: { ok: true } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('TT08 two-account pilot panel', () => {
  it('allows creating the second account and hides creation at the limit', async () => {
    const one = mount(ChannelMockAccountPanel, { props: { accounts: [account] } });
    await flushPromises();
    expect(one.find('form').exists()).toBe(true);
    const two = mount(ChannelMockAccountPanel, { props: { accounts: [
      account,
      { ...account, id: '00000000-0000-4000-8000-000000000082', displayName: 'Mock pilot 2' },
    ] } });
    await flushPromises();
    expect(two.find('form').exists()).toBe(false);
  });

  it('shows heartbeat, queue state and sanitized alerts', async () => {
    const wrapper = mount(ChannelMockAccountPanel, { props: { accounts: [account] } });
    await flushPromises();
    expect(wrapper.text()).toContain('Pilot: DEGRADED');
    expect(wrapper.text()).toContain('Heartbeat: 2 giây trước');
    expect(wrapper.text()).toContain('1 chưa rõ');
    expect(wrapper.text()).toContain('RSS worker: 128.0 MB');
    expect(wrapper.text()).toContain('UNKNOWN_DELIVERY_REVIEW');
    expect(wrapper.text()).toContain('TT09 fleet: 1/2 worker');
    expect(wrapper.text()).toContain('headroom 512.0 MB');
  });

  it('requires a user confirmation before the rollback drill', async () => {
    const wrapper = mount(ChannelMockAccountPanel, { props: { accounts: [account] } });
    await flushPromises();
    await wrapper.get('button.rollback').trigger('click');
    await flushPromises();
    expect(window.confirm).toHaveBeenCalled();
    expect(h.post).toHaveBeenCalledWith(`/channel-accounts/mock/${account.id}/rollback`);
    expect(wrapper.emitted('changed')).toBeTruthy();
  });

  it('exposes visible form labels and announces asynchronous state', async () => {
    const disconnected = { ...account, status: 'DISCONNECTED', outboundEnabled: false };
    const wrapper = mount(ChannelMockAccountPanel, { props: { accounts: [disconnected] } });
    await flushPromises();
    expect(wrapper.get('label[for="mock-account-name"]').text()).toContain('Tên tài khoản');
    expect(wrapper.get('#mock-account-name').attributes('aria-label')).toBeUndefined();
    expect(wrapper.get('section').attributes('aria-busy')).toBe('false');
  });
});
