// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { ref } from 'vue';
import { api } from '@/api';
import { vietnamDateRange } from '@/utils/report-period';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FunnelStage {
  status: string;
  count: number;
  rate: number;
}

export interface ConversionFunnelData {
  from?: string;
  to?: string;
  asOf?: string;
  stagesMeaning?: 'created_in_period_current_status';
  stages: FunnelStage[];
  totalContacts: number;
  avgConversionDays: number | null;
  avgConversionDaysAvailability?: 'available' | 'unavailable';
  avgConversionDaysReason?: string;
}

export interface TeamMember {
  userId: string;
  fullName: string;
  messagesSent: number;
  contactsConverted: number;
  appointmentsCompleted: number;
  avgResponseTime: number | null;
}

export interface TeamPerformanceData {
  users: TeamMember[];
}

export interface ResponseTimeData {
  daily: { date: string; avgSeconds: number }[];
  overall: number | null;
  byUser: { userId: string; fullName: string; avgSeconds: number }[];
  availability?: 'available' | 'unavailable';
  reason?: string;
  /** Legacy aliases are main-only; shared-only nicks have separate counters. */
  pending?: number;
  unattributed?: number;
  mainPending?: number;
  sharedPending?: number;
  mainUnattributed?: number;
  sharedUnattributed?: number;
  asOf?: string;
}

export interface ReportConfig {
  metrics: string[];
  groupBy: string;
  dateRange: { from: string; to: string };
  filters?: { userId?: string; source?: string; status?: string };
}

export interface CustomReportResult {
  labels: string[];
  datasets: {
    metric: string;
    data: (number | null)[];
    availability?: 'available' | 'unavailable';
    reason?: string;
  }[];
}

export interface SavedReport {
  id: string;
  name: string;
  type: string;
  config: any;
  createdAt: string;
}

// ── Composable ────────────────────────────────────────────────────────────────

const defaultRange = () => vietnamDateRange(30);

export function useAnalytics() {
  const funnel = ref<ConversionFunnelData | null>(null);
  const teamPerformance = ref<TeamPerformanceData | null>(null);
  const responseTime = ref<ResponseTimeData | null>(null);
  const customResult = ref<CustomReportResult | null>(null);
  const savedReports = ref<SavedReport[]>([]);
  const loading = ref(false);
  const initialRange = defaultRange();
  const dateFrom = ref(initialRange.from);
  const dateTo = ref(initialRange.to);

  async function fetchFunnel() {
    const res = await api.get('/analytics/conversion-funnel', {
      params: { from: dateFrom.value, to: dateTo.value },
    });
    funnel.value = res.data;
  }

  async function fetchTeamPerformance() {
    const res = await api.get('/analytics/team-performance', {
      params: { from: dateFrom.value, to: dateTo.value },
    });
    teamPerformance.value = res.data;
  }

  async function fetchResponseTime() {
    const res = await api.get('/analytics/response-time', {
      params: { from: dateFrom.value, to: dateTo.value },
    });
    responseTime.value = res.data;
  }

  async function fetchAll() {
    loading.value = true;
    try {
      await Promise.all([fetchFunnel(), fetchTeamPerformance(), fetchResponseTime()]);
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      loading.value = false;
    }
  }

  async function runCustomReport(config: ReportConfig) {
    loading.value = true;
    try {
      const res = await api.post('/analytics/custom', config);
      customResult.value = res.data;
    } catch (err) {
      console.error('Custom report error:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchSavedReports() {
    try {
      const res = await api.get('/saved-reports');
      savedReports.value = res.data.data || [];
    } catch (err) {
      console.error('Saved reports fetch error:', err);
    }
  }

  async function createSavedReport(data: { name: string; type: string; config: any }) {
    const res = await api.post('/saved-reports', data);
    savedReports.value.unshift(res.data);
    return res.data;
  }

  async function deleteSavedReport(id: string) {
    await api.delete(`/saved-reports/${id}`);
    savedReports.value = savedReports.value.filter((r) => r.id !== id);
  }

  async function runSavedReport(id: string) {
    loading.value = true;
    try {
      const res = await api.post(`/saved-reports/${id}/run`);
      return res.data;
    } catch (err) {
      console.error('Run saved report error:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  return {
    funnel, teamPerformance, responseTime, customResult, savedReports,
    loading, dateFrom, dateTo,
    fetchAll, fetchFunnel, fetchTeamPerformance, fetchResponseTime,
    runCustomReport, fetchSavedReports, createSavedReport, deleteSavedReport, runSavedReport,
  };
}
