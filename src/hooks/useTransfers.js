import { useCallback, useEffect, useState, useRef } from 'react';
import { appLog } from '../utils/logger';

const api = window.televault?.vault;

export function useTransfers({ enabled = true } = {}) {
  const [tasks, setTasks] = useState([]);
  const prevTasksRef = useRef([]);

  const refresh = useCallback(async () => {
    if (!enabled || !api?.getTransfers) return;
    const result = await api.getTransfers();
    if (result.ok) {
      const filteredTasks = (result.tasks || []).filter((t) => t.metadata?.source !== 'gdrive');
      setTasks(filteredTasks);
    }
  }, [enabled]);

  useEffect(() => {
    if (!tasks || tasks.length === 0) {
      prevTasksRef.current = [];
      return;
    }

    tasks.forEach((task) => {
      const prev = prevTasksRef.current.find((t) => t.id === task.id);
      if (prev && prev.status !== task.status) {
        if (task.status === 'done') {
          appLog('success', `Thành công: ${task.label}`);
        } else if (task.status === 'failed') {
          appLog('error', `Lỗi: ${task.label} - ${task.error || 'Unknown error'}`);
        }
      }
    });

    prevTasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    if (!enabled || !api?.getTransfers) return undefined;
    const unsub = api.onTransfersChanged?.(() => {
      void refresh();
    });
    void refresh();
    return unsub;
  }, [enabled, refresh]);

  const cancel = useCallback(async (taskId) => {
    await api?.cancelTransfer(taskId);
    await refresh();
  }, [refresh]);

  const retry = useCallback(async (taskId) => {
    await api?.retryTransfer(taskId);
    await refresh();
  }, [refresh]);

  const resume = useCallback(async (taskId) => {
    await api?.resumeTransfer(taskId);
    await refresh();
  }, [refresh]);

  const clearFinished = useCallback(async () => {
    await api?.clearFinishedTransfers();
    await refresh();
  }, [refresh]);

  const activeCount = tasks.filter((t) => t.status === 'queued' || t.status === 'running').length;

  return { tasks, activeCount, refresh, cancel, retry, resume, clearFinished };
}
