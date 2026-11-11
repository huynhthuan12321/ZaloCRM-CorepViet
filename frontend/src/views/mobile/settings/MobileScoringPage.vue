<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  Chấm điểm tương tác (mobile, CHỈ ĐỌC): trọng số, giảm điểm khi im lặng, cờ điều khiển, danh sách quy tắc. Dữ liệu = useScoring().getScoringConfig +
  getSignalRules (GET /scoring/config, /scoring/rules). KHÔNG có lưu, seed, tính lại toàn bộ, quét stuck (các thao tác nặng chỉ ở máy tính).
-->
<template>
  <section class="crm-sc">
    <MobileFeedback v-if="load.state.value === 'loading'" state="loading" title="Đang tải cấu hình chấm điểm" />
    <MobileFeedback v-else-if="load.state.value !== 'ready' || !cfg" :state="load.state.value === 'ready' ? 'error' : load.state.value" :title="load.state.value === 'error' ? 'Không tải được cấu hình chấm điểm' : undefined" :retryable="load.state.value !== 'forbidden'" @retry="load.load" />
    <template v-else>
      <section class="crm-sc__card" aria-labelledby="sc-w">
        <h2 id="sc-w">Trọng số 4 chiều</h2>
        <dl class="crm-sc__kv">
          <div><dt>Tương tác</dt><dd>{{ cfg.weights.engagement }}%</dd></div>
          <div><dt>Ý định mua</dt><dd>{{ cfg.weights.intent }}%</dd></div>
          <div><dt>Phù hợp</dt><dd>{{ cfg.weights.fit }}%</dd></div>
          <div><dt>Đà tăng nhiệt</dt><dd>{{ cfg.weights.velocity }}%</dd></div>
        </dl>
      </section>
      <section class="crm-sc__card" aria-labelledby="sc-d">
        <h2 id="sc-d">Giảm điểm khi khách im lặng (mỗi ngày)</h2>
        <dl class="crm-sc__kv">
          <div><dt>3–7 ngày</dt><dd>{{ cfg.decay.day3to7 }}</dd></div>
          <div><dt>7–14 ngày</dt><dd>{{ cfg.decay.day7to14 }}</dd></div>
          <div><dt>14–30 ngày</dt><dd>{{ cfg.decay.day14to30 }}</dd></div>
          <div><dt>30–60 ngày</dt><dd>{{ cfg.decay.day30to60 }}</dd></div>
        </dl>
      </section>
      <section class="crm-sc__card" aria-labelledby="sc-f">
        <h2 id="sc-f">Cờ điều khiển</h2>
        <dl class="crm-sc__kv">
          <div><dt>Tự chuyển giai đoạn</dt><dd>{{ onOff(cfg.autoPromote) }}</dd></div>
          <div><dt>Phát hiện đình trệ</dt><dd>{{ onOff(cfg.stuckDetectionEnabled) }}</dd></div>
          <div><dt>Lưu chi tiết giải thích điểm</dt><dd>{{ onOff(cfg.explainabilityEnabled) }}</dd></div>
        </dl>
      </section>
      <section class="crm-sc__card" aria-labelledby="sc-r">
        <h2 id="sc-r">Quy tắc chấm điểm ({{ rules.length }})</h2>
        <ul class="crm-sc__rules">
          <li v-for="r in rules" :key="r.id" class="crm-sc__rule">
            <span class="crm-sc__rk">{{ r.label || r.signalKey }}</span>
            <span class="crm-sc__rm">{{ r.signalKey }} · {{ dimensionLabel(r.dimension) }} · {{ r.ruleType }} · <b :class="r.delta > 0 ? 'pos' : 'neg'">{{ r.delta > 0 ? '+' : '' }}{{ r.delta }}</b><template v-if="r.capPerDay != null"> · tối đa {{ r.capPerDay }}/ngày</template> · {{ r.enabled ? 'Bật' : 'Tắt' }}</span>
          </li>
        </ul>
      </section>
      <MobileDesktopNotice action="lưu cấu hình, seed mặc định, tính lại toàn bộ điểm hoặc quét khách đình trệ" />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import MobileFeedback from '@/components/mobile/shell/MobileFeedback.vue';
import MobileDesktopNotice from '@/components/mobile/settings/MobileDesktopNotice.vue';
import { useScoring } from '@/composables/use-scoring';
import { useReadonlyLoad } from '@/composables/mobile-settings/use-readonly-load';

const scoring = useScoring();
const load = useReadonlyLoad(async () => {
  const [config, rules] = await Promise.all([scoring.getScoringConfig(), scoring.getSignalRules()]);
  return { config, rules };
});
const cfg = computed(() => load.data.value?.config ?? null);
const rules = computed(() => load.data.value?.rules ?? []);
const DIM: Record<string, string> = { engagement: 'Tương tác', intent: 'Ý định', fit: 'Phù hợp', velocity: 'Đà tăng' };
const dimensionLabel = (d: string) => DIM[d] ?? d;
const onOff = (v: boolean) => (v ? 'Bật' : 'Tắt');
onMounted(() => { void load.load(); });
</script>

<style scoped>
.crm-sc { display: flex; flex-direction: column; gap: var(--m-space-4); color: var(--m-text); min-width: 0; }
.crm-sc__card { padding: var(--m-space-4); border: 1px solid var(--m-line); border-radius: var(--m-radius-card); background: var(--m-surface); }
.crm-sc__card h2 { margin: 0 0 var(--m-space-2); font-size: var(--m-font-section); font-weight: 650; }
.crm-sc__kv { margin: 0; }
.crm-sc__kv > div { display: flex; justify-content: space-between; gap: var(--m-space-3); padding: var(--m-space-2) 0; border-top: 1px solid var(--m-line); }
.crm-sc__kv dt { color: var(--m-muted); }
.crm-sc__kv dd { margin: 0; font-weight: 650; }
.crm-sc__rules { list-style: none; margin: 0; padding: 0; }
.crm-sc__rule { display: flex; flex-direction: column; gap: 2px; padding: var(--m-space-2) 0; border-top: 1px solid var(--m-line); min-width: 0; }
.crm-sc__rk { font-weight: 650; overflow-wrap: anywhere; }
.crm-sc__rm { font-size: var(--m-font-meta); color: var(--m-muted); overflow-wrap: anywhere; }
.pos { color: var(--m-success); }
.neg { color: var(--m-danger); }
</style>
