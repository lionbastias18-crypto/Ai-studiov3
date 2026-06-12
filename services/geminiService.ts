
import { GoogleGenAI, Type } from "@google/genai";
import { GeminiSuggestion } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getBuildingSuggestion = async (biome: string, availableBlocks: string[]): Promise<GeminiSuggestion | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Suggest a creative Minecraft Infdev structure to build in a ${biome} biome using blocks like ${availableBlocks.join(', ')}.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            steps: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["title", "description", "steps"]
        }
      }
    });

    const text = response.text;
    if (!text) return null;
    return JSON.parse(text) as GeminiSuggestion;
  } catch (error) {
    console.error("Gemini suggestion error:", error);
    return null;
  }
};
