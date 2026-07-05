import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // Security
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'Idempotency-Key', 'If-Match'],
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Validation pipe — invalid input never reaches service layer
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter — maps domain errors to { error: { code, message, details[] } }
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global response interceptor — wraps success in { data, meta }
  app.useGlobalInterceptors(new ResponseInterceptor());

  // OpenAPI / Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('TaskForge API')
    .setDescription('Distributed Job Scheduling Platform — Complete API Reference')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('refresh_token')
    .addTag('auth', 'Authentication endpoints')
    .addTag('organizations', 'Organization management')
    .addTag('projects', 'Project management')
    .addTag('queues', 'Queue configuration')
    .addTag('jobs', 'Job creation and management')
    .addTag('workers', 'Worker fleet status')
    .addTag('workflows', 'DAG workflow definitions and runs')
    .addTag('dlq', 'Dead Letter Queue')
    .addTag('ai', 'AI failure summaries')
    .addTag('system', 'Health & readiness probes')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 TaskForge API listening on port ${port}`);
  console.log(`📖 Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
