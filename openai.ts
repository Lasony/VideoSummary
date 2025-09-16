import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || ""
});

export interface VideoAnalysisResult {
  title: string;
  keyPoints: string[];
  topics: string[];
  sentiment: string;
  duration: number;
}

export interface SummaryResult {
  content: string;
  keyHighlights: string[];
  callToAction: string;
}

export async function analyzeVideoContent(transcript: string, videoTitle: string): Promise<VideoAnalysisResult> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are an expert video content analyzer. Analyze the video transcript and provide structured insights. 
                   Respond with JSON in this format: {
                     "title": "enhanced_title",
                     "keyPoints": ["point1", "point2", ...],
                     "topics": ["topic1", "topic2", ...],
                     "sentiment": "positive|neutral|negative",
                     "duration": estimated_original_duration_in_seconds
                   }`
        },
        {
          role: "user",
          content: `Video Title: ${videoTitle}\n\nTranscript:\n${transcript}`
        }
      ],
      response_format: { type: "json_object" },
    });

    return JSON.parse(response.choices[0].message.content || "{}");
  } catch (error) {
    throw new Error(`Failed to analyze video content: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function generateSummary(
  transcript: string,
  style: string,
  targetDuration: number,
  analysis: VideoAnalysisResult
): Promise<SummaryResult> {
  try {
    const stylePrompts = {
      informative: "Create a clear, factual summary focusing on key information and main points.",
      entertaining: "Create an engaging, fun summary with personality and hooks to maintain viewer attention.",
      educational: "Create a structured, learning-focused summary that teaches key concepts step by step."
    };

    const prompt = `Based on this video analysis and transcript, create a ${style} summary for a ${targetDuration}-second social media video.

Video Analysis: ${JSON.stringify(analysis)}
Transcript: ${transcript}

Style: ${stylePrompts[style as keyof typeof stylePrompts]}

Target Duration: ${targetDuration} seconds
Estimated words: ${Math.floor(targetDuration * 2.5)} words (aim for natural speech pace)

Respond with JSON in this format: {
  "content": "the_summary_text_optimized_for_voiceover",
  "keyHighlights": ["highlight1", "highlight2", "highlight3"],
  "callToAction": "engaging_call_to_action"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert content creator specializing in viral social media content. Create engaging summaries optimized for short-form video platforms."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    return JSON.parse(response.choices[0].message.content || "{}");
  } catch (error) {
    throw new Error(`Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function generateSpeech(text: string, voice: string, speed: string): Promise<Buffer> {
  try {
    const response = await openai.audio.speech.create({
      model: "tts-1-hd",
      voice: voice as any,
      input: text,
      speed: parseFloat(speed),
    });

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    throw new Error(`Failed to generate speech: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  try {
    const response = await openai.audio.transcriptions.create({
      file: new File([audioBuffer], "audio.mp3", { type: "audio/mpeg" }),
      model: "whisper-1",
    });

    return response.text;
  } catch (error) {
    throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
