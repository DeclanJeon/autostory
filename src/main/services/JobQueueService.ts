import Store from "electron-store";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";

export type JobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";
export type JobType = "PUBLISH_RSS" | "PUBLISH_MATERIAL";

export interface Job {
  id: string;
  type: JobType;
  data: any; // RSS Link or Material ID
  status: JobStatus;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

interface JobQueueSchema {
  queue: Job[];
}

const jobStore = new Store<JobQueueSchema>({
  name: "job-queue",
  defaults: { queue: [] },
});

/**
 * 작업 큐 관리 서비스 (Persistent Queue)
 */
export class JobQueueService {
  private static instance: JobQueueService;

  private constructor() {}

  public static getInstance(): JobQueueService {
    if (!JobQueueService.instance) {
      JobQueueService.instance = new JobQueueService();
    }
    return JobQueueService.instance;
  }

  /**
   * 새 작업 추가
   */
  public addJob(type: JobType, data: any): Job {
    const jobs = jobStore.get("queue");
    const newJob: Job = {
      id: uuidv4(),
      type,
      data,
      status: "PENDING",
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    jobStore.set("queue", [...jobs, newJob]);
    logger.info(`Job added to queue: ${newJob.id} (${type})`);
    return newJob;
  }

  /**
   * 처리 대기 중인 다음 작업 가져오기 (FIFO)
   */
  public getNextJob(): Job | undefined {
    const jobs = jobStore.get("queue");
    return jobs
      .filter((j) => j.status === "PENDING")
      .sort((a, b) => a.createdAt - b.createdAt)[0];
  }

  /**
   * 작업 상태 업데이트
   */
  public updateJobStatus(id: string, status: JobStatus, error?: string): void {
    const jobs = jobStore.get("queue");
    const index = jobs.findIndex((j) => j.id === id);

    if (index !== -1) {
      jobs[index].status = status;
      jobs[index].updatedAt = Date.now();
      if (error) {
        jobs[index].error = error;
      }

      // 실패 시 재시도 카운트 증가
      if (status === "FAILED") {
        jobs[index].retryCount += 1;
      }

      jobStore.set("queue", jobs);
      logger.info(`Job ${id} status updated to ${status}`);
    }
  }

  /**
   * 모든 작업 조회
   */
  public getAllJobs(): Job[] {
    return jobStore.get("queue");
  }

  /**
   * 특정 상태의 작업만 조회
   */
  public getJobsByStatus(status: JobStatus): Job[] {
    const jobs = jobStore.get("queue");
    return jobs.filter((j) => j.status === status);
  }

  /**
   * 특정 작업 조회
   */
  public getJobById(id: string): Job | undefined {
    const jobs = jobStore.get("queue");
    return jobs.find((j) => j.id === id);
  }

  /**
   * 완료되거나 실패한지 오래된 작업 정리
   */
  public cleanupStaleJobs(retentionMs: number = 86400000): void {
    // 24시간
    const jobs = jobStore.get("queue");
    const now = Date.now();

    const activeJobs = jobs.filter((job) => {
      const isOld = now - job.updatedAt > retentionMs;
      const isDone = job.status === "COMPLETED" || job.status === "FAILED";
      return !(isDone && isOld);
    });

    if (activeJobs.length !== jobs.length) {
      jobStore.set("queue", activeJobs);
      logger.info(`Cleaned up ${jobs.length - activeJobs.length} stale jobs.`);
    }
  }

  /**
   * 멈춰있는 작업(PROCESSING 상태로 앱이 꺼진 경우) 초기화
   */
  public resetStuckJobs(): void {
    const jobs = jobStore.get("queue");
    let hasChanges = false;

    jobs.forEach((job) => {
      if (job.status === "PROCESSING") {
        job.status = "PENDING"; // 다시 대기 상태로
        job.updatedAt = Date.now();
        hasChanges = true;
        logger.warn(`Reset stuck job: ${job.id}`);
      }
    });

    if (hasChanges) {
      jobStore.set("queue", jobs);
    }
  }

  /**
   * 특정 작업 삭제
   */
  public deleteJob(id: string): void {
    const jobs = jobStore.get("queue");
    const filtered = jobs.filter((j) => j.id !== id);
    if (filtered.length !== jobs.length) {
      jobStore.set("queue", filtered);
      logger.info(`Deleted job: ${id}`);
    }
  }

  /**
   * 모든 작업 삭제 (큐 초기화)
   */
  public clearAllJobs(): void {
    jobStore.set("queue", []);
    logger.info("Cleared all jobs from queue");
  }

  /**
   * 대기 중인 작업 개수
   */
  public getPendingCount(): number {
    return this.getJobsByStatus("PENDING").length;
  }

  /**
   * 처리 중인 작업 개수
   */
  public getProcessingCount(): number {
    return this.getJobsByStatus("PROCESSING").length;
  }

  /**
   * 완료된 작업 개수
   */
  public getCompletedCount(): number {
    return this.getJobsByStatus("COMPLETED").length;
  }

  /**
   * 실패한 작업 개수
   */
  public getFailedCount(): number {
    return this.getJobsByStatus("FAILED").length;
  }
}

export const jobQueue = JobQueueService.getInstance();
