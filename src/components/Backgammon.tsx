import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Dices, RotateCcw, Trophy, Brain, User, ChevronRight, History } from 'lucide-react';
import { BoardState, Player, GameState, INITIAL_BOARD, Move } from '../types';
import { getLegalMoves, applyMove } from '../gameLogic';
import { getBestMove } from '../aiService';

const Backgammon = () => {
  const [game, setGame] = useState<GameState>({
    board: INITIAL_BOARD,
    currentPlayer: 'white',
    dice: [],
    remainingMoves: [],
    status: 'rolling',
    history: []
  });

  const [selectedPoint, setSelectedPoint] = useState<number | 'bar' | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const checkerSize = "w-4 h-4 xs:w-5 xs:h-5 sm:w-8 sm:h-8";

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
      setGame(prev => ({
        ...prev,
        dice,
        remainingMoves: [],
        status: 'playing',
        history: [...prev.history, `${prev.currentPlayer} rolled ${dice.join(',')} - No legal moves`]
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
    const nextBoard = applyMove(game.board, game.currentPlayer, move);
    const nextRemaining = [...game.remainingMoves];
    const dieIndex = nextRemaining.indexOf(move.die);
    if (dieIndex > -1) nextRemaining.splice(dieIndex, 1);

    // Check for win
    if (nextBoard.off[game.currentPlayer] === 15) {
      setGame(prev => ({
        ...prev,
        board: nextBoard,
        status: 'won',
        winner: prev.currentPlayer,
        history: [...prev.history, `${prev.currentPlayer} wins!`]
      }));
      return;
    }

    const nextLegal = getLegalMoves(nextBoard, game.currentPlayer, nextRemaining);
    
    if (nextRemaining.length === 0 || nextLegal.length === 0) {
      setGame(prev => ({
        ...prev,
        board: nextBoard,
        remainingMoves: [],
        currentPlayer: prev.currentPlayer === 'white' ? 'black' : 'white',
        status: 'rolling'
      }));
    } else {
      setGame(prev => ({
        ...prev,
        board: nextBoard,
        remainingMoves: nextRemaining
      }));
    }
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
    setGame({
      board: INITIAL_BOARD,
      currentPlayer: 'white',
      dice: [],
      remainingMoves: [],
      status: 'rolling',
      history: []
    });
    setSelectedPoint(null);
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
            backgroundColor: index % 2 === 0 ? '#d4d4d8' : '#52525b'
          }}
        />
        
        {/* Checkers */}
        <div className={`flex ${isTop ? 'flex-col' : 'flex-col-reverse'} items-center justify-start w-full h-full z-10`}>
          {Array.from({ length: Math.min(absCount, 5) }).map((_, i) => (
            <motion.div
              layoutId={`checker-${index}-${i}`}
              key={i}
              className={`${checkerSize} rounded-full border-2 shadow-lg mb-0.5
                ${color === 'white' 
                  ? 'bg-stone-100 border-stone-300' 
                  : 'bg-stone-950 border-stone-800'}
              `}
            />
          ))}
          {absCount > 5 && (
            <span className={`text-[10px] font-bold text-stone-400 ${isTop ? 'mt-1' : 'mb-1'}`}>+{absCount - 5}</span>
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
    <div className="h-screen bg-stone-950 text-stone-200 font-sans selection:bg-emerald-500/30 overflow-hidden flex flex-col safe-top safe-bottom safe-left safe-right">
      {/* Header - Ultra-minimal for landscape */}
      <header className="border-b border-stone-800 bg-stone-900/50 backdrop-blur-md z-50 shrink-0">
        <div className="max-w-7xl mx-auto px-2 sm:px-6 h-8 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 sm:w-10 sm:h-10 bg-emerald-600 rounded flex items-center justify-center shadow-lg shadow-emerald-900/20">
              <History className="text-white w-3 h-3 sm:w-6 sm:h-6" />
            </div>
            <h1 className="text-[10px] sm:text-lg font-bold tracking-tight">GRANDMASTER</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-6">
            <div className="flex items-center gap-2 sm:gap-4 px-2 sm:px-4 py-0.5 sm:py-2 bg-stone-800/50 rounded-full border border-stone-700">
              <div className={`flex items-center gap-1 ${game.currentPlayer === 'white' ? 'text-emerald-400' : 'text-stone-500'}`}>
                <User size={10} className="sm:w-4 sm:h-4" />
                <span className="hidden xs:block text-[8px] sm:text-xs font-bold uppercase tracking-wider">Player</span>
              </div>
              <div className="w-px h-2 sm:h-4 bg-stone-700" />
              <div className={`flex items-center gap-1 ${game.currentPlayer === 'black' ? 'text-emerald-400' : 'text-stone-500'}`}>
                <Brain size={10} className="sm:w-4 sm:h-4" />
                <span className="hidden xs:block text-[8px] sm:text-xs font-bold uppercase tracking-wider">AI</span>
              </div>
            </div>
            
            <div className="flex items-center gap-0.5 sm:gap-1">
              <button 
                onClick={() => setShowStats(!showStats)}
                className={`p-1 sm:p-1.5 rounded-lg transition-colors ${showStats ? 'bg-emerald-500/20 text-emerald-400' : 'text-stone-400 hover:text-white hover:bg-stone-800'}`}
                title="Stats"
              >
                <Trophy size={14} className="sm:w-4 sm:h-4" />
              </button>
              <button 
                onClick={() => setShowLog(!showLog)}
                className={`p-1 sm:p-1.5 rounded-lg transition-colors ${showLog ? 'bg-emerald-500/20 text-emerald-400' : 'text-stone-400 hover:text-white hover:bg-stone-800'}`}
                title="Log"
              >
                <History size={14} className="sm:w-4 sm:h-4" />
              </button>
              <button 
                onClick={resetGame}
                className="p-1 sm:p-1.5 hover:bg-stone-800 rounded-lg transition-colors text-stone-400 hover:text-white"
                title="Reset"
              >
                <RotateCcw size={14} className="sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 relative p-0.5 sm:p-4 flex flex-col landscape:flex-row gap-1 sm:gap-2 overflow-hidden">
        {/* Game Board Container */}
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          <div className="flex-1 relative bg-stone-900 rounded-lg sm:rounded-2xl border border-stone-800 sm:border-8 shadow-2xl overflow-hidden flex min-h-0">
            {/* Left Board */}
            <div className="flex-1 grid grid-rows-2 border-r border-stone-800 sm:border-r-4">
              <div className="grid grid-cols-6 h-full">
                {[12, 13, 14, 15, 16, 17].map(renderPoint)}
              </div>
              <div className="grid grid-cols-6 h-full">
                {[11, 10, 9, 8, 7, 6].map(renderPoint)}
              </div>
            </div>

            {/* Bar */}
            <div className="w-6 sm:w-16 bg-stone-800 flex flex-col items-center justify-between py-1 sm:py-8 border-x border-stone-700/50">
              <div 
                onClick={() => handlePointClick('bar')}
                className={`flex flex-col items-center gap-0.5 cursor-pointer ${selectedPoint === 'bar' ? 'ring-1 ring-emerald-500 rounded p-0.5' : ''}`}
              >
                {Array.from({ length: game.board.bar.white }).map((_, i) => (
                  <div key={i} className={`${checkerSize} rounded-full bg-stone-100 border border-stone-300 shadow-md`} />
                ))}
                {game.board.bar.white === 0 && <span className="text-[6px] sm:text-[10px] text-stone-600 font-mono">BAR</span>}
              </div>
              <div className="flex flex-col-reverse items-center gap-0.5">
                {Array.from({ length: game.board.bar.black }).map((_, i) => (
                  <div key={i} className={`${checkerSize} rounded-full bg-stone-950 border border-stone-800 shadow-md`} />
                ))}
                {game.board.bar.black === 0 && <span className="text-[6px] sm:text-[10px] text-stone-600 font-mono">BAR</span>}
              </div>
            </div>

            {/* Right Board */}
            <div className="flex-1 grid grid-rows-2">
              <div className="grid grid-cols-6 h-full">
                {[18, 19, 20, 21, 22, 23].map(renderPoint)}
              </div>
              <div className="grid grid-cols-6 h-full">
                {[5, 4, 3, 2, 1, 0].map(renderPoint)}
              </div>
            </div>

            {/* Bearing Off Area */}
            <div className="w-8 sm:w-20 bg-stone-900 border-l border-stone-800 sm:border-l-8 flex flex-col justify-between py-1 sm:py-4">
              <div className="flex flex-col items-center gap-0.5">
                <div className="text-[6px] sm:text-[10px] text-stone-600 font-mono mb-0.5 sm:mb-2 text-center">OFF</div>
                {Array.from({ length: game.board.off.black }).map((_, i) => (
                  <div key={i} className="w-5 sm:w-12 h-1 sm:h-2 bg-stone-950 border border-stone-800 rounded-sm" />
                ))}
              </div>
              <div 
                onClick={handleOffClick}
                className={`flex flex-col-reverse items-center gap-0.5 cursor-pointer p-0.5 sm:p-2 rounded-lg transition-colors
                  ${game.currentPlayer === 'white' && selectedPoint !== null ? 'bg-emerald-500/10 ring-1 ring-emerald-500/50' : ''}
                `}
              >
                <div className="text-[6px] sm:text-[10px] text-stone-600 font-mono mt-0.5 sm:mt-2 text-center">OFF</div>
                {Array.from({ length: game.board.off.white }).map((_, i) => (
                  <div key={i} className="w-5 sm:w-12 h-1 sm:h-2 bg-stone-100 border border-stone-300 rounded-sm" />
                ))}
              </div>
            </div>
          </div>

          {/* Controls Bar - Ultra-Compact */}
          <div className="bg-stone-900/50 p-1 sm:p-4 rounded-lg border border-stone-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex gap-1 sm:gap-1.5">
                {game.dice.length > 0 ? (
                  game.dice.map((d, i) => (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      key={i}
                      className={`w-6 h-6 sm:w-9 sm:h-9 rounded flex items-center justify-center text-[10px] sm:text-lg font-bold shadow-lg
                        ${game.remainingMoves.includes(d) ? 'bg-emerald-600 text-white' : 'bg-stone-800 text-stone-500'}
                      `}
                    >
                      {d}
                    </motion.div>
                  ))
                ) : (
                  <div className="flex gap-1 sm:gap-1.5 opacity-20">
                    <div className="w-6 h-6 rounded bg-stone-800 border border-stone-700 border-dashed" />
                    <div className="w-6 h-6 rounded bg-stone-800 border border-stone-700 border-dashed" />
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={rollDice}
              disabled={game.status !== 'rolling' || game.currentPlayer !== 'white' || isRolling}
              className={`px-3 sm:px-8 py-1.5 sm:py-3 rounded-lg font-bold flex items-center gap-2 transition-all
                ${game.status === 'rolling' && game.currentPlayer === 'white' && !isRolling
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg active:scale-95'
                  : 'bg-stone-800 text-stone-500 cursor-not-allowed'}
              `}
            >
              <Dices size={14} className={`sm:w-4 sm:h-4 ${isRolling ? 'animate-spin' : ''}`} />
              <span className="text-[10px] sm:text-sm">{isRolling ? 'ROLLING' : 'ROLL'}</span>
            </button>
          </div>
        </div>

        {/* Overlays for Stats and Log */}
        <AnimatePresence>
          {showStats && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute right-2 top-12 bottom-2 w-64 bg-stone-900/95 backdrop-blur-xl border border-stone-800 rounded-xl p-4 z-[60] shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-mono text-stone-500 uppercase tracking-widest">Game Status</h3>
                <button onClick={() => setShowStats(false)} className="text-stone-500 hover:text-white">
                  <RotateCcw size={14} className="rotate-45" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 p-2 bg-stone-800/50 rounded-lg border border-stone-700">
                  <div className="flex flex-col items-center">
                    <span className="text-[8px] text-stone-500 uppercase font-mono">White Pips</span>
                    <span className="text-sm font-bold font-mono text-emerald-400">{calculatePipCount(game.board, 'white')}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[8px] text-stone-500 uppercase font-mono">Black Pips</span>
                    <span className="text-sm font-bold font-mono text-stone-400">{calculatePipCount(game.board, 'black')}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-500">Off (White)</span>
                  <span className="font-mono font-bold">{game.board.off.white} / 15</span>
                </div>
                <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${(game.board.off.white / 15) * 100}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-500">Off (Black)</span>
                  <span className="font-mono font-bold">{game.board.off.black} / 15</span>
                </div>
                <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
                  <div className="h-full bg-stone-100" style={{ width: `${(game.board.off.black / 15) * 100}%` }} />
                </div>
                
                {game.status === 'won' && (
                  <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <p className="text-emerald-400 font-bold uppercase tracking-tight">
                      {game.winner === 'white' ? 'Victory!' : 'Defeat'}
                    </p>
                    <button onClick={resetGame} className="mt-2 w-full py-2 bg-stone-800 rounded-lg text-xs font-bold">Play Again</button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {showLog && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute right-2 top-12 bottom-2 w-64 bg-stone-900/95 backdrop-blur-xl border border-stone-800 rounded-xl p-4 z-[60] shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-mono text-stone-500 uppercase tracking-widest">Match Log</h3>
                <button onClick={() => setShowLog(false)} className="text-stone-500 hover:text-white">
                  <RotateCcw size={14} className="rotate-45" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[10px]">
                {game.history.map((entry, i) => (
                  <div key={i} className="flex gap-2 text-stone-400">
                    <span className="text-stone-600">[{i + 1}]</span>
                    <span>{entry}</span>
                  </div>
                ))}
                {isAiThinking && <div className="text-emerald-500 animate-pulse">AI is thinking...</div>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default Backgammon;
