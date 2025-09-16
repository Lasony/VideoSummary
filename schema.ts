import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const videos = pgTable("videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  originalUrl: text("original_url"),
  fileName: text("file_name"),
  duration: integer("duration"), // in seconds
  thumbnailUrl: text("thumbnail_url"),
  status: text("status").notNull().default("uploading"), // uploading, processing, completed, failed
  createdAt: timestamp("created_at").defaultNow(),
});

export const summaries = pgTable("summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: varchar("video_id").references(() => videos.id).notNull(),
  content: text("content").notNull(),
  style: text("style").notNull(), // informative, entertaining, educational
  targetDuration: integer("target_duration").notNull(), // in seconds
  voiceId: text("voice_id").notNull(),
  speechSpeed: text("speech_speed").notNull().default("1.0"),
  audioUrl: text("audio_url"),
  finalVideoUrl: text("final_video_url"),
  isEdited: boolean("is_edited").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const processingJobs = pgTable("processing_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoId: varchar("video_id").references(() => videos.id).notNull(),
  status: text("status").notNull(), // pending, processing, completed, failed
  progress: integer("progress").default(0), // 0-100
  currentStep: text("current_step"), // analyzing, summarizing, generating_audio, creating_video
  error: text("error"),
  result: jsonb("result"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas
export const insertVideoSchema = createInsertSchema(videos).omit({
  id: true,
  createdAt: true,
});

export const insertSummarySchema = createInsertSchema(summaries).omit({
  id: true,
  createdAt: true,
  audioUrl: true,
  finalVideoUrl: true,
});

export const insertProcessingJobSchema = createInsertSchema(processingJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type Video = typeof videos.$inferSelect;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Summary = typeof summaries.$inferSelect;
export type InsertSummary = z.infer<typeof insertSummarySchema>;
export type ProcessingJob = typeof processingJobs.$inferSelect;
export type InsertProcessingJob = z.infer<typeof insertProcessingJobSchema>;

// API request schemas
export const urlInputSchema = z.object({
  url: z.string().url(),
  style: z.enum(["informative", "entertaining", "educational"]),
  targetDuration: z.enum(["30", "60", "90"]),
  voiceId: z.string(),
  speechSpeed: z.enum(["0.9", "1.0", "1.1"]),
});

export const summaryUpdateSchema = z.object({
  content: z.string().min(1),
});

export type UrlInputRequest = z.infer<typeof urlInputSchema>;
export type SummaryUpdateRequest = z.infer<typeof summaryUpdateSchema>;
