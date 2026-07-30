// useDreamForge — the one place the website talks to the Dream Forge.
//
// Both create surfaces (the mobile-web CreateScreen and DesktopCreateWorkspace) used to carry their
// own copy of the launch/poll logic, and the two had drifted: only desktop captured draftId/title
// and checked auth, only mobile tracked numeric progress, neither could retry, and neither survived
// a reload. This holds all of it once.
//
// Job state is persisted, so a refresh mid-build reattaches to the running job instead of orphaning
// it — a build can take 15-25 minutes and the old behaviour left no way back to it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ai } from '../services/api';
import {
  normalizeOrientation,
  DEFAULT_ORIENTATION,
  type Orientation,
} from '../constants/orientation';

export type ForgeStatus = 'idle' | 'building' | 'ready' | 'error';

export type ForgeResult = {
  draftId: string | null;
  title: string;
  previewHtml: string | null;
  gameUrl: string | null;
  orientation: Orientation;
};

export type ForgeQueue = {
  position?: number;
  ahead?: number;
  total?: number;
  running?: number;
  concurrency?: number;
};

export type ForgeLaunch = {
  prompt: string;
  attachments?: any[];
  orientation: Orientation;
};

/**
 * Steps shown to the creator, mapped to the phases the worker actually emits.
 *
 * The previous map was wrong in both directions: it omitted 'upload' (which sits at 90%, the
 * longest single stretch) so the last step never lit up from real data, and it listed
 * 'foundation' / 'assets' / 'repair' / 'save', none of which the backend ever sends.
 */
export const FORGE_STEPS: Array<{ label: string; phases: string[] }> = [
  { label: 'Design', phases: ['queued', 'pending', 'maker_workspace', 'spec'] },
  { label: 'Build', phases: ['build', 'build_continuing', 'build_truncated'] },
  { label: 'Test', phases: ['verify'] },
  { label: 'Publish', phases: ['upload', 'complete'] },
];

export function forgeStepFor(phase: string, progress: number): number {
  const byPhase = FORGE_STEPS.findIndex((step) => step.phases.includes(phase));
  if (byPhase >= 0) return byPhase;
  // Fallback for a phase we don't know yet, so the UI still advances.
  if (progress >= 88) return 3;
  if (progress >= 70) return 2;
  if (progress >= 25) return 1;
  return 0;
}

/** Humanised phase label, for when the backend sends no status message. */
export function forgePhaseLabel(phase: string): string {
  switch (phase) {
    case 'queued':
    case 'pending':
      return 'Waiting for a free forge worker';
    case 'maker_workspace':
      return 'Setting up the workspace';
    case 'spec':
      return 'Designing the game';
    case 'build':
    case 'build_continuing':
      return 'Writing the game code';
    case 'build_truncated':
      return 'Finishing a long build';
    case 'verify':
      return 'Testing that it actually plays';
    case 'upload':
      return 'Uploading your game';
    case 'complete':
      return 'Done';
    default:
      return phase.replace(/_/g, ' ');
  }
}

/**
 * The backend reports these when a job dies in a way a retry can fix. Matching on them lets us
 * offer a retry button instead of showing the raw sentence as a dead end.
 */
function isRetryable(message: string): boolean {
  return /stalled|forge worker|lost during save|please retry/i.test(message);
}

const PENDING_JOB_KEY = 'gametok-web-pending-forge-job';

type PendingJob = {
  jobId: string;
  prompt: string;
  orientation: Orientation;
  startedAt: number;
};

/** Jobs older than this are assumed dead rather than resumed into a hang. */
const PENDING_JOB_TTL_MS = 60 * 60 * 1000;

function readPendingJob(): PendingJob | null {
  try {
    const raw = localStorage.getItem(PENDING_JOB_KEY);
    if (!raw) return null;
    const job = JSON.parse(raw) as PendingJob;
    if (!job?.jobId) return null;
    if (Date.now() - (job.startedAt || 0) > PENDING_JOB_TTL_MS) {
      localStorage.removeItem(PENDING_JOB_KEY);
      return null;
    }
    return job;
  } catch {
    return null;
  }
}

function writePendingJob(job: PendingJob | null) {
  try {
    if (job) localStorage.setItem(PENDING_JOB_KEY, JSON.stringify(job));
    else localStorage.removeItem(PENDING_JOB_KEY);
  } catch {
    /* private mode — the build still runs, it just won't survive a reload */
  }
}

