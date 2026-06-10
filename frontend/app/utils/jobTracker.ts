/**
 * Global job tracker for background TCOE report generation
 * Tracks jobs across page navigation
 */

import { getApiUrl } from '../../lib/api-config';

interface JobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at?: string;
  completed_at?: string;
  result?: any;
  error?: string;
  [key: string]: any;
}

const TCOE_JOB_PREFIX = 'tcoe_job_';
const PERSISTED_JOB_FIELDS = [
  'job_id',
  'status',
  'created_at',
  'completed_at',
  'error',
  'project_key',
  'projects',
  'metric'
] as const;

class JobTracker {
  private jobs: Map<string, JobStatus> = new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private callbacks: Map<string, (status: JobStatus) => void> = new Map();

  private getStorageKey(jobId: string) {
    return `${TCOE_JOB_PREFIX}${jobId}`;
  }

  private toPersistedStatus(status: JobStatus) {
    return PERSISTED_JOB_FIELDS.reduce((persisted, field) => {
      if (status[field] !== undefined) {
        persisted[field] = status[field];
      }
      return persisted;
    }, {} as Partial<JobStatus>);
  }

  private cleanupFinishedJobs() {
    if (typeof window === 'undefined') return;

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(TCOE_JOB_PREFIX)) continue;

      try {
        const stored = JSON.parse(localStorage.getItem(key) || '{}');
        if (stored.status === 'completed' || stored.status === 'failed') {
          keysToRemove.push(key);
        }
      } catch {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }

  private persistJobStatus(status: JobStatus) {
    if (typeof window === 'undefined') return;

    const key = this.getStorageKey(status.job_id);
    if (status.status === 'completed' || status.status === 'failed') {
      localStorage.removeItem(key);
      return;
    }

    try {
      localStorage.setItem(key, JSON.stringify(this.toPersistedStatus(status)));
    } catch (storageError) {
      this.cleanupFinishedJobs();
      try {
        localStorage.setItem(key, JSON.stringify(this.toPersistedStatus(status)));
      } catch (retryError) {
        console.warn(`Unable to persist job metadata for ${status.job_id}:`, retryError);
      }
    }
  }

  /**
   * Persist small resume metadata for a job. Full results intentionally stay out of localStorage.
   */
  trackJobMetadata(status: JobStatus) {
    this.persistJobStatus(status);
  }

  /**
   * Start tracking a background job
   */
  startJob(jobId: string, onComplete: (status: JobStatus) => void) {
    // Store callback
    this.callbacks.set(jobId, onComplete);
    
    // Load from localStorage if exists
    try {
      const stored = localStorage.getItem(this.getStorageKey(jobId));
      if (stored) {
        const jobStatus = JSON.parse(stored);
        this.jobs.set(jobId, jobStatus);
        
        // If already completed, call callback immediately
        if (jobStatus.status === 'completed' || jobStatus.status === 'failed') {
          onComplete(jobStatus);
          return;
        }
      }
    } catch (e) {
      console.error('Error loading stored job:', e);
    }
    
    // Start polling
    this.pollJobStatus(jobId);
  }

  /**
   * Poll for job status
   */
  private async pollJobStatus(jobId: string) {
    const poll = async () => {
      try {
        const response = await fetch(getApiUrl(`/api/quality/tcoe-job-status/${jobId}`));
        if (!response.ok) {
          console.error(`Failed to check job status for ${jobId}`);
          return;
        }
        
        const data = await response.json();
        if (data.success) {
          const status: JobStatus = {
            job_id: data.job_id,
            status: data.status,
            created_at: data.created_at,
            completed_at: data.completed_at,
            result: data.result,
            error: data.error
          };
          
          // Update stored status
          this.jobs.set(jobId, status);
          this.persistJobStatus(status);
          
          // Call callback
          const callback = this.callbacks.get(jobId);
          if (callback) {
            callback(status);
          }
          
          // Stop polling if completed or failed
          if (status.status === 'completed' || status.status === 'failed') {
            this.stopPolling(jobId);
            this.jobs.delete(jobId);
            this.callbacks.delete(jobId);
          }
        }
      } catch (error) {
        console.error(`Error polling job ${jobId}:`, error);
      }
    };
    
    // Poll immediately, then every 2 seconds
    poll();
    const interval = setInterval(poll, 2000);
    this.pollingIntervals.set(jobId, interval);
  }

  /**
   * Stop polling for a job
   */
  stopPolling(jobId: string) {
    const interval = this.pollingIntervals.get(jobId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(jobId);
    }
  }

  /**
   * Get current job status
   */
  getJobStatus(jobId: string): JobStatus | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Check for any pending jobs on app load
   */
  checkPendingJobs(onJobComplete: (jobId: string, status: JobStatus) => void) {
    // Check localStorage for any pending jobs
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(TCOE_JOB_PREFIX)) {
        try {
          const jobStatus = JSON.parse(localStorage.getItem(key) || '{}');
          if (jobStatus.status === 'pending' || jobStatus.status === 'processing') {
            const jobId = key.replace(TCOE_JOB_PREFIX, '');
            this.startJob(jobId, (status) => {
              onJobComplete(jobId, status);
            });
          } else if (jobStatus.status === 'completed' || jobStatus.status === 'failed') {
            localStorage.removeItem(key);
          }
        } catch (e) {
          localStorage.removeItem(key);
          console.error('Error checking pending job:', e);
        }
      }
    }
  }
}

// Singleton instance
export const jobTracker = new JobTracker();

// Check for pending jobs on module load (runs once)
if (typeof window !== 'undefined') {
  // This will be called when the module is loaded
  // The actual checking will be done by components that use it
}

