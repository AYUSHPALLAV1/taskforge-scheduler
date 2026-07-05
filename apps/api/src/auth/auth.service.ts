import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto, LoginDto } from './dto/auth.dto';
import { randomBytes, createHash } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // ===========================
  // SIGNUP
  // ===========================
  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, name: dto.name },
    });

    this.logger.log(`New user registered: ${user.email}`);
    return { id: user.id, email: user.email, name: user.name };
  }

  // ===========================
  // LOGIN
  // ===========================
  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string; user: object }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Verify password (constant-time via argon2)
    const isValid = user ? await argon2.verify(user.passwordHash, dto.password) : false;
    if (!user || !isValid || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = this.generateAccessToken(user.id, user.email);
    const refreshToken = await this.generateAndStoreRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  // ===========================
  // REFRESH
  // ===========================
  async refresh(rawRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: { user: true },
    });

    if (!stored || new Date() > stored.expiresAt) {
      // Token not found or expired — attempt replay detection
      await this.handleTokenReplay(tokenHash);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: revoke old, issue new
    const newRawToken = randomBytes(32).toString('hex');
    const newHash = this.hashToken(newRawToken);

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      await tx.refreshToken.create({
        data: {
          userId: stored.userId,
          tokenHash: newHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    });

    const accessToken = this.generateAccessToken(stored.userId, stored.user.email);
    return { accessToken, refreshToken: newRawToken };
  }

  // ===========================
  // LOGOUT
  // ===========================
  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
  }

  // ===========================
  // VALIDATE (used by JwtStrategy)
  // ===========================
  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) return null;
    return user;
  }

  // ===========================
  // VALIDATE API KEY
  // ===========================
  async validateApiKey(rawKey: string) {
    // Keys are formatted as: tf_live_<prefix>_<secret>
    const keyHash = this.hashToken(rawKey);
    const apiKey = await this.prisma.projectApiKey.findFirst({
      where: { keyHash, revokedAt: null },
      include: { project: { include: { org: true } } },
    });

    if (!apiKey) return null;

    // Update last used
    await this.prisma.projectApiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return apiKey;
  }

  // ===========================
  // HELPERS
  // ===========================
  private generateAccessToken(userId: string, email: string): string {
    return this.jwtService.sign(
      { sub: userId, email },
      { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' },
    );
  }

  private async generateAndStoreRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const hash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hash, expiresAt },
    });

    return raw;
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async handleTokenReplay(tokenHash: string): Promise<void> {
    // If a revoked token is presented, invalidate the whole family
    const revoked = await this.prisma.refreshToken.findFirst({ where: { tokenHash } });
    if (revoked) {
      this.logger.warn(`⚠️ Refresh token replay detected for user ${revoked.userId} — invalidating all tokens`);
      await this.prisma.refreshToken.updateMany({
        where: { userId: revoked.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }
}
