import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

let socket: Socket | null = null;

export function useWebSocket(projectId?: string | null) {
  const queryClient = useQueryClient();
  const reconnectAttempt = useRef(0);

  const getToken = () => localStorage.getItem('tf_access_token');

  const connect = useCallback(() => {
    const token = getToken();
    if (!token || socket?.connected) return;

    socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'], // polling fallback auto-enabled
      reconnection: true,
      reconnectionDelay: Math.min(1000 * Math.pow(2, reconnectAttempt.current), 30000),
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      reconnectAttempt.current = 0;
      if (projectId) socket!.emit('join_project', { projectId });
    });

    socket.on('disconnect', () => {
      reconnectAttempt.current++;
    });

    // Job events → invalidate TanStack Query cache
    const jobEvents = ['job.created', 'job.claimed', 'job.started', 'job.completed', 'job.failed', 'job.dead_lettered'];
    jobEvents.forEach((event) => {
      socket!.on(event, (data) => {
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        queryClient.invalidateQueries({ queryKey: ['job', data.jobId] });
        if (data.queueId) queryClient.invalidateQueries({ queryKey: ['queue-stats', data.queueId] });
      });
    });

    // Queue stats
    socket!.on('queue.stats_updated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['queue-stats', data.queueId] });
      queryClient.invalidateQueries({ queryKey: ['queues'] });
    });

    // Worker events
    const workerEvents = ['worker.online', 'worker.offline'];
    workerEvents.forEach((event) => {
      socket!.on(event, () => {
        queryClient.invalidateQueries({ queryKey: ['workers'] });
      });
    });

    // Workflow events
    socket!.on('workflow.run_updated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-run', data.workflowRunId] });
    });
  }, [projectId, queryClient]);

  useEffect(() => {
    connect();
    return () => {
      if (projectId && socket?.connected) {
        socket.emit('leave_project', { projectId });
      }
    };
  }, [connect, projectId]);

  const emit = (event: string, data: object) => socket?.emit(event, data);
  const isConnected = () => socket?.connected ?? false;

  return { emit, isConnected };
}
