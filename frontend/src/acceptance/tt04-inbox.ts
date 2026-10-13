// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
// Test entry only; not imported by main.ts/router or included in production entry.
import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import AcceptanceInbox from './tt04-inbox.vue';

const pinia = createPinia(); setActivePinia(pinia);
const auth = useAuthStore();
auth.user = (window as unknown as { tt04Fixture: typeof auth.user }).tt04Fixture;
createApp(AcceptanceInbox).use(pinia).mount('#app');
