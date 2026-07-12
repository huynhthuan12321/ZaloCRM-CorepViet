// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * use-project-tags — Tag dự án của org lấy ĐỘNG từ facade Marketing.
 * Thay cho mảng PROJECT_TAGS hard-code (branding bất động sản) — xem ADR-001.
 * GET /api/v1/marketing/project-tags trả distinct tagIds MessageTemplate của org.
 * Cache theo phiên (module-level) để mọi màn dùng chung, tránh gọi lặp.
 */
import { ref } from 'vue';
import { api } from '@/api';

const tags = ref<string[]>([]);
const loaded = ref(false);
let inflight: Promise<void> | null = null;

async function fetchProjectTags(force = false): Promise<void> {
  if (loaded.value && !force) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await api.get('/marketing/project-tags');
      tags.value = Array.isArray(res.data?.tags) ? res.data.tags : [];
      loaded.value = true;
    } catch {
      // Non-critical: giữ danh sách rỗng, UI cho nhập free-form.
      tags.value = [];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useProjectTags() {
  return { projectTags: tags, projectTagsLoaded: loaded, fetchProjectTags };
}
