import { 
  type Video, 
  type InsertVideo, 
  type Summary, 
  type InsertSummary,
  type ProcessingJob,
  type InsertProcessingJob 
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Video operations
  createVideo(video: InsertVideo): Promise<Video>;
  getVideo(id: string): Promise<Video | undefined>;
  updateVideo(id: string, updates: Partial<Video>): Promise<Video>;
  
  // Summary operations
  createSummary(summary: InsertSummary): Promise<Summary>;
  getSummary(id: string): Promise<Summary | undefined>;
  getSummaryByVideoId(videoId: string): Promise<Summary | undefined>;
  updateSummary(id: string, updates: Partial<Summary>): Promise<Summary>;
  
  // Processing job operations
  createProcessingJob(job: InsertProcessingJob): Promise<ProcessingJob>;
  getProcessingJob(id: string): Promise<ProcessingJob | undefined>;
  getProcessingJobByVideoId(videoId: string): Promise<ProcessingJob | undefined>;
  updateProcessingJob(id: string, updates: Partial<ProcessingJob>): Promise<ProcessingJob>;
}

export class MemStorage implements IStorage {
  private videos: Map<string, Video> = new Map();
  private summaries: Map<string, Summary> = new Map();
  private processingJobs: Map<string, ProcessingJob> = new Map();

  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const id = randomUUID();
    const video: Video = {
      ...insertVideo,
      id,
      duration: insertVideo.duration ?? null,
      status: insertVideo.status || "uploading",
      originalUrl: insertVideo.originalUrl ?? null,
      fileName: insertVideo.fileName ?? null,
      thumbnailUrl: insertVideo.thumbnailUrl ?? null,
      createdAt: new Date(),
    };
    this.videos.set(id, video);
    return video;
  }

  async getVideo(id: string): Promise<Video | undefined> {
    return this.videos.get(id);
  }

  async updateVideo(id: string, updates: Partial<Video>): Promise<Video> {
    const video = this.videos.get(id);
    if (!video) {
      throw new Error("Video not found");
    }
    const updatedVideo = { ...video, ...updates };
    this.videos.set(id, updatedVideo);
    return updatedVideo;
  }

  async createSummary(insertSummary: InsertSummary): Promise<Summary> {
    const id = randomUUID();
    const summary: Summary = {
      ...insertSummary,
      id,
      speechSpeed: insertSummary.speechSpeed || "1.0",
      audioUrl: null,
      finalVideoUrl: null,
      isEdited: false,
      createdAt: new Date(),
    };
    this.summaries.set(id, summary);
    return summary;
  }

  async getSummary(id: string): Promise<Summary | undefined> {
    return this.summaries.get(id);
  }

  async getSummaryByVideoId(videoId: string): Promise<Summary | undefined> {
    return Array.from(this.summaries.values()).find(
      summary => summary.videoId === videoId
    );
  }

  async updateSummary(id: string, updates: Partial<Summary>): Promise<Summary> {
    const summary = this.summaries.get(id);
    if (!summary) {
      throw new Error("Summary not found");
    }
    const updatedSummary = { ...summary, ...updates };
    this.summaries.set(id, updatedSummary);
    return updatedSummary;
  }

  async createProcessingJob(insertJob: InsertProcessingJob): Promise<ProcessingJob> {
    const id = randomUUID();
    const job: ProcessingJob = {
      ...insertJob,
      id,
      progress: insertJob.progress ?? null,
      result: insertJob.result ?? null,
      error: insertJob.error ?? null,
      currentStep: insertJob.currentStep ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.processingJobs.set(id, job);
    return job;
  }

  async getProcessingJob(id: string): Promise<ProcessingJob | undefined> {
    return this.processingJobs.get(id);
  }

  async getProcessingJobByVideoId(videoId: string): Promise<ProcessingJob | undefined> {
    return Array.from(this.processingJobs.values()).find(
      job => job.videoId === videoId
    );
  }

  async updateProcessingJob(id: string, updates: Partial<ProcessingJob>): Promise<ProcessingJob> {
    const job = this.processingJobs.get(id);
    if (!job) {
      throw new Error("Processing job not found");
    }
    const updatedJob = { ...job, ...updates, updatedAt: new Date() };
    this.processingJobs.set(id, updatedJob);
    return updatedJob;
  }
}

export const storage = new MemStorage();
