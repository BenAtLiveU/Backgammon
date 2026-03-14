import { GoogleGenAI } from "@google/genai";
import { BoardState, Player, Move, AI_MOVE_SCHEMA } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function getBestMove(
  board: BoardState,
  player: Player,
  dice: number[],
  legalSequences: Move[][]
): Promise<number> {
  if (legalSequences.length === 0) return -1;
  if (legalSequences.length === 1) return 0;

  const prompt = `
    You are a Backgammon Grandmaster. Analyze the current board state and choose the best sequence of moves for ${player}.
    
    Board State:
    - Points (0-23): ${JSON.stringify(board.points)}
    - Bar: ${JSON.stringify(board.bar)}
    - Off: ${JSON.stringify(board.off)}
    
    Dice: ${JSON.stringify(dice)}
    
    Legal Move Sequences (Indices):
    ${legalSequences.map((seq, i) => `${i}: ${seq.map(m => `${m.from}->${m.to}`).join(', ')}`).join('\n')}
    
    Strategy Tips:
    1. Prioritize making points (anchors) in your home board or the opponent's home board.
    2. Avoid leaving blots (single checkers) that can be hit.
    3. Hit the opponent if it significantly sets them back.
    4. If bearing off, maximize checkers off.
    
    Return the index of the best move sequence.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: AI_MOVE_SCHEMA as any,
      },
    });

    const result = JSON.parse(response.text || "{}");
    const chosenIndex = result.moveIndices?.[0] ?? 0;
    
    // Ensure the index is valid
    if (chosenIndex >= 0 && chosenIndex < legalSequences.length) {
      return chosenIndex;
    }
    return 0;
  } catch (error) {
    console.error("AI Move Error:", error);
    return 0; // Fallback to first legal move
  }
}
