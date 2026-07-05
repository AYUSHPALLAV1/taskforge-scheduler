import { Controller, Get, Post, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('ai')
@Controller('jobs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':id/ai-summary')
  @ApiOperation({ summary: 'Get AI failure summary for a job' })
  async getAiSummary(@Param('id') id: string) {
    return this.prisma.jobAiSummary.findFirst({ where: { jobId: id } });
  }

  @Post(':id/ai-summary/regenerate')
  @ApiOperation({ summary: 'Regenerate AI failure summary (rate-limited)' })
  async regenerate(@Param('id') id: string) {
    await this.aiService.regenerateSummary(id);
    return this.prisma.jobAiSummary.findFirst({ where: { jobId: id } });
  }
}
