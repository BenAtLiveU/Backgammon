import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Dices, RotateCcw, Trophy, Brain, User, ChevronRight, History } from 'lucide-react';
import { BoardState, Player, GameState, INITIAL_BOARD, Move } from '../types';
import { getLegalMoves, applyMove } from '../gameLogic';
import { getBestMove, getGameAnalysis } from '../aiService';

const Backgammon = () => {
  const [game, setGame] = useState<GameState>({
    board: INITIAL_BOARD,
    currentPlayer: 'white',
    dice: [],
    remainingMoves: [],
    status: 'rolling',
    history: [],
    scores: { white: 0, black: 0 }
  });

  const [historyStack, setHistoryStack] = useState<GameState[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<number | 'bar' | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const checkerSize = "w-2.5 h-2.5 xs:w-3.5 xs:h-3.5 sm:w-5 sm:h-5";

  // Helper to get all possible move sequences
  const getAllMoveSequences = useCallback((board: BoardState, player: Player, dice: number[]): Move[][] => {
    const sequences: Move[][] = [];

    function findSequences(currentBoard: BoardState, currentDice: number[], currentPath: Move[]) {
      const legalMoves = getLegalMoves(currentBoard, player, currentDice);
      
      if (legalMoves.length === 0 || currentDice.length === 0) {
        if (currentPath.length > 0) {
          sequences.push([...currentPath]);
        }
        return;
      }

      // To avoid massive branching, we only explore unique moves for the first die
      const uniqueMoves = legalMoves.filter((v, i, a) => a.findIndex(t => t.from === v.from && t.to === v.to) === i);

      for (const move of uniqueMoves) {
        const nextBoard = applyMove(currentBoard, player, move);
        const nextDice = [...currentDice];
        const dieIndex = nextDice.indexOf(move.die);
        if (dieIndex > -1) nextDice.splice(dieIndex, 1);
        
        findSequences(nextBoard, nextDice, [...currentPath, move]);
      }
    }

    findSequences(board, dice, []);

    // Filter for longest sequences (Backgammon rule: must use as many dice as possible)
    const maxLength = Math.max(...sequences.map(s => s.length), 0);
    return sequences.filter(s => s.length === maxLength);
  }, []);

  const rollDice = async () => {
    if (game.status !== 'rolling' || isRolling) return;
    
    setIsRolling(true);
    // Visual delay for rolling effect
    await new Promise(resolve => setTimeout(resolve, 600));

    const array = new Uint32Array(2);
    window.crypto.getRandomValues(array);
    const d1 = (array[0] % 6) + 1;
    const d2 = (array[1] % 6) + 1;
    const dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    
    const legalMoves = getLegalMoves(game.board, game.currentPlayer, dice);
    
    setIsRolling(false);
    if (legalMoves.length === 0) {
      // No legal moves, skip turn
      const logEntry = `${game.currentPlayer === 'white' ? 'Ben' : 'Meredith'} rolled ${dice.join(',')} - No legal moves`;
      setGame(prev => ({
        ...prev,
        dice,
        remainingMoves: [],
        status: 'playing',
        history: [...prev.history, logEntry]
      }));
      
      setTimeout(() => {
        setGame(prev => ({
          ...prev,
          currentPlayer: prev.currentPlayer === 'white' ? 'black' : 'white',
          status: 'rolling'
        }));
      }, 1500);
    } else {
      setGame(prev => ({
        ...prev,
        dice,
        remainingMoves: [...dice],
        status: 'playing'
      }));
    }
  };

  const handlePointClick = (index: number | 'bar') => {
    if (game.status !== 'playing' || game.currentPlayer !== 'white') return;

    // If already selected, try to move
    if (selectedPoint !== null) {
      const legalMoves = getLegalMoves(game.board, game.currentPlayer, game.remainingMoves);
      const move = legalMoves.find(m => m.from === selectedPoint && m.to === index);
      
      if (move) {
        executeMove(move);
        setSelectedPoint(null);
        return;
      }
      
      // If clicking another of own pieces, select that instead
      if (typeof index === 'number') {
        const count = game.board.points[index];
        if (count > 0) {
          setSelectedPoint(index);
          return;
        }
      }
      setSelectedPoint(null);
    } else {
      // Select piece
      if (index === 'bar') {
        if (game.board.bar.white > 0) setSelectedPoint('bar');
      } else {
        const count = game.board.points[index];
        if (count > 0) setSelectedPoint(index);
      }
    }
  };

  const handleOffClick = () => {
    if (game.status !== 'playing' || game.currentPlayer !== 'white' || selectedPoint === null) return;
    
    const legalMoves = getLegalMoves(game.board, game.currentPlayer, game.remainingMoves);
    const move = legalMoves.find(m => m.from === selectedPoint && m.to === 'off');
    
    if (move) {
      executeMove(move);
      setSelectedPoint(null);
    }
  };

  const executeMove = (move: Move) => {
    setHistoryStack(prev => [...prev, { ...game }]);
    const nextBoard = applyMove(game.board, game.currentPlayer, move);
    const nextRemaining = [...game.remainingMoves];
    const dieIndex = nextRemaining.indexOf(move.die);
    if (dieIndex > -1) nextRemaining.splice(dieIndex, 1);

    const logEntry = `${game.currentPlayer === 'white' ? 'Ben' : 'Meredith'} moved ${move.from === 'bar' ? 'Bar' : move.from + 1} to ${move.to === 'off' ? 'Off' : move.to + 1}`;

    // Check for win
    if (nextBoard.off[game.currentPlayer] === 15) {
      const winner = game.currentPlayer;
      const nextScores = { ...game.scores, [winner]: game.scores[winner] + 1 };
      
      setGame(prev => ({
        ...prev,
        board: nextBoard,
        status: 'won',
        winner,
        scores: nextScores,
        history: [...prev.history, logEntry, `${winner === 'white' ? 'Ben' : 'Meredith'} wins!`]
      }));

      // Trigger analysis
      getGameAnalysis([...game.history, logEntry, `${winner === 'white' ? 'Ben' : 'Meredith'} wins!`]).then(analysis => {
        setGame(prev => ({ ...prev, analysis }));
      });
      return;
    }

    const nextLegal = getLegalMoves(nextBoard, game.currentPlayer, nextRemaining);
    
    if (nextRemaining.length === 0 || nextLegal.length === 0) {
      setGame(prev => ({
        ...prev,
        board: nextBoard,
        remainingMoves: [],
        currentPlayer: prev.currentPlayer === 'white' ? 'black' : 'white',
        status: 'rolling',
        history: [...prev.history, logEntry]
      }));
    } else {
      setGame(prev => ({
        ...prev,
        board: nextBoard,
        remainingMoves: nextRemaining,
        history: [...prev.history, logEntry]
      }));
    }
  };

  const undoMove = () => {
    if (historyStack.length === 0) return;
    const lastState = historyStack[historyStack.length - 1];
    setGame(lastState);
    setHistoryStack(prev => prev.slice(0, -1));
  };

  // AI Turn
  useEffect(() => {
    if (game.status === 'rolling' && game.currentPlayer === 'black') {
      const timer = setTimeout(() => rollDice(), 1000);
      return () => clearTimeout(timer);
    }

    if (game.status === 'playing' && game.currentPlayer === 'black' && !isAiThinking) {
      const runAi = async () => {
        setIsAiThinking(true);
        const sequences = getAllMoveSequences(game.board, 'black', game.remainingMoves);
        
        if (sequences.length === 0) {
          setGame(prev => ({
            ...prev,
            currentPlayer: 'white',
            status: 'rolling',
            remainingMoves: []
          }));
          setIsAiThinking(false);
          return;
        }

        const bestIdx = await getBestMove(game.board, 'black', game.remainingMoves, sequences);
        const chosenSequence = sequences[bestIdx];

        // Execute sequence with delays for visual effect
        for (const move of chosenSequence) {
          await new Promise(r => setTimeout(r, 800));
          setGame(prev => {
            const nextBoard = applyMove(prev.board, 'black', move);
            const nextRemaining = [...prev.remainingMoves];
            const dIdx = nextRemaining.indexOf(move.die);
            if (dIdx > -1) nextRemaining.splice(dIdx, 1);
            
            if (nextBoard.off.black === 15) {
              return { ...prev, board: nextBoard, status: 'won', winner: 'black' };
            }
            
            return { ...prev, board: nextBoard, remainingMoves: nextRemaining };
          });
        }

        await new Promise(r => setTimeout(r, 500));
        setGame(prev => ({
          ...prev,
          currentPlayer: 'white',
          status: 'rolling',
          remainingMoves: []
        }));
        setIsAiThinking(false);
      };
      runAi();
    }
  }, [game.status, game.currentPlayer, game.remainingMoves, isAiThinking]);

  const resetGame = () => {
    setGame(prev => ({
      board: INITIAL_BOARD,
      currentPlayer: 'white',
      dice: [],
      remainingMoves: [],
      status: 'rolling',
      history: [],
      scores: prev.scores
    }));
    setSelectedPoint(null);
    setHistoryStack([]);
  };

  const calculatePipCount = (board: BoardState, player: Player) => {
    let count = 0;
    if (player === 'white') {
      count += board.bar.white * 25;
      board.points.forEach((val, i) => {
        if (val > 0) count += val * (24 - i);
      });
    } else {
      count += board.bar.black * 25;
      board.points.forEach((val, i) => {
        if (val < 0) count += Math.abs(val) * (i + 1);
      });
    }
    return count;
  };

  const renderPoint = (index: number) => {
    const count = game.board.points[index];
    const absCount = Math.abs(count);
    const color = count > 0 ? 'white' : 'black';
    const isTop = index >= 12;
    const isSelected = selectedPoint === index;
    
    // Calculate if this point is a valid destination for selected piece
    let isValidDest = false;
    if (selectedPoint !== null && game.currentPlayer === 'white') {
      const legalMoves = getLegalMoves(game.board, 'white', game.remainingMoves);
      isValidDest = legalMoves.some(m => m.from === selectedPoint && m.to === index);
    }

    return (
      <div 
        key={index}
        onClick={() => handlePointClick(index)}
        className={`relative flex flex-col items-center w-full h-full cursor-pointer transition-colors
          ${index % 2 === 0 ? 'bg-stone-800/40' : 'bg-stone-900/40'}
          ${isValidDest ? 'ring-2 ring-emerald-500/50 bg-emerald-500/10' : ''}
          ${isSelected ? 'bg-white/10' : ''}
        `}
      >
        {/* Triangle graphic */}
        <div 
          className={`absolute inset-x-0 ${isTop ? 'top-0' : 'bottom-0'} h-3/4 opacity-20`}
          style={{
            clipPath: isTop ? 'polygon(0% 0%, 100% 0%, 50% 100%)' : 'polygon(50% 0%, 0% 100%, 100% 100%)',
            backgroundColor: index % 2 === 0 ? '#4a3728' : '#e2d5a4'
          }}
        />
        
        {/* Checkers */}
        <div className={`flex ${isTop ? 'flex-col' : 'flex-col-reverse'} items-center justify-start w-full h-full z-10 pt-1 pb-1`}>
          {Array.from({ length: Math.min(absCount, 6) }).map((_, i) => (
            <motion.div
              layoutId={`checker-${index}-${i}`}
              key={i}
              className={`${checkerSize} rounded-full border shadow-md -mb-1 sm:-mb-2 relative
                ${color === 'white' 
                  ? 'bg-stone-100 border-stone-300' 
                  : 'bg-stone-950 border-stone-800'}
              `}
            >
              <div className={`absolute inset-0.5 rounded-full border opacity-10 ${color === 'white' ? 'border-stone-400' : 'border-stone-600'}`} />
              <div className={`absolute inset-0 rounded-full bg-gradient-to-br from-white/10 to-black/20`} />
            </motion.div>
          ))}
          {absCount > 6 && (
            <span className={`text-[8px] sm:text-[10px] font-bold text-stone-400 ${isTop ? 'mt-1' : 'mb-1'}`}>+{absCount - 6}</span>
          )}
        </div>

        {/* Index label - Hidden on mobile landscape to save space */}
        <span className={`absolute ${isTop ? 'top-1' : 'bottom-1'} text-[8px] text-stone-600 font-mono opacity-50 hidden sm:block`}>
          {index + 1}
        </span>
      </div>
    );
  };

  return (
    <div className="h-screen wood-texture text-stone-200 font-sans selection:bg-emerald-500/30 overflow-hidden flex safe-left safe-right">
      {/* Main Game Area */}
      <div className="flex-1 relative flex items-center justify-center p-1 sm:p-2">
        {/* The Board */}
        <div className="relative w-full max-w-full aspect-[1.5/1] board-texture rounded-sm border-[8px] sm:border-[12px] border-[#5d3a1a] shadow-2xl flex overflow-hidden">
          {/* Left Board */}
          <div className="flex-1 grid grid-rows-2 border-r-4 border-[#5d3a1a]">
            <div className="grid grid-cols-6 h-full">
              {[12, 13, 14, 15, 16, 17].map(renderPoint)}
            </div>
            <div className="grid grid-cols-6 h-full">
              {[11, 10, 9, 8, 7, 6].map(renderPoint)}
            </div>
          </div>

          {/* Bar */}
          <div className="w-4 sm:w-8 bg-[#5d3a1a] flex flex-col items-center justify-between py-4">
            <div 
              onClick={() => handlePointClick('bar')}
              className={`flex flex-col items-center gap-0.5 cursor-pointer ${selectedPoint === 'bar' ? 'ring-2 ring-white rounded' : ''}`}
            >
              {Array.from({ length: game.board.bar.white }).map((_, i) => (
                <div key={i} className="w-2.5 h-2.5 sm:w-5 sm:h-5 rounded-full bg-stone-100 border border-stone-300 shadow-md relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-black/20" />
                </div>
              ))}
            </div>
            <div className="flex flex-col-reverse items-center gap-0.5">
              {Array.from({ length: game.board.bar.black }).map((_, i) => (
                <div key={i} className="w-2.5 h-2.5 sm:w-5 sm:h-5 rounded-full bg-stone-950 border border-stone-800 shadow-md relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-black/20" />
                </div>
              ))}
            </div>
          </div>

          {/* Right Board */}
          <div className="flex-1 grid grid-rows-2 relative">
            <div className="grid grid-cols-6 h-full">
              {[18, 19, 20, 21, 22, 23].map(renderPoint)}
            </div>
            <div className="grid grid-cols-6 h-full">
              {[5, 4, 3, 2, 1, 0].map(renderPoint)}
            </div>

            {/* Roll Button Overlay */}
            {game.status === 'rolling' && game.currentPlayer === 'white' && (
              <div className="absolute inset-0 flex items-center justify-center z-50">
                <button
                  onClick={rollDice}
                  disabled={isRolling}
                  className="px-6 py-3 bg-red-700 hover:bg-red-600 text-white font-bold rounded-md shadow-xl border-2 border-red-900 active:scale-95 transition-all"
                >
                  {isRolling ? '...' : 'ROLL'}
                </button>
              </div>
            )}

            {/* Dice Display */}
            {game.dice.length > 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none gap-4">
                {game.dice.map((d, i) => (
                  <motion.div
                    initial={{ scale: 0, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    key={i}
                    className={`w-8 h-8 sm:w-12 sm:h-12 rounded-md bg-white text-stone-900 flex items-center justify-center text-xl sm:text-2xl font-bold shadow-2xl border-2 border-stone-200
                      ${!game.remainingMoves.includes(d) ? 'opacity-40' : ''}
                    `}
                  >
                    {d}
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Bearing Off Area (Hidden/Integrated like the image) */}
          <div className="w-4 sm:w-8 bg-[#5d3a1a] flex flex-col justify-between py-4">
            <div className="flex flex-col items-center gap-0.5">
              {Array.from({ length: game.board.off.black }).map((_, i) => (
                <div key={i} className="w-3 sm:w-6 h-1 bg-stone-950 border border-stone-800 rounded-sm" />
              ))}
            </div>
            <div 
              onClick={handleOffClick}
              className={`flex flex-col-reverse items-center gap-0.5 cursor-pointer
                ${game.currentPlayer === 'white' && selectedPoint !== null ? 'bg-white/20 rounded' : ''}
              `}
            >
              {Array.from({ length: game.board.off.white }).map((_, i) => (
                <div key={i} className="w-3 sm:w-6 h-1 bg-stone-100 border border-stone-300 rounded-sm" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Side Panel */}
      <aside className="w-48 bg-[#5d3a1a] border-l-4 border-[#3d2314] flex flex-col p-1.5 shadow-2xl z-50">
        {/* Meredith (AI) */}
        <div className="bg-[#3d2314]/50 p-2 rounded-lg border border-white/10 mb-1.5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-stone-950 border-2 border-stone-800 flex items-center justify-center shadow-inner">
              <div className="w-4 h-4 rounded-full bg-stone-900" />
            </div>
            <div>
              <h2 className="text-amber-200 font-bold text-sm leading-tight">Meredith</h2>
              <p className="text-amber-200/60 text-[9px] font-mono">Score: {game.scores.black}</p>
            </div>
          </div>
          <div className="text-amber-200/80 text-[10px] font-mono">
            Pips: {calculatePipCount(game.board, 'black')}
          </div>
        </div>

        {/* Game Controls */}
        <div className="flex-1 flex flex-col gap-2 my-2">
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={undoMove}
              disabled={historyStack.length === 0 || game.status === 'won'}
              className="py-2 bg-red-700 hover:bg-red-600 disabled:bg-stone-800 disabled:text-stone-500 text-white text-xs font-bold rounded-md shadow-lg border-b-2 border-red-900 active:border-b-0 active:translate-y-0.5 transition-all"
            >
              UNDO
            </button>
            <button 
              onClick={resetGame}
              className="py-2 bg-red-700 hover:bg-red-600 text-white text-xs font-bold rounded-md shadow-lg border-b-2 border-red-900 active:border-b-0 active:translate-y-0.5 transition-all"
            >
              MENU
            </button>
          </div>

          {/* Match Log */}
          <div className="flex-1 bg-[#3d2314]/80 rounded-lg border border-white/5 p-2 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 mb-1 text-amber-200/40">
              <History size={12} />
              <span className="text-[9px] font-bold uppercase tracking-widest">Match Log</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {game.history.map((entry, i) => (
                <div key={i} className="text-[9px] font-mono text-amber-200/70 border-b border-white/5 pb-1">
                  {entry}
                </div>
              ))}
              {game.analysis && (
                <div className="mt-2 p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] text-emerald-300 italic">
                  <div className="font-bold mb-0.5 uppercase tracking-tighter not-italic">Grandmaster Analysis:</div>
                  {game.analysis}
                </div>
              )}
              {isAiThinking && <div className="text-amber-400 animate-pulse text-[9px] font-mono">Meredith is thinking...</div>}
            </div>
          </div>
        </div>

        {/* Ben (User) */}
        <div className="bg-[#3d2314]/50 p-2 rounded-lg border border-white/10">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-stone-100 border-2 border-stone-300 flex items-center justify-center shadow-lg">
              <div className="w-5 h-5 rounded-full bg-white ring-1 ring-stone-200" />
            </div>
            <div>
              <h2 className="text-amber-200 font-bold text-sm leading-tight">Ben</h2>
              <p className="text-amber-200/60 text-[9px] font-mono">Score: {game.scores.white}</p>
            </div>
          </div>
          <div className="text-amber-200/80 text-[10px] font-mono">
            Pips: {calculatePipCount(game.board, 'white')}
          </div>
        </div>
      </aside>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(251, 191, 36, 0.1);
          border-radius: 10px;
        }
      `}} />
    </div>
  );
};

export default Backgammon;
