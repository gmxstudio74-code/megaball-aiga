import { GoogleGenAI } from "@google/genai";

async function generateLevel3Asset() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const prompt = `Subject: Rectangular wall of Arkanoid bricks. 
Central Element: A large Atari "Fuji" logo integrated directly into the brick pattern. The logo should be formed by the bricks themselves or be a large overlay across the center. 
Composition: Frontal orthographic view, no perspective, no paddle, no ball, no UI elements. 
Style: Clean 2D vector style or high-definition pixel art. 
Background: Solid black or deep space with minimal stars. 
Exclude: no paddle, no score, no text besides ATARI, no glare, no 3D cabinet.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: {
        parts: [
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "1K"
        }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const base64Data = part.inlineData.data;
        console.log("IMAGE_GENERATED:" + base64Data);
      }
    }
  } catch (error) {
    console.error("Error generating image:", error);
  }
}

generateLevel3Asset();
