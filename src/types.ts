import { Type } from "@google/genai";

export type Player = 'white' | 'black';

export interface BoardState {
  points: number[]; // Positive for white, negative for black. Index 0-23.
  bar: { white: number; black: number };
  off: { white: number; black: number };
}

export interface GameState {
  board: BoardState;
  currentPlayer: Player;
  dice: number[];
  remainingMoves: number[];
  status: 'playing' | 'won' | 'rolling';
  winner?: Player;
  history: string[];
  scores: { white: number; black: number };
  analysis?: string;
}

export const INITIAL_BOARD: BoardState = {
  // Standard Backgammon setup
  // Points 0-23 (1-24 in traditional notation)
  // White moves 0 -> 23
  // Black moves 23 -> 0
  points: [
    2, 0, 0, 0, 0, -5,  // 0-5
    0, -3, 0, 0, 0, 5,   // 6-11
    -5, 0, 0, 0, 3, 0,   // 12-17
    5, 0, 0, 0, 0, -2    // 18-23
  ],
  bar: { white: 0, black: 0 },
  off: { white: 0, black: 0 }
};

export interface Move {
  from: number | 'bar';
  to: number | 'off';
  die: number;
}

export const AI_MOVE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    moveIndices: {
      type: Type.ARRAY,
      items: { type: Type.INTEGER },
      description: "The indices of the chosen moves from the provided legal moves list."
    },
    reasoning: {
      type: Type.STRING,
      description: "Brief explanation of the strategic choice."
    }
  },
  required: ["moveIndices", "reasoning"]
};
