import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'fallback-secret-change-in-production',
    });
  }

  async validate(payload: { sub: string; email: string }) {
    this.logger.debug(`JWT validate called for sub=${payload.sub} email=${payload.email}`);
    try {
      const user = await this.authService.validateUser(payload.sub);
      if (!user) {
        this.logger.warn(`validateUser returned null for sub=${payload.sub}`);
        return null;
      }
      this.logger.debug(`JWT validate success: ${user.email}`);
      return { id: user.id, email: user.email, name: user.name };
    } catch (err) {
      this.logger.error(`JWT validate threw error for sub=${payload.sub}: ${err.message}`);
      return null;
    }
  }
}
