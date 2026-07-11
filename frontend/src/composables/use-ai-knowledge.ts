// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Huỳnh Ngọc Thuận — Community extension
import { ref } from 'vue';
import { api } from '@/api';

export interface KbDoc {
  id: string; title: string; sourceType: string;
  charCount: number; chunkCount: number; createdAt: string;
}
export interface KbConfig { embedProvider: string | null; embedModel: string | null }
export interface KbAnswer { answer: string; sources: string[]; chunksUsed: number }

export function useAiKnowledge() {
  const docs = ref<KbDoc[]>([]);
  const config = ref<KbConfig>({ embedProvider: null, embedModel: null });
  const loading = ref(false);
  const saving = ref(false);
  const asking = ref(false);

  async function fetchDocs(): Promise<void> {
    loading.value = true;
    try { const r = await api.get('/ai/knowledge/docs'); docs.value = r.data.docs ?? []; }
    finally { loading.value = false; }
  }
  async function fetchConfig(): Promise<void> {
    const r = await api.get('/ai/knowledge/config');
    config.value = { embedProvider: r.data.embedProvider ?? null, embedModel: r.data.embedModel ?? null };
  }
  async function saveConfig(p: KbConfig): Promise<void> {
    saving.value = true;
    try { await api.put('/ai/knowledge/config', p); config.value = { ...p }; }
    finally { saving.value = false; }
  }
  async function addDoc(title: string, text: string): Promise<{ id: string; chunkCount: number }> {
    saving.value = true;
    try { const r = await api.post('/ai/knowledge/docs', { title, text }); await fetchDocs(); return r.data; }
    finally { saving.value = false; }
  }
  async function removeDoc(id: string): Promise<void> {
    await api.delete(`/ai/knowledge/docs/${id}`);
    await fetchDocs();
  }
  async function ask(question: string): Promise<KbAnswer> {
    asking.value = true;
    try { const r = await api.post('/ai/knowledge/ask', { question }); return r.data as KbAnswer; }
    finally { asking.value = false; }
  }

  return { docs, config, loading, saving, asking, fetchDocs, fetchConfig, saveConfig, addDoc, removeDoc, ask };
}
