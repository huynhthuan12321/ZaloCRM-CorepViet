import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { resolveSystemNotifyRecipient, sendSystemNotificationToUser } from './system-notify-service.js';
import { DEFAULT_WELCOME_TEMPLATE, buildWelcomeMessage, validateTemplate } from './welcome-message-builder.js';
import { uploadBuffer } from '../../shared/storage/minio-client.js';
import { config } from '../../config/index.js';

function hashPhone(phone: string): string {
  return createHash('sha256').update(phone.trim()).digest('hex');
}

async function logPhoneSearch(args: {
  orgId: string;
  accountId: string;
  userId: string;
  phone: string;
  result: string;
  foundUid: string | null;
  errorCode: string | null;
}) {
  try {
    await prisma.phoneSearchEvent.create({
      data: {
        orgId: args.orgId,
        accountId: args.accountId,
        userId: args.userId,
        phoneHash: hashPhone(args.phone),
        result: args.result,
        foundUid: args.foundUid,
        errorCode: args.errorCode,
      },
    });
  } catch (err) {
    logger.warn(`[system-notify-phone-search-log] failed: ${String(err)}`);
  }
}

async function listRecipientRows(orgId: string) {
  const users = await prisma.user.findMany({
    where: { orgId, isActive: true },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      permissionGroup: { select: { id: true, name: true, isSystem: true } },
      departmentMember: {
        select: {
          deptRole: true,
          department: { select: { id: true, name: true, path: true } },
        },
      },
      internalContactNick: {
        select: { id: true, displayName: true, avatarUrl: true, phone: true, status: true },
      },
    },
    orderBy: { fullName: 'asc' },
  });

  return Promise.all(users.map(async (user) => {
    const resolved = await resolveSystemNotifyRecipient(orgId, user.id);
    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        departmentMember: user.departmentMember,
        permissionGroup: user.permissionGroup,
      },
      internalContactNick: user.internalContactNick,
      recipient: {
        id: resolved.recipient.id,
        status: resolved.status,
        error: resolved.error,
        conversationId: resolved.conversationId,
        threadIdInSenderView: resolved.threadIdInSenderView,
        lastVerifiedAt: resolved.recipient.lastVerifiedAt,
      },
    };
  }));
}

