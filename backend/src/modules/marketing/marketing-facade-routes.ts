// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * marketing-facade-routes.ts — Contract đọc canonical `/api/v1/marketing/*` (Phase 1).
 *
 * Xem MARKETING_ADR_001_facade_strategy.md. Facade CHỈ THÊM route đọc mới, map về
 * model legacy — KHÔNG đụng/không thay các route legacy đang chạy (customer-lists,
 * automation/sequences, target-jobs, broadcast-jobs, care-sessions...). Mọi handler
 * lọc theo request.user.orgId (defense-in-depth cùng tenant-guard).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import {
  getMarketingSummary,
  listMarketingLists,
  listMarketingTemplates,
  listMarketingBlocks,
  listMarketingSequences,
  listMarketingGoals,
  listMarketingCareSessions,
  listMarketingBroadcasts,
  getMarketingProjectTags,
} from './marketing-facade-service.js';

type UserCtx = { id: string; orgId: string; role: string };

function orgOf(request: FastifyRequest): string {
  return (request.user as UserCtx).orgId;
}

export async function marketingFacadeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/marketing/summary', async (request) => {
    return { summary: await getMarketingSummary(orgOf(request)) };
  });

  app.get('/api/v1/marketing/lists', async (request) => {
    return { lists: await listMarketingLists(orgOf(request)) };
  });

  app.get('/api/v1/marketing/templates', async (request) => {
    return { templates: await listMarketingTemplates(orgOf(request)) };
  });

  app.get('/api/v1/marketing/blocks', async (request) => {
    return { blocks: await listMarketingBlocks(orgOf(request)) };
  });

  app.get('/api/v1/marketing/sequences', async (request) => {
    return { sequences: await listMarketingSequences(orgOf(request)) };
  });

  app.get('/api/v1/marketing/goals', async (request) => {
    return { goals: await listMarketingGoals(orgOf(request)) };
  });

  app.get('/api/v1/marketing/care-sessions', async (request) => {
    return { careSessions: await listMarketingCareSessions(orgOf(request)) };
  });

  app.get('/api/v1/marketing/broadcasts', async (request) => {
    return { broadcasts: await listMarketingBroadcasts(orgOf(request)) };
  });

  app.get('/api/v1/marketing/project-tags', async (request) => {
    return { tags: await getMarketingProjectTags(orgOf(request)) };
  });
}
