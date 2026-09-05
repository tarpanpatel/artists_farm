import React, { useState, useEffect, useCallback } from 'react';
import { Clock, RefreshCw, CheckCircle2, XCircle, AlertCircle, FileText, ChevronDown, ChevronUp, Server } from './icons/FlowbiteIcons';
import { ToggleSwitch } from './ToggleSwitch';
import { Button } from './Button';
import { useToast } from './ToastContext';
import { formatDateTimeDDMMYYYY } from '../utils/dateUtils';
import { CronJob, fetchCronJobsDB, updateCronJobDB, runCronJobNowDB, fetchCronJobLogDB } from '../services/api';

/**
 * Root Admin > Cron Jobs. Added 25 Aug 2026, directly prompted by
 * discovering (while diagnosing an unrelated production outage) that this
 * app's real server crontab had only ONE job registered - several other
 * cron scripts existed in the codebase, fully working, but nothing had ever
 * invoked them, for days, completely silently.
 *
 * This page never touches the OS crontab. It edits the `cron_jobs` DB table
 * (see php/cron/cron_jobs.php) that php/cron/dispatcher.php - the one and
 * only real crontab entry this app should ever need - reads before deciding
 * what to run. Toggling a job here, or changing its schedule, takes effect
 * on the dispatcher's very next tick (within 5 minutes), with zero server
 * access required ever again.
 */

const DEFAULT_JOB_DESCRIPTIONS: Record<string, string> = {};

const formatSchedule = (job: CronJob): string => {
  if (job.scheduleType === 'interval_minutes') {
    const mins = job.intervalMinutes ?? 60;
    return mins % 60 === 0 && mins >= 60 ? `Every ${mins / 60}h` : `Every ${mins} min`;
  }
  const time = (job.dailyAtTime || '00:00:00').slice(0, 5);
  return `Daily at ${time}`;
};

const StatusBadge: React.FC<{ status: string | null }> = ({ status }) => {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
        Never run
      </span>
    );
  }
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
        <CheckCircle2 className="w-3.5 h-3.5" /> Success
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-800">
      <XCircle className="w-3.5 h-3.5" /> Error
    </span>
  );
};

