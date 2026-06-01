/**
 * Auth service — handles setup, login, and profile operations.
 * Uses bcryptjs for password hashing and Fastify JWT for token signing.
 *
 * Phase Onboarding v1 2026-05-24 — login(identifier) accept cả email vừa phone.
 * - Có '@' → tìm theo email (lowercase)
 * - Toàn chữ số → tìm theo phone (normalize 84xxx)
 * - Sale VN ít/không có email → admin tạo user chỉ với phone.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { normalizePhone } from '../../shared/utils/phone.js';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
  orgId: string;
  // Phase Onboarding v1 2026-05-24 — token version, bump khi đổi password → revoke JWT cũ
  tv: number;
}

// Check if any users exist — true means first-run setup is needed
export async function checkSetupStatus(): Promise<{ needsSetup: boolean }> {
  const count = await prisma.user.count();
  return { needsSetup: count === 0 };
}

// Create the initial organization + owner user, return JWT payload
export async function setup(
  orgName: string,
  fullName: string,
  email: string,
  password: string,
): Promise<JwtPayload> {
  const existing = await prisma.user.count();
  if (existing > 0) {
    const err = new Error('Setup already completed') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: orgName } });
    const user = await tx.user.create({
      data: {
        orgId: org.id,
        email: email.toLowerCase().trim(),
        passwordHash,
        fullName,
        role: 'owner',
      },
    });
    return { org, user };
  });

  logger.info(`Setup complete — org=${result.org.id}, user=${result.user.id}`);

  return {
    id: result.user.id,
    // Setup là owner đầu tiên → luôn có email
    email: result.user.email ?? result.user.id,
    role: result.user.role,
    orgId: result.org.id,
    tv: result.user.jwtTokenVersion,
  };
}

// Verify credentials, return JWT payload.
// identifier accept cả email vừa phone — auto-detect:
//   - Có '@' → email lookup (lowercase)
//   - Toàn chữ số / + → phone lookup (normalize 84xxx)
//   - Đảm bảo phone match ≥ 9 chữ số để tránh nhầm số nhà
export async function login(identifier: string, password: string): Promise<JwtPayload> {
  const trimmed = (identifier || '').trim();
  if (!trimmed) {
    const err = new Error('Email hoặc SĐT không được để trống') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  let user: Awaited<ReturnType<typeof prisma.user.findUnique>> = null;

  if (trimmed.includes('@')) {
    user = await prisma.user.findUnique({
      where: { email: trimmed.toLowerCase() },
    });
  } else {
    // Thử parse phone
    const normalized = normalizePhone(trimmed);
    if (normalized) {
      user = await prisma.user.findUnique({
        where: { phone: normalized },
      });
    }
    // Fallback: chuỗi nguyên gốc dạng email không '@' (vd 'admin') — tìm theo email
    if (!user) {
      user = await prisma.user.findUnique({ where: { email: trimmed.toLowerCase() } });
    }
  }

  if (!user || !user.isActive) {
    const err = new Error('Email/SĐT hoặc mật khẩu không đúng') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const err = new Error('Email/SĐT hoặc mật khẩu không đúng') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  // Phase status 4-state 2026-05-27 — set lastLoginAt async (fire-and-forget) cho status compute.
  // KHÔNG block login response — nếu update fail thì im lặng (status compute sẽ thấy null vẫn OK).
  prisma.user
    .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    .catch(() => {});

  return {
    id: user.id,
    // Email có thể null cho sale chỉ có phone → fallback phone vào claim email cho legacy code đọc
    email: user.email ?? user.phone ?? user.id,
    role: user.role,
    orgId: user.orgId,
    tv: user.jwtTokenVersion,
  };
}

// Return safe user profile (no password hash). Phase Onboarding v1 — expose
// passwordChangedAt + onboardingDismissedAt để FE biết hiện force change pw modal
// + checklist hay không.
export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      fullName: true,
      role: true,
      orgId: true,
      teamId: true,
      isActive: true,
      createdAt: true,
      passwordChangedAt: true,
      onboardingDismissedAt: true,
      onboardingStepsCompleted: true,
      org: { select: { id: true, name: true, timezone: true } },
    },
  });

  if (!user) {
    const err = new Error('User not found') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  return user;
}