export async function systemNotifyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get(
    '/api/v1/system-notifications/settings',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest) => {
      const currentUser = request.user!;
      const [org, nicks] = await Promise.all([
        prisma.organization.findUnique({
          where: { id: currentUser.orgId },
          select: {
            systemNotifyZaloAccountId: true,
            systemNotifyNick: { select: { id: true, displayName: true, avatarUrl: true, zaloUid: true, status: true } },
          },
        }),
        prisma.zaloAccount.findMany({
          where: { orgId: currentUser.orgId },
          select: { id: true, displayName: true, avatarUrl: true, zaloUid: true, phone: true, status: true },
          orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
        }),
      ]);

      return {
        systemNotifyZaloAccountId: org?.systemNotifyZaloAccountId ?? null,
        systemNotifyNick: org?.systemNotifyNick ?? null,
        nicks,
      };
    },
  );

  app.patch(
    '/api/v1/system-notifications/settings/sender',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = request.user!;
      const body = (request.body ?? {}) as { zaloAccountId?: string | null };
      const accountId = body.zaloAccountId ?? null;

      if (accountId !== null) {
        const nick = await prisma.zaloAccount.findFirst({
          where: { id: accountId, orgId: currentUser.orgId },
          select: { id: true, status: true, displayName: true },
        });
        if (!nick) return reply.status(404).send({ error: 'Nick không tồn tại trong org' });
        if (nick.status !== 'connected') {
          logger.warn(`Org system-notify sender set to disconnected nick: ${nick.displayName} (${accountId})`);
        }
      }

      await prisma.organization.update({
        where: { id: currentUser.orgId },
        data: { systemNotifyZaloAccountId: accountId },
      });

      return { ok: true, systemNotifyZaloAccountId: accountId };
    },
  );

  app.get(
    '/api/v1/system-notifications/recipients',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest) => {
      const currentUser = request.user!;
      const recipients = await listRecipientRows(currentUser.orgId);
      const summary = recipients.reduce<Record<string, number>>((acc, row) => {
        acc[row.recipient.status] = (acc[row.recipient.status] ?? 0) + 1;
        return acc;
      }, {});
      return { summary, recipients };
    },
  );

  app.get(
    '/api/v1/system-notifications/recipients/health',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest) => {
      const currentUser = request.user!;
      const recipients = await listRecipientRows(currentUser.orgId);
      const summary = recipients.reduce<Record<string, number>>((acc, row) => {
        acc[row.recipient.status] = (acc[row.recipient.status] ?? 0) + 1;
        return acc;
      }, {});
      return { summary, recipients };
    },
  );

  app.post(
    '/api/v1/system-notifications/recipients/:userId/lookup-uid',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = request.user!;
      const { userId } = request.params as { userId: string };

      const [org, targetUser] = await Promise.all([
        prisma.organization.findUnique({
          where: { id: currentUser.orgId },
          select: { systemNotifyZaloAccountId: true },
        }),
        prisma.user.findFirst({
          where: { id: userId, orgId: currentUser.orgId, isActive: true },
          select: {
            id: true,
            internalContactZaloAccountId: true,
            internalContactNick: { select: { id: true, phone: true } },
          },
        }),
      ]);

      const senderId = org?.systemNotifyZaloAccountId ?? null;
      const internalId = targetUser?.internalContactZaloAccountId ?? null;

      if (!targetUser) return reply.status(404).send({ error: 'User không tồn tại trong org' });
      if (!senderId) return reply.status(400).send({ error: 'Org chưa chọn nick gửi thông báo hệ thống', status: 'missing_system_sender' });
      if (!internalId || !targetUser.internalContactNick) {
        await resolveSystemNotifyRecipient(currentUser.orgId, userId);
        return reply.status(400).send({ error: 'User chưa chọn nick liên lạc nội bộ', status: 'missing_internal_contact' });
      }

      const sender = await prisma.zaloAccount.findFirst({
        where: { id: senderId, orgId: currentUser.orgId },
        select: { id: true, status: true, sessionData: true },
      });
      if (!sender || sender.status !== 'connected' || !sender.sessionData) {
        await resolveSystemNotifyRecipient(currentUser.orgId, userId);
        return reply.status(400).send({ error: 'Nick gửi hệ thống đang offline', status: 'sender_disconnected' });
      }

      const phone = normalizePhone(targetUser.internalContactNick.phone);
      if (!phone) {
        await resolveSystemNotifyRecipient(currentUser.orgId, userId);
        return reply.status(400).send({ error: 'Nick liên lạc nội bộ chưa có SĐT để tìm UID', status: 'missing_internal_phone' });
      }

      try {
        const result = await zaloOps.findUser(senderId, phone);
        const u = (result as Record<string, unknown>) || {};
        const uid = String(u.uid || u.userId || '') || null;

        if (!uid) {
          await logPhoneSearch({ orgId: currentUser.orgId, accountId: senderId, userId: currentUser.id, phone, result: 'no_zalo', foundUid: null, errorCode: null });
          const recipient = await prisma.systemNotifyRecipient.upsert({
            where: { targetUserId_senderZaloAccountId: { targetUserId: userId, senderZaloAccountId: senderId } },
            create: {
              orgId: currentUser.orgId,
              targetUserId: userId,
              senderZaloAccountId: senderId,
              internalContactZaloAccountId: internalId,
              status: 'uid_not_found',
              error: 'Không tìm thấy UID từ SĐT nick nội bộ',
            },
            update: {
              internalContactZaloAccountId: internalId,
              threadIdInSenderView: null,
              status: 'uid_not_found',
              error: 'Không tìm thấy UID từ SĐT nick nội bộ',
              lastVerifiedAt: new Date(),
            },
          });
          return { found: false, recipient };
        }

        await logPhoneSearch({ orgId: currentUser.orgId, accountId: senderId, userId: currentUser.id, phone, result: 'found_zalo', foundUid: uid, errorCode: null });
        const recipient = await prisma.systemNotifyRecipient.upsert({
          where: { targetUserId_senderZaloAccountId: { targetUserId: userId, senderZaloAccountId: senderId } },
          create: {
            orgId: currentUser.orgId,
            targetUserId: userId,
            senderZaloAccountId: senderId,
            internalContactZaloAccountId: internalId,
            threadIdInSenderView: uid,
            status: 'ready',
            error: null,
            lastVerifiedAt: new Date(),
          },
          update: {
            internalContactZaloAccountId: internalId,
            threadIdInSenderView: uid,
            status: 'ready',
            error: null,
            lastVerifiedAt: new Date(),
          },
        });

        return {
          found: true,
          uid,
          zaloName: String(u.zaloName || u.zalo_name || u.displayName || u.display_name || '') || null,
          username: String(u.username || '') || null,
          globalId: String(u.globalId || '') || null,
          avatar: String(u.avatar || '') || null,
          recipient,
        };
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        const result = e?.code === 'NOT_CONNECTED' || e?.code === 'RATE_LIMITED' ? 'rate_limited' : 'no_zalo';
        await logPhoneSearch({ orgId: currentUser.orgId, accountId: senderId, userId: currentUser.id, phone, result, foundUid: null, errorCode: e?.code ?? null });
        const recipient = await prisma.systemNotifyRecipient.upsert({
          where: { targetUserId_senderZaloAccountId: { targetUserId: userId, senderZaloAccountId: senderId } },
          create: {
            orgId: currentUser.orgId,
            targetUserId: userId,
            senderZaloAccountId: senderId,
            internalContactZaloAccountId: internalId,
            status: 'lookup_failed',
            error: e?.message || String(err),
          },
          update: {
            internalContactZaloAccountId: internalId,
            status: 'lookup_failed',
            error: e?.message || String(err),
            lastVerifiedAt: new Date(),
          },
        });
        return reply.status(503).send({ found: false, status: 'lookup_failed', error: recipient.error, recipient });
      }
    },
  );

  app.post(
    '/api/v1/system-notifications/test',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = request.user!;
      const body = (request.body ?? {}) as { targetUserId?: string; title?: string; content?: string; priority?: 'low' | 'normal' | 'high' };
      if (!body.targetUserId) return reply.status(400).send({ error: 'targetUserId là bắt buộc' });

      const target = await prisma.user.findFirst({
        where: { id: body.targetUserId, orgId: currentUser.orgId, isActive: true },
        select: { id: true },
      });
      if (!target) return reply.status(404).send({ error: 'User không tồn tại trong org' });

      const notification = await sendSystemNotificationToUser({
        orgId: currentUser.orgId,
        targetUserId: body.targetUserId,
        type: 'test',
        title: body.title?.trim() || 'Test thông báo hệ thống',
        content: body.content?.trim() || `Đây là tin test từ CRM gửi bởi ${currentUser.email}.`,
        priority: body.priority ?? 'normal',
      });

      return { ok: notification.status === 'sent', notification };
    },
  );

  // ── Org config: welcome message template + image + admin fallback phone ──
  // Phase user-create-with-zalo 2026-05-27. Dùng chung trang Thông báo hệ thống,
  // admin sửa template + upload ảnh + nhập SĐT admin fallback.

  app.get(
    '/api/v1/system-notifications/org-config',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest) => {
      const currentUser = request.user!;
      const org = await prisma.organization.findUnique({
        where: { id: currentUser.orgId },
        select: {
          welcomeMessageTemplate: true,
          welcomeImageUrl: true,
          adminFallbackPhone: true,
        },
      });
      return {
        welcomeMessageTemplate: org?.welcomeMessageTemplate ?? null,
        welcomeImageUrl: org?.welcomeImageUrl ?? null,
        adminFallbackPhone: org?.adminFallbackPhone ?? null,
        defaultTemplate: DEFAULT_WELCOME_TEMPLATE,
      };
    },
  );

  app.patch(
    '/api/v1/system-notifications/org-config',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = request.user!;
      const body = (request.body ?? {}) as {
        welcomeMessageTemplate?: string | null;
        welcomeImageUrl?: string | null;
        adminFallbackPhone?: string | null;
      };

      const data: Record<string, string | null> = {};
      if (Object.prototype.hasOwnProperty.call(body, 'welcomeMessageTemplate')) {
        const tpl = body.welcomeMessageTemplate;
        if (tpl !== null && tpl !== undefined) {
          if (typeof tpl !== 'string' || tpl.length > 4000) {
            return reply.status(400).send({ error: 'Template phải là string ≤ 4000 ký tự' });
          }
          const errors = validateTemplate(tpl);
          if (errors.length > 0) {
            return reply.status(400).send({ error: errors.join('; ') });
          }
        }
        data.welcomeMessageTemplate = tpl ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'welcomeImageUrl')) {
        const url = body.welcomeImageUrl;
        // FIX codex LOW-8: chỉ cho phép URL từ MinIO public CDN (do BE tự upload), không phải URL bất kỳ.
        // Null/empty = xoá ảnh, OK.
        if (url !== null && url !== undefined && url !== '') {
          if (typeof url !== 'string' || !url.startsWith(config.s3PublicUrl)) {
            return reply.status(400).send({ error: 'welcomeImageUrl phải là URL MinIO của hệ thống (upload qua /welcome-image)' });
          }
        }
        data.welcomeImageUrl = url || null;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'adminFallbackPhone')) {
        const phone = body.adminFallbackPhone;
        if (phone !== null && phone !== undefined && phone !== '') {
          const norm = normalizePhone(String(phone));
          if (!norm) {
            return reply.status(400).send({ error: 'SĐT admin fallback không hợp lệ' });
          }
          data.adminFallbackPhone = norm;
        } else {
          data.adminFallbackPhone = null;
        }
      }

      await prisma.organization.update({
        where: { id: currentUser.orgId },
        data,
      });
      return { ok: true };
    },
  );

  app.post(
    '/api/v1/system-notifications/welcome-image',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const currentUser = request.user!;
      try {
        for await (const part of request.parts()) {
          if (part.type === 'file' && part.fieldname === 'image') {
            if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(part.mimetype)) {
              return reply.status(415).send({ error: `Mime không support: ${part.mimetype}` });
            }
            const buf = await part.toBuffer();
            if (buf.length > 5 * 1024 * 1024) {
              return reply.status(413).send({ error: 'Ảnh quá 5MB' });
            }
            const result = await uploadBuffer(buf, part.mimetype, part.filename);
            await prisma.organization.update({
              where: { id: currentUser.orgId },
              data: { welcomeImageUrl: result.url },
            });
            return { ok: true, url: result.url };
          }
        }
      } catch (err) {
        return reply.status(400).send({ error: `Upload fail: ${(err as Error)?.message}` });
      }
      return reply.status(400).send({ error: 'Không tìm thấy field "image" trong multipart' });
    },
  );

  app.post(
    '/api/v1/system-notifications/preview-welcome',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest) => {
      const currentUser = request.user!;
      const body = (request.body ?? {}) as {
        templateOverride?: string;
        variant?: 'friend' | 'stranger';
      };
      const org = await prisma.organization.findUnique({
        where: { id: currentUser.orgId },
        select: { name: true, welcomeMessageTemplate: true, welcomeImageUrl: true, adminFallbackPhone: true },
      });
      const template = body.templateOverride ?? org?.welcomeMessageTemplate ?? null;
      const payload = buildWelcomeMessage(template, {
        fullName: 'Nguyễn Văn A',
        email: 'nguyenvana@example.com',
        phone: '0931536109',
        password: 'a3k7p9',
        loginUrl: process.env.CRM_LOGIN_URL || 'https://crm.example.com',
        orgName: org?.name ?? 'Tổ chức',
        departmentName: 'Phòng Kinh Doanh',
        roleName: 'Nhân viên Sale',
        adminPhone: org?.adminFallbackPhone ?? '0908278807',
        variant: body.variant ?? 'stranger',
      }, { welcomeImagePath: org?.welcomeImageUrl ?? null });
      return {
        text: payload.formatted.text,
        styles: payload.formatted.styles,
        attachments: payload.attachments,
      };
    },
  );
}