const JobRow: React.FC<{ job: CronJob; onChanged: () => void }> = ({ job, onChanged }) => {
  const { showToast } = useToast();
  const [scheduleType, setScheduleType] = useState(job.scheduleType);
  const [intervalMinutes, setIntervalMinutes] = useState<number>(job.intervalMinutes ?? 60);
  const [dailyAtTime, setDailyAtTime] = useState((job.dailyAtTime || '09:00:00').slice(0, 5));
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [running, setRunning] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logText, setLogText] = useState<string | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);

  const scheduleDirty = scheduleType !== job.scheduleType
    || (scheduleType === 'interval_minutes' && intervalMinutes !== (job.intervalMinutes ?? 60))
    || (scheduleType === 'daily_at' && dailyAtTime !== (job.dailyAtTime || '09:00:00').slice(0, 5));

  const handleToggleEnabled = async (enabled: boolean) => {
    setTogglingEnabled(true);
    const ok = await updateCronJobDB(job.jobKey, { enabled });
    setTogglingEnabled(false);
    if (ok) {
      showToast(`${job.name} ${enabled ? 'enabled' : 'disabled'}`, { type: 'success' });
      onChanged();
    } else {
      showToast('Failed to update job', { type: 'error' });
    }
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    const ok = await updateCronJobDB(job.jobKey, {
      scheduleType,
      intervalMinutes: scheduleType === 'interval_minutes' ? intervalMinutes : null,
      dailyAtTime: scheduleType === 'daily_at' ? `${dailyAtTime}:00` : null,
    });
    setSavingSchedule(false);
    if (ok) {
      showToast('Schedule updated', { type: 'success' });
      onChanged();
    } else {
      showToast('Failed to update schedule', { type: 'error' });
    }
  };

  const handleRunNow = async () => {
    setRunning(true);
    const result = await runCronJobNowDB(job.jobKey);
    setRunning(false);
    if (result) {
      showToast(
        result.status === 'success' ? `${job.name} ran successfully (${result.durationMs}ms)` : `${job.name} failed: ${result.message}`,
        { type: result.status === 'success' ? 'success' : 'error' }
      );
      onChanged();
      if (logOpen) {
        loadLog();
      }
    } else {
      showToast('Failed to trigger job', { type: 'error' });
    }
  };

  const loadLog = useCallback(async () => {
    setLoadingLog(true);
    const log = await fetchCronJobLogDB(job.jobKey);
    setLogText(log || '(log is empty)');
    setLoadingLog(false);
  }, [job.jobKey]);

  const handleToggleLog = () => {
    const next = !logOpen;
    setLogOpen(next);
    if (next && logText === null) {
      loadLog();
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-800">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm text-gray-900 dark:text-white">{job.name}</h4>
            <StatusBadge status={job.lastRunStatus} />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{job.description || DEFAULT_JOB_DESCRIPTIONS[job.jobKey] || ''}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
            <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {formatSchedule(job)}</span>
            <span>
              Last run: {job.lastRunAt ? formatDateTimeDDMMYYYY(job.lastRunAt) : 'never'}
              {job.lastRunDurationMs !== null && job.lastRunStatus ? ` (${job.lastRunDurationMs}ms)` : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ToggleSwitch enabled={job.enabled} onChange={handleToggleEnabled} disabled={togglingEnabled} />
          <span className={`text-xs font-bold ${job.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
            {job.enabled ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>

      {job.lastRunMessage && job.lastRunStatus === 'error' && (
        <div className="mt-3 flex items-start gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-2.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span className="break-words">{job.lastRunMessage}</span>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">Schedule</label>
          <select
            value={scheduleType}
            onChange={(e) => setScheduleType(e.target.value as 'interval_minutes' | 'daily_at')}
            className="bg-slate-50 dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 text-xs rounded-lg p-2 outline-none focus:border-blue-500 font-semibold"
          >
            <option value="interval_minutes">Every N minutes</option>
            <option value="daily_at">Daily at a time</option>
          </select>
        </div>

        {scheduleType === 'interval_minutes' ? (
          <div>
            <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">Minutes</label>
            <input
              type="number"
              min={5}
              step={5}
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Math.max(5, Number(e.target.value) || 5))}
              className="w-24 bg-slate-50 dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 text-xs rounded-lg p-2 outline-none focus:border-blue-500 font-semibold"
            />
          </div>
        ) : (
          <div>
            <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1">Time of day</label>
            <input
              type="time"
              value={dailyAtTime}
              onChange={(e) => setDailyAtTime(e.target.value)}
              className="bg-slate-50 dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 text-xs rounded-lg p-2 outline-none focus:border-blue-500 font-semibold"
            />
          </div>
        )}

        {scheduleDirty && (
          <Button variant="primary" size="xs" onClick={handleSaveSchedule} disabled={savingSchedule}>
            {savingSchedule ? 'Saving...' : 'Save Schedule'}
          </Button>
        )}

        <div className="flex-1" />

        <Button
          variant="secondary"
          size="xs"
          leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />}
          onClick={handleRunNow}
          disabled={running}
        >
          {running ? 'Running...' : 'Run Now'}
        </Button>

        <Button
          variant="tertiary"
          size="xs"
          leftIcon={<FileText className="w-3.5 h-3.5" />}
          rightIcon={logOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          onClick={handleToggleLog}
        >
          Log
        </Button>
      </div>

      {logOpen && (
        <div className="mt-3 bg-gray-900 dark:bg-black rounded-lg p-3 overflow-x-auto">
          {loadingLog ? (
            <p className="text-xs text-gray-400">Loading...</p>
          ) : (
            <pre className="text-[11px] text-gray-200 whitespace-pre-wrap break-words font-mono">{logText}</pre>
          )}
        </div>
      )}
    </div>
  );
};

export const CronJobsManager: React.FC = () => {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);

  const loadJobs = useCallback(async () => {
    const data = await fetchCronJobsDB();
    setJobs(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-start gap-3">
        <div className="p-2.5 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-xl">
          <Server className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Cron Jobs</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Toggle jobs on/off and change their schedule without server access. Everything here runs through a
            single dispatcher that checks in every 5 minutes - changes take effect on its next tick.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
        </div>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No cron jobs registered.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobRow key={job.jobKey} job={job} onChanged={loadJobs} />
          ))}
        </div>
      )}
    </div>
  );
};
