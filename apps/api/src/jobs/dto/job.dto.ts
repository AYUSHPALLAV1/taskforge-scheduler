import {
  IsString, IsOptional, IsInt, Min, Max, IsObject, IsDateString,
  IsBoolean, IsArray, ValidateNested, IsEnum
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateJobDto {
  @ApiProperty({ example: 'clq1234' })
  @IsString()
  queueId: string;

  @ApiProperty({ example: 'send-email' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ example: { to: 'user@example.com', subject: 'Hello' } })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  priority?: number;

  @ApiPropertyOptional({ description: 'ISO datetime for delayed/scheduled execution' })
  @IsOptional()
  @IsDateString()
  runAt?: string;

  @ApiPropertyOptional({ description: 'Cron expression for recurring jobs' })
  @IsOptional()
  @IsString()
  cronExpression?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  retryPolicyId?: string;

  @ApiPropertyOptional({ description: 'Idempotency key for deduplication' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class BatchCreateJobDto {
  @ApiProperty({ type: [CreateJobDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJobDto)
  jobs: CreateJobDto[];
}

export class ListJobsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  queueId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}
