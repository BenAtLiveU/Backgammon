import { BoardState, Player, Move } from './types';

export function getLegalMoves(board: BoardState, player: Player, dice: number[]): Move[] {
  if (dice.length === 0) return [];

  const moves: Move[] = [];
  const uniqueDice = Array.from(new Set(dice));

  for (const die of uniqueDice) {
    // 1. Check Bar
    if (player === 'white' && board.bar.white > 0) {
      const to = die - 1;
      if (canMoveTo(board, player, to)) {
        moves.push({ from: 'bar', to, die });
      }
      continue; // If on bar, must move from bar, but can try other dice
    }
    if (player === 'black' && board.bar.black > 0) {
      const to = 24 - die;
      if (canMoveTo(board, player, to)) {
        moves.push({ from: 'bar', to, die });
      }
      continue;
    }

    // 2. Check Points
    const isBearingOff = canBearOff(board, player);

    for (let i = 0; i < 24; i++) {
      const count = board.points[i];
      if ((player === 'white' && count > 0) || (player === 'black' && count < 0)) {
        const to = player === 'white' ? i + die : i - die;
        
        if (to >= 0 && to <= 23) {
          if (canMoveTo(board, player, to)) {
            moves.push({ from: i, to, die });
          }
        } else if (isBearingOff) {
          if (player === 'white' && to >= 24) {
            if (to === 24 || (to > 24 && isFurthestChecker(board, player, i))) {
              moves.push({ from: i, to: 'off', die });
            }
          } else if (player === 'black' && to < 0) {
            if (to === -1 || (to < -1 && isFurthestChecker(board, player, i))) {
              moves.push({ from: i, to: 'off', die });
            }
          }
        }
      }
    }
  }

  // If on bar, we must only return bar moves
  if (player === 'white' && board.bar.white > 0) {
    return moves.filter(m => m.from === 'bar');
  }
  if (player === 'black' && board.bar.black > 0) {
    return moves.filter(m => m.from === 'bar');
  }

  return moves;
}

function canMoveTo(board: BoardState, player: Player, to: number): boolean {
  const targetCount = board.points[to];
  if (player === 'white') {
    return targetCount >= -1; // Empty, white, or one black (blot)
  } else {
    return targetCount <= 1; // Empty, black, or one white (blot)
  }
}

function canBearOff(board: BoardState, player: Player): boolean {
  if (player === 'white') {
    if (board.bar.white > 0) return false;
    for (let i = 0; i < 18; i++) {
      if (board.points[i] > 0) return false;
    }
  } else {
    if (board.bar.black > 0) return false;
    for (let i = 6; i < 24; i++) {
      if (board.points[i] < 0) return false;
    }
  }
  return true;
}

function isFurthestChecker(board: BoardState, player: Player, index: number): boolean {
  if (player === 'white') {
    for (let i = 18; i < index; i++) {
      if (board.points[i] > 0) return false;
    }
  } else {
    for (let i = 5; i > index; i--) {
      if (board.points[i] < 0) return false;
    }
  }
  return true;
}

export function applyMove(board: BoardState, player: Player, move: Move): BoardState {
  const newBoard = {
    points: [...board.points],
    bar: { ...board.bar },
    off: { ...board.off }
  };

  // Remove from source
  if (move.from === 'bar') {
    if (player === 'white') newBoard.bar.white--;
    else newBoard.bar.black--;
  } else {
    newBoard.points[move.from] += (player === 'white' ? -1 : 1);
  }

  // Add to destination
  if (move.to === 'off') {
    if (player === 'white') newBoard.off.white++;
    else newBoard.off.black++;
  } else {
    const targetCount = newBoard.points[move.to];
    // Check for hit
    if (player === 'white' && targetCount === -1) {
      newBoard.points[move.to] = 1;
      newBoard.bar.black++;
    } else if (player === 'black' && targetCount === 1) {
      newBoard.points[move.to] = -1;
      newBoard.bar.white++;
    } else {
      newBoard.points[move.to] += (player === 'white' ? 1 : -1);
    }
  }

  return newBoard;
}
