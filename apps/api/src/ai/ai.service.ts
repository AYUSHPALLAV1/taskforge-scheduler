import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { createHash } from 'crypto';

interface AiSummaryResult {
  rootCauseSummary: string;
  category: string;
  confidenceLevel: 'low' | 'medium' | 'high';
  suggestedFix: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  private readonly apiKey = process.env.GEMINI_API_KEY;
  private requestCount = 0;
  private readonly rpmLimit = parseInt(process.env.GEMINI_RPM_LIMIT || '10');

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ===========================
  // PROCESS AI SUMMARIZE JOB
  // ===========================
  async processSummaryJob(payload: { targetJobId: string; executionId?: string; errorMessage: string }): Promise<void> {
    const { targetJobId, executionId, errorMessage } = payload;

    // Check if summary already exists (idempotent)
    const existing = await this.prisma.jobAiSummary.findFirst({ where: { jobId: targetJobId } });
    if (existing) return;

    // Get the job and its last execution
    const job = await this.prisma.job.findUnique({
      where: { id: targetJobId },
      include: {
        executions: { orderBy: { attemptNumber: 'desc' }, take: 1 },
        queue: true,
      },
    });
    if (!job) return;

    const lastExecution = job.executions[0];
    if (!lastExecution) return;

    // Error fingerprint — strip variable data (IDs, timestamps) for deduplication
    const fingerprint = this.computeFingerprint(errorMessage);

    // Check fingerprint cache — reuse summary for same error type
    const cachedFingerprint = await this.redis.get(`ai_fingerprint:${fingerprint}`);
    if (cachedFingerprint) {
      const cached = JSON.parse(cachedFingerprint);
      await this.storeSummary(targetJobId, lastExecution.id, cached, this.model, fingerprint, false);
      this.logger.debug(`AI summary from fingerprint cache for job ${targetJobId}`);
      return;
    }

    // Try Gemini API
    let summary: AiSummaryResult;
    let modelUsed = this.model;

    try {
      summary = await this.callGemini(job, lastExecution, errorMessage);
    } catch (err) {
      this.logger.warn(`Gemini API failed: ${err.message} — falling back to heuristics`);
      summary = this.heuristicFallback(errorMessage);
      modelUsed = 'heuristic';
    }

    // Cache fingerprint for 1 hour
    await this.redis.set(`ai_fingerprint:${fingerprint}`, JSON.stringify(summary), 3600);

    await this.storeSummary(targetJobId, lastExecution.id, summary, modelUsed, fingerprint, true);
    this.logger.log(`AI summary generated for job ${targetJobId} (model=${modelUsed})`);
  }

