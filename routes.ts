import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import { storage } from "./storage";
import { urlInputSchema, summaryUpdateSchema } from "@shared/schema";
import { 
  downloadYouTubeVideo, 
  extractAudioFromFile, 
  getVideoMetadata,
  createVideoWithAudio,
  cleanupTempFiles 
} from "./services/videoProcessor";
import { 
  analyzeVideoContent, 
  generateSummary, 
  generateSpeech, 
  transcribeAudio 
} from "./services/openai";
import fs from "fs/promises";

// Configure multer for file uploads
const upload = multer({
  dest: "temp/uploads/",
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/avi', 'video/quicktime'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP4, AVI, and MOV files are allowed.'));
    }
  }
});

async function processVideo(videoId: string) {
  try {
    const video = await storage.getVideo(videoId);
    if (!video) throw new Error("Video not found");

    const job = await storage.createProcessingJob({
      videoId,
      status: "processing",
      progress: 0,
      currentStep: "analyzing"
    });

    // Update progress: analyzing
    await storage.updateProcessingJob(job.id, {
      progress: 10,
      currentStep: "analyzing"
    });

    // Extract or get audio
    let audioPath: string;
    let transcript: string;

    if (video.originalUrl) {
      // YouTube video
      const metadata = await downloadYouTubeVideo(video.originalUrl);
      audioPath = metadata.audioPath;
      
      await storage.updateVideo(videoId, {
        title: metadata.title,
        duration: metadata.duration,
        thumbnailUrl: metadata.thumbnail
      });
    } else if (video.fileName) {
      // Uploaded file
      const filePath = path.join(process.cwd(), "temp/uploads", video.fileName);
      const metadata = await getVideoMetadata(filePath);
      audioPath = await extractAudioFromFile(filePath);
      
      await storage.updateVideo(videoId, {
        duration: metadata.duration
      });
    } else {
      throw new Error("No video source available");
    }

    // Update progress: transcribing
    await storage.updateProcessingJob(job.id, {
      progress: 30,
      currentStep: "transcribing"
    });

    // Transcribe audio
    const audioBuffer = await fs.readFile(audioPath);
    transcript = await transcribeAudio(audioBuffer);

    // Update progress: summarizing
    await storage.updateProcessingJob(job.id, {
      progress: 50,
      currentStep: "summarizing"
    });

    // Analyze content
    const analysis = await analyzeVideoContent(transcript, video.title);

    // Get summary settings (use defaults if no summary exists yet)
    let summary = await storage.getSummaryByVideoId(videoId);
    if (!summary) {
      summary = await storage.createSummary({
        videoId,
        content: "",
        style: "informative",
        targetDuration: 60,
        voiceId: "alloy",
        speechSpeed: "1.0"
      });
    }

    // Generate summary
    const summaryResult = await generateSummary(
      transcript,
      summary.style,
      summary.targetDuration,
      analysis
    );

    // Update summary with generated content
    await storage.updateSummary(summary.id, {
      content: summaryResult.content
    });

    // Update progress: generating audio
    await storage.updateProcessingJob(job.id, {
      progress: 70,
      currentStep: "generating_audio"
    });

    // Generate speech
    const speechBuffer = await generateSpeech(
      summaryResult.content,
      summary.voiceId,
      summary.speechSpeed
    );

    // Save audio file
    const audioOutputPath = path.join(process.cwd(), "temp", `${videoId}_speech.mp3`);
    await fs.writeFile(audioOutputPath, speechBuffer);

    // Update progress: creating video
    await storage.updateProcessingJob(job.id, {
      progress: 90,
      currentStep: "creating_video"
    });

    // Create final video (simplified - would need more complex video editing)
    // For now, just mark as completed
    await storage.updateSummary(summary.id, {
      audioUrl: audioOutputPath,
      finalVideoUrl: audioOutputPath // Placeholder
    });

    // Complete processing
    await storage.updateProcessingJob(job.id, {
      status: "completed",
      progress: 100,
      currentStep: "completed",
      result: {
        summaryId: summary.id,
        audioUrl: audioOutputPath
      }
    });

    await storage.updateVideo(videoId, {
      status: "completed"
    });

    // Cleanup temp files
    setTimeout(() => {
      cleanupTempFiles([audioPath, audioOutputPath]);
    }, 24 * 60 * 60 * 1000); // Cleanup after 24 hours

  } catch (error) {
    console.error("Processing failed:", error);
    
    const job = await storage.getProcessingJobByVideoId(videoId);
    if (job) {
      await storage.updateProcessingJob(job.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }

    await storage.updateVideo(videoId, {
      status: "failed"
    });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Process YouTube URL
  app.post("/api/videos/youtube", async (req, res) => {
    try {
      const data = urlInputSchema.parse(req.body);
      
      const video = await storage.createVideo({
        title: "Processing...",
        originalUrl: data.url,
        fileName: null,
        duration: null,
        thumbnailUrl: null,
        status: "processing"
      });

      const summary = await storage.createSummary({
        videoId: video.id,
        content: "",
        style: data.style,
        targetDuration: parseInt(data.targetDuration),
        voiceId: data.voiceId,
        speechSpeed: data.speechSpeed
      });

      // Start processing in background
      processVideo(video.id);

      res.json({ videoId: video.id, summaryId: summary.id });
    } catch (error) {
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Invalid request data" 
      });
    }
  });

  // Upload video file
  app.post("/api/videos/upload", upload.single('video'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No video file provided" });
      }

      const { style = "informative", targetDuration = "60", voiceId = "alloy", speechSpeed = "1.0" } = req.body;

      const video = await storage.createVideo({
        title: req.file.originalname,
        originalUrl: null,
        fileName: req.file.filename,
        duration: null,
        thumbnailUrl: null,
        status: "processing"
      });

      const summary = await storage.createSummary({
        videoId: video.id,
        content: "",
        style,
        targetDuration: parseInt(targetDuration),
        voiceId,
        speechSpeed
      });

      // Start processing in background
      processVideo(video.id);

      res.json({ videoId: video.id, summaryId: summary.id });
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Upload failed" 
      });
    }
  });

  // Get video status
  app.get("/api/videos/:id", async (req, res) => {
    try {
      const video = await storage.getVideo(req.params.id);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }

      const summary = await storage.getSummaryByVideoId(video.id);
      const job = await storage.getProcessingJobByVideoId(video.id);

      res.json({
        video,
        summary,
        processing: job
      });
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to get video" 
      });
    }
  });

  // Update summary
  app.patch("/api/summaries/:id", async (req, res) => {
    try {
      const data = summaryUpdateSchema.parse(req.body);
      
      const summary = await storage.updateSummary(req.params.id, {
        content: data.content,
        isEdited: true
      });

      res.json(summary);
    } catch (error) {
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Invalid request data" 
      });
    }
  });

  // Regenerate audio with updated summary
  app.post("/api/summaries/:id/regenerate-audio", async (req, res) => {
    try {
      const summary = await storage.getSummary(req.params.id);
      if (!summary) {
        return res.status(404).json({ message: "Summary not found" });
      }

      // Generate new speech
      const speechBuffer = await generateSpeech(
        summary.content,
        summary.voiceId,
        summary.speechSpeed
      );

      // Save new audio file
      const audioOutputPath = path.join(process.cwd(), "temp", `${summary.videoId}_speech_updated.mp3`);
      await fs.writeFile(audioOutputPath, speechBuffer);

      // Update summary
      const updatedSummary = await storage.updateSummary(summary.id, {
        audioUrl: audioOutputPath
      });

      res.json(updatedSummary);
    } catch (error) {
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to regenerate audio" 
      });
    }
  });

  // Get available voices
  app.get("/api/voices", (req, res) => {
    res.json([
      { id: "alloy", name: "Alloy", language: "en" },
      { id: "echo", name: "Echo", language: "en" },
      { id: "fable", name: "Fable", language: "en" },
      { id: "onyx", name: "Onyx", language: "en" },
      { id: "nova", name: "Nova", language: "en" },
      { id: "shimmer", name: "Shimmer", language: "en" }
    ]);
  });

  const httpServer = createServer(app);
  return httpServer;
}