export function useDreamForge() {
  const [status, setStatus] = useState<ForgeStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('queued');
  const [message, setMessage] = useState('');
  const [queue, setQueue] = useState<ForgeQueue>({});
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [result, setResult] = useState<ForgeResult | null>(null);
  /** True while reattaching to a job that was already running before this page load. */
  const [resuming, setResuming] = useState(false);

  const cancelRef = useRef<null | { cancel: () => void; cancelRemote?: () => void }>(null);
  const jobIdRef = useRef<string | null>(null);
  const launchRef = useRef<ForgeLaunch | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const applyProgress = useCallback((update: any) => {
    if (!aliveRef.current) return;
    if (typeof update.progress === 'number') {
      // Server progress is monotonic; never let a late poll drag the bar backwards.
      setProgress((prev) => Math.max(prev, update.progress));
    }
    if (update.phase) setPhase(update.phase);
    if (update.statusMessage) setMessage(update.statusMessage);
    else if (update.phase) setMessage(forgePhaseLabel(update.phase));
    setQueue((prev) => ({
      position: update.queuePosition ?? prev.position,
      ahead: update.queuedAhead ?? prev.ahead,
      total: update.queuedTotal ?? prev.total,
      running: update.runningTotal ?? prev.running,
      concurrency: update.workerConcurrency ?? prev.concurrency,
    }));
  }, []);

  const settleComplete = useCallback((payload: any, orientation: Orientation) => {
    if (!aliveRef.current) return;
    writePendingJob(null);
    jobIdRef.current = null;
    cancelRef.current = null;
    setResuming(false);
    if (payload?.htmlPreview) {
      setProgress(100);
      setPhase('complete');
      setMessage('Preview ready.');
      setResult({
        draftId: payload.draftId || null,
        title: payload.title || 'Untitled Dream',
        previewHtml: payload.htmlPreview,
        gameUrl: payload.gameUrl || null,
        orientation: normalizeOrientation(payload.orientation || orientation),
      });
      setStatus('ready');
      return;
    }
    const msg = payload?.error || 'Generation finished without a playable preview.';
    setError(msg);
    setRetryable(isRetryable(msg));
    setStatus('error');
  }, []);

  const settleError = useCallback((err: any) => {
    if (!aliveRef.current) return;
    const msg = err?.message || String(err) || 'Generation failed.';
    // A user-initiated cancel isn't a failure worth shouting about.
    if (/aborted|cancel/i.test(msg)) {
      writePendingJob(null);
      jobIdRef.current = null;
      cancelRef.current = null;
      setResuming(false);
      setStatus('idle');
      setProgress(0);
      setError(null);
      setRetryable(false);
      return;
    }
    writePendingJob(null);
    jobIdRef.current = null;
    cancelRef.current = null;
    setResuming(false);
    setError(msg);
    setRetryable(isRetryable(msg));
    setStatus('error');
  }, []);

  const beginBuildingState = useCallback(() => {
    setStatus('building');
    setProgress(4);
    setPhase('queued');
    setMessage('Connecting to Dream Forge…');
    setQueue({});
    setError(null);
    setRetryable(false);
    setResult(null);
  }, []);

  const start = useCallback(
    (launch: ForgeLaunch) => {
      const prompt = launch.prompt.trim();
      if (!prompt) return;
      const orientation = normalizeOrientation(launch.orientation);
      launchRef.current = { ...launch, prompt, orientation };
      beginBuildingState();

      const call = ai.dream(prompt, launch.attachments || [], {
        orientation,
        onJobStarted: (jobId: string) => {
          jobIdRef.current = jobId;
          writePendingJob({ jobId, prompt, orientation, startedAt: Date.now() });
          if (!aliveRef.current) return;
          setProgress((value) => Math.max(value, 8));
          setMessage('Forge agent online — reading your game idea…');
        },
        onJobProgress: applyProgress,
      });

      cancelRef.current = call;
      call.promise.then((payload: any) => settleComplete(payload, orientation)).catch(settleError);
    },
    [applyProgress, beginBuildingState, settleComplete, settleError],
  );

  /** Reattach to a job that was already running (page reload, or a returning tab). */
  const resume = useCallback(
    (job: PendingJob) => {
      jobIdRef.current = job.jobId;
      launchRef.current = { prompt: job.prompt, orientation: job.orientation };
      setResuming(true);
      setStatus('building');
      setProgress(4);
      setPhase('queued');
      setMessage('Reconnecting to your build…');
      setError(null);
      setRetryable(false);
      setResult(null);

      const call = ai.resumeDreamJob(job.jobId, { onJobProgress: applyProgress });
      cancelRef.current = { cancel: call.cancel };
      call.promise
        .then((payload: any) => settleComplete(payload, job.orientation))
        .catch((err: any) => {
          // A job we can no longer reattach to isn't the creator's problem to
          // decode — don't surface the backend's raw complaint (it can be a
          // Postgres uuid parse error for a stale id).
          const raw = err?.message || '';
          if (/aborted|cancel/i.test(raw)) {
            settleError(err);
            return;
          }
          settleError(new Error('That build is no longer available. Start a new one.'));
        });
    },
    [applyProgress, settleComplete, settleError],
  );

  // Reattach on mount if a build was left running.
  useEffect(() => {
    const pending = readPendingJob();
    if (pending) resume(pending);
    // Deliberately mount-only: resuming again on every render would spawn pollers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = useCallback(() => {
    const handle = cancelRef.current;
    // cancelRemote also tells the backend to stop, so the worker isn't left burning
    // on a job nobody is waiting for.
    if (handle?.cancelRemote) handle.cancelRemote();
    else handle?.cancel?.();
    writePendingJob(null);
    jobIdRef.current = null;
    cancelRef.current = null;
    setResuming(false);
    setStatus('idle');
    setProgress(0);
    setMessage('');
    setError(null);
    setRetryable(false);
  }, []);

  const retry = useCallback(() => {
    const launch = launchRef.current;
    const jobId = jobIdRef.current;
    if (!launch) return;
    // Prefer the backend's retry, which rebuilds the dead job in the same shape.
    if (jobId) {
      void ai.retryDreamJob(jobId, launch.orientation).catch(() => {});
    }
    start(launch);
  }, [start]);

  const reset = useCallback(() => {
    writePendingJob(null);
    jobIdRef.current = null;
    cancelRef.current = null;
    launchRef.current = null;
    setResuming(false);
    setStatus('idle');
    setProgress(0);
    setPhase('queued');
    setMessage('');
    setQueue({});
    setError(null);
    setRetryable(false);
    setResult(null);
  }, []);

  const activeStep = forgeStepFor(phase, progress);
  const orientation = launchRef.current?.orientation || result?.orientation || DEFAULT_ORIENTATION;

  return {
    status,
    progress,
    phase,
    message,
    queue,
    error,
    retryable,
    result,
    resuming,
    activeStep,
    orientation,
    start,
    cancel,
    retry,
    reset,
  };
}