  // ===========================
  // GEMINI API CALL
  // ===========================
  private async callGemini(job: any, execution: any, errorMessage: string): Promise<AiSummaryResult> {
    if (!this.apiKey) throw new Error('GEMINI_API_KEY not configured');

    // Frequency signal: how often has this error occurred?
    const frequency = await this.prisma.jobExecution.count({
      where: {
        job: { queueId: job.queueId },
        errorMessage: { contains: errorMessage.slice(0, 100) },
        startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    // Build privacy-preserving prompt (no payload data)
    const prompt = `You are a distributed systems debugging assistant. Analyze this job failure.

Job Type: ${job.type}
Queue: ${job.queue.name}
Attempt: ${execution.attemptNumber}/${job.maxAttempts || 3}
Error (last ${Math.min(errorMessage.length, 2000)} chars):
${errorMessage.slice(-2000)}

Error frequency: ${frequency} occurrences in the last 24 hours across this queue.

Respond ONLY with valid JSON matching this exact schema:
{
  "rootCauseSummary": "string (2-3 sentence technical explanation)",
  "category": "Timeout|ValidationError|DependencyFailure|ResourceExhaustion|CodeDefect|Unknown",
  "confidenceLevel": "low|medium|high",
  "suggestedFix": "string (specific actionable recommendation)"
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: 500,
          },
        }),
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty Gemini response');

    return JSON.parse(text);
  }

  // ===========================
  // HEURISTIC FALLBACK
  // ===========================
  private heuristicFallback(errorMessage: string): AiSummaryResult {
    const msg = errorMessage.toLowerCase();

    if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('connection timed out')) {
      return {
        rootCauseSummary: 'The job exceeded its time limit. A downstream service or database query did not respond within the expected window.',
        category: 'Timeout',
        confidenceLevel: 'medium',
        suggestedFix: 'Increase the timeout configuration for this job type, or optimize the slow downstream call. Consider circuit-breaking if the dependency is frequently unavailable.',
      };
    }

    if (msg.includes('econnrefused') || msg.includes('connection refused') || msg.includes('enotfound')) {
      return {
        rootCauseSummary: 'The job could not establish a connection to a required service. The target host is either down or unreachable from this network.',
        category: 'DependencyFailure',
        confidenceLevel: 'high',
        suggestedFix: 'Verify that the target service is running and accessible. Check network policies and DNS resolution. Consider implementing a health check before the job runs.',
      };
    }

    if (msg.includes('validation') || msg.includes('invalid') || msg.includes('required') || msg.includes('missing field')) {
      return {
        rootCauseSummary: 'The job payload or a response from a downstream service failed schema/type validation. Required fields may be missing or incorrectly formatted.',
        category: 'ValidationError',
        confidenceLevel: 'medium',
        suggestedFix: 'Review the job payload schema and the response format of any external APIs called. Add input validation at job submission time.',
      };
    }

    if (msg.includes('memory') || msg.includes('heap') || msg.includes('oom') || msg.includes('quota')) {
      return {
        rootCauseSummary: 'The job was terminated due to resource exhaustion — likely memory pressure or an external API quota limit.',
        category: 'ResourceExhaustion',
        confidenceLevel: 'medium',
        suggestedFix: 'Break the job into smaller chunks, implement backpressure, or request higher resource limits. If quota-related, implement rate limiting on the job queue.',
      };
    }

    return {
      rootCauseSummary: 'An unexpected runtime error occurred. This may be a transient infrastructure issue or a code defect. The error did not match any known failure patterns.',
      category: 'Unknown',
      confidenceLevel: 'low',
      suggestedFix: 'Review the full error stack trace in the execution logs. If this error recurs consistently, it is likely a code defect; if intermittent, treat it as a transient failure and ensure idempotent handling.',
    };
  }

  // ===========================
  // STORE SUMMARY
  // ===========================
  private async storeSummary(
    jobId: string,
    executionId: string,
    summary: AiSummaryResult,
    modelUsed: string,
    fingerprint: string,
    fromApi: boolean,
  ): Promise<void> {
    const confidenceMap: Record<string, any> = { low: 'Low', medium: 'Medium', high: 'High' };
    const categoryMap: Record<string, any> = {
      Timeout: 'Timeout', ValidationError: 'ValidationError', DependencyFailure: 'DependencyFailure',
      ResourceExhaustion: 'ResourceExhaustion', CodeDefect: 'CodeDefect', Unknown: 'Unknown',
    };

    await this.prisma.jobAiSummary.upsert({
      where: { jobId },
      create: {
        jobId,
        executionId,
        summaryText: summary.rootCauseSummary,
        category: categoryMap[summary.category] || 'Unknown',
        confidence: confidenceMap[summary.confidenceLevel] || 'Low',
        suggestedFix: summary.suggestedFix,
        modelUsed,
        errorFingerprint: fingerprint,
        rawResponse: summary as any,
      },
      update: {
        summaryText: summary.rootCauseSummary,
        category: categoryMap[summary.category] || 'Unknown',
        confidence: confidenceMap[summary.confidenceLevel] || 'Low',
        suggestedFix: summary.suggestedFix,
        modelUsed,
        rawResponse: summary as any,
      },
    });
  }

  // ===========================
  // FINGERPRINT (strip variable data)
  // ===========================
  private computeFingerprint(errorMessage: string): string {
    // Normalize: strip hex IDs, numbers, timestamps, file paths
    const normalized = errorMessage
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP')
      .replace(/\b\d+\b/g, 'N')
      .replace(/\s+at\s+.+:\d+:\d+/g, ' at LOCATION')
      .toLowerCase()
      .slice(0, 500);

    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }

  // ===========================
  // REGENERATE (manual trigger)
  // ===========================
  async regenerateSummary(jobId: string): Promise<void> {
    // Delete cached summary and fingerprint
    const existing = await this.prisma.jobAiSummary.findFirst({ where: { jobId } });
    if (existing) {
      await this.redis.del(`ai_fingerprint:${existing.errorFingerprint}`);
      await this.prisma.jobAiSummary.delete({ where: { jobId } });
    }

    // Get job failure context and re-run
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { executions: { orderBy: { attemptNumber: 'desc' }, take: 1 } },
    });
    if (!job || !job.failureReason) return;

    await this.processSummaryJob({
      targetJobId: jobId,
      executionId: job.executions[0]?.id,
      errorMessage: job.failureReason,
    });
  }
}
