import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkerService } from './worker.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('workers')
@Controller('workers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WorkerController {
  constructor(
    private readonly workerService: WorkerService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all registered workers with their status' })
  async listWorkers() {
    return this.prisma.worker.findMany({
      orderBy: { startedAt: 'desc' },
    });
  }

  @Get('status')
  @ApiOperation({ summary: 'Get current worker pool status' })
  getStatus() {
    return this.workerService.getStatus();
  }
}
