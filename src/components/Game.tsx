import React, { useRef, useState, useEffect, useCallback } from 'react';
import { 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  PADDLE_WIDTH, 
  PADDLE_HEIGHT, 
  PADDLE_SPEED,
  MOUSE_SENSITIVITY,
  BALL_RADIUS, 
  INITIAL_BALL_SPEED,
  BRICK_ROWS,
  BRICK_COLS,
  BRICK_PADDING,
  BRICK_OFFSET_TOP,
  BRICK_OFFSET_LEFT,
  COLORS,
  PowerUpType,
  PowerUp,
  Laser,
  POWERUP_WIDTH,
  POWERUP_HEIGHT,
  POWERUP_SPEED,
  LASER_WIDTH,
  LASER_HEIGHT,
  LASER_SPEED,
  Particle,
  Star,
  Ball,
  PhysicalObject,
  PhysicalObjectType
} from '../constants';
import { useGameLoop } from '../hooks/useGameLoop';
import { audioService } from '../services/audioService';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Shield, 
  Heart, 
  Gauge, 
  Play, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize,
  RotateCcw, 
  Trophy,
  User,
  Send,
  List,
  Flame,
  Ghost,
  Target,
  StickyNote
} from 'lucide-react';
import { db, auth } from '../firebase';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

const POWERUP_DURATION = 30000; // 30 seconds as requested
const FLASH_THRESHOLD = 3000; // 3 seconds

interface HighScoreEntry {
  id: string;
  playerName: string;
  score: number;
  level: number;
  timestamp: Timestamp;
}

export type BrickType = 'NORMAL' | 'SLIME' | 'TNT' | 'INVISIBLE' | 'SWITCH' | 'HARD' | 'PORTAL' | 'FIRE' | 'ICE' | 'GHOST';

interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  active: boolean;
  hits: number;
  type: BrickType;
  indestructible?: boolean;
  resonates?: boolean;
  revealed?: boolean; // For invisible bricks
}

const RetroScroller = React.memo(({ text }: { text: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const charWidth = useRef(0);
  const visibleChars = useRef(0);

  useEffect(() => {
    const span = document.createElement('span');
    span.className = 'scroller-char text-[4cqw] font-mono font-black text-white italic tracking-normal';
    span.style.visibility = 'hidden';
    span.style.position = 'absolute';
    span.innerText = 'M';
    document.body.appendChild(span);
    charWidth.current = (span.getBoundingClientRect().width || 25) * 0.92;
    document.body.removeChild(span);
    
    const updateVisible = () => {
      if (containerRef.current) {
        visibleChars.current = Math.ceil(containerRef.current.clientWidth / charWidth.current) + 12;
      }
    };
    updateVisible();
    window.addEventListener('resize', updateVisible);
    return () => window.removeEventListener('resize', updateVisible);
  }, []);

  useEffect(() => {
    let animationId: number;
    let offset = 0;
    const speed = 2.4;
    
    const animate = () => {
      offset = (offset + speed) % (text.length * charWidth.current);
      
      if (scrollerRef.current) {
        const startIndex = Math.floor(offset / charWidth.current);
        const endIndex = startIndex + (visibleChars.current || 40);
        
        let html = '';
        for (let i = startIndex; i < endIndex; i++) {
          const idx = i % text.length;
          const char = text[idx];
          const x = i * charWidth.current - offset;
          const content = char === " " ? "&nbsp;" : char;
          html += `<span class="scroller-char absolute text-[4cqw] font-mono font-black text-white italic tracking-normal drop-shadow-[0_0_10px_rgba(0,255,0,0.8)]" style="left: ${x}px; transform: translateZ(0)">${content}</span>`;
        }
        scrollerRef.current.innerHTML = html;
      }
      
      animationId = requestAnimationFrame(animate);
    };
    
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [text]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden flex items-center">
      <div ref={scrollerRef} className="contents" />
    </div>
  );
});

declare global {
  interface Window {
    isForcePushing?: boolean;
  }
}

export const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'PAUSED' | 'LEVEL_COMPLETE' | 'GAMEOVER' | 'WIN'>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [activePowerUps, setActivePowerUps] = useState<Map<PowerUpType, number>>(new Map());
  const [isLevel3Intro, setIsLevel3Intro] = useState(false);
  const [highScores, setHighScores] = useState<HighScoreEntry[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [showHallOfFame, setShowHallOfFame] = useState(false);
  const [hasFloor, setHasFloor] = useState(false);
  const [hasExplosion, setHasExplosion] = useState(false);
  const [brickShake, setBrickShake] = useState(0);
  const [paddleShake, setPaddleShake] = useState(0);
  const [isRespawning, setIsRespawning] = useState(false);
  const [isCursorHidden, setIsCursorHidden] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [level3BgImage, setLevel3BgImage] = useState<HTMLImageElement | null>(null);
  const [startBgImage, setStartBgImage] = useState<HTMLImageElement | null>(null);
  const [winBgImage, setWinBgImage] = useState<HTMLImageElement | null>(null);
  const [energy, setEnergy] = useState(0);
  const [timeShiftActive, setTimeShiftActive] = useState(false);
  const [isBlackHoleActive, setIsBlackHoleActive] = useState(false);
  const [isFireballActive, setIsFireballActive] = useState(false);
  const [ghostPaddleActive, setGhostPaddleActive] = useState(false);
  const [hasPaddleMovedSinceLevelStart, setHasPaddleMovedSinceLevelStart] = useState(false);
  const [isInfiniteMode, setIsInfiniteMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [showOrientationPrompt, setShowOrientationPrompt] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const mobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
      const ios = /iphone|ipad|ipod/.test(userAgent.toLowerCase());
      
      // Additional check for iPads (Desktop Safari on MacIntel with touch points)
      const isActuallyMobile = mobile || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      
      setIsMobile(isActuallyMobile);
      setIsIOS(ios);
      setIsSafari(isSafari);
      
      if (mobile && window.innerHeight > window.innerWidth) {
        setShowOrientationPrompt(true);
      } else {
        setShowOrientationPrompt(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const [physicalObjects, setPhysicalObjects] = useState<PhysicalObject[]>([]);
  const [lastPaddleX, setLastPaddleX] = useState(0);
  const [paddleVelocity, setPaddleVelocity] = useState(0);

  useEffect(() => {
    const generateWinBg = () => {
      if (gameState !== 'WIN' || winBgImage) return;
      
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Golden Victory Theme
      const grad = ctx.createLinearGradient(0, 0, 0, 800);
      grad.addColorStop(0, '#100030');
      grad.addColorStop(1, '#300060');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1000, 800);

      // Gold Sparkles
      for (let i = 0; i < 500; i++) {
        ctx.fillStyle = `rgba(255, 215, 0, ${Math.random()})`;
        ctx.beginPath();
        ctx.arc(Math.random() * 1000, Math.random() * 800, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Central "A" Logo (Stylized Atari Fuji)
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 15;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      const cx = 500;
      const cy = 400;
      const s = 150;

      ctx.beginPath();
      ctx.moveTo(cx - s, cy + s);
      ctx.lineTo(cx, cy - s);
      ctx.lineTo(cx + s, cy + s);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx, cy + s);
      ctx.stroke();

      const img = new Image();
      img.src = canvas.toDataURL();
      img.onload = () => setWinBgImage(img);
    };

    if (gameState === 'WIN') {
      generateWinBg();
    }
  }, [gameState, winBgImage]);

  // Procedural Background Generation (100% Local)
  const generateProceduralBg = useCallback((lvl: number) => {
    if (lvl === 3) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 1. Deep Space Base (Slight gradient)
    const baseGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    baseGrad.addColorStop(0, '#020208');
    baseGrad.addColorStop(1, '#080515');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const seed = lvl * 1337.42;
    const rng = (s: number) => {
      const x = Math.sin(s) * 10000;
      return x - Math.floor(x);
    };

    // 2. Cosmic Nebula Clouds (Brighter and more colorful)
    const numClouds = 4 + Math.floor(rng(seed) * 3);
    for (let i = 0; i < numClouds; i++) {
      const x = rng(seed + i * 11) * canvas.width;
      const y = rng(seed + i * 17) * canvas.height;
      const radius = 250 + rng(seed + i * 23) * 450;
      
      const colors = [
        'rgba(120, 30, 180, 0.15)', // Purple
        'rgba(30, 80, 200, 0.15)',  // Blue
        'rgba(200, 40, 100, 0.12)', // Pink
        'rgba(40, 180, 180, 0.1)',  // Cyan
        'rgba(80, 20, 140, 0.18)'   // Dark Magenta
      ];
      const color = colors[Math.floor(rng(seed + i * 31) * colors.length)];
      
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, color);
      grad.addColorStop(0.7, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 3. Starfield (Multiple Layers)
    // Layer 1: Many tiny dim stars
    for (let i = 0; i < 400; i++) {
       const x = rng(seed + i * 7) * canvas.width;
       const y = rng(seed + i * 13) * canvas.height;
       const size = 0.5 + rng(seed + i * 19) * 1;
       const opacity = 0.3 + rng(seed + i * 23) * 0.5;
       ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
       ctx.fillRect(x, y, size, size);
    }

    // Layer 2: Brighter twinkling stars
    for (let i = 0; i < 60; i++) {
       const x = rng(seed + i * 37) * canvas.width;
       const y = rng(seed + i * 41) * canvas.height;
       const size = 1.5 + rng(seed + i * 43) * 1.5;
       
       // Core
       ctx.fillStyle = `rgba(255, 255, 255, 0.9)`;
       ctx.beginPath();
       ctx.arc(x, y, size, 0, Math.PI * 2);
       ctx.fill();

       // Glow effect
       const glowSize = size * 4;
       const sGrad = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
       sGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
       sGrad.addColorStop(1, 'transparent');
       ctx.fillStyle = sGrad;
       ctx.beginPath();
       ctx.arc(x, y, glowSize, 0, Math.PI * 2);
       ctx.fill();
    }

    // 4. Distant Planet or Large Object (Level dependent)
    if (rng(seed + 100) > 0.4) {
      const px = rng(seed + 200) * canvas.width;
      const py = rng(seed + 300) * canvas.height;
      const pr = 60 + rng(seed + 400) * 120;
      
      const pGrad = ctx.createRadialGradient(px - pr/3, py - pr/3, pr/10, px, py, pr);
      
      // Different planet styles
      const planetStyles = [
        ['#2c3e50', '#000000', 'rgba(52, 152, 219, 0.2)'], // Cold/Water
        ['#e67e22', '#2c3e50', 'rgba(231, 76, 60, 0.2)'],  // Desert/Glow
        ['#16a085', '#2c3e50', 'rgba(46, 204, 113, 0.1)'], // Emerald
        ['#8e44ad', '#2c3e50', 'rgba(155, 89, 182, 0.2)']  // Purple/Magic
      ];
      const style = planetStyles[Math.floor(rng(seed + 500) * planetStyles.length)];
      
      pGrad.addColorStop(0, style[0]);
      pGrad.addColorStop(1, style[1]);
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();

      // Atmospheric rim light
      ctx.strokeStyle = style[2];
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    const img = new Image();
    img.src = canvas.toDataURL();
    return img;
  }, []);

  // Background Loading Logic
  useEffect(() => {
    const loadBg = (lvl: number) => {
      if (lvl === 3) {
        setBgImage(null);
        return;
      }

      // Try local background first from the public folder (root of served app)
      const bgNum = ((lvl - 1) % 100) + 1;
      const img = new Image();
      
      img.onload = () => {
        if (img.naturalWidth > 0) {
          (img as any)._level = lvl;
          setBgImage(img);
        } else {
          setBgImage(generateProceduralBg(lvl));
        }
      };

      img.onerror = () => {
        console.warn(`Background bg${bgNum}.jpg not found, generating procedural background.`);
        setBgImage(generateProceduralBg(lvl));
      };

      // Local background path
      img.src = `/data/bg${bgNum}.jpg`;
    };

    loadBg(level);
  }, [level, generateProceduralBg]);


  const paddleRef = useRef({ 
    x: (GAME_WIDTH - PADDLE_WIDTH) / 2,
    width: PADDLE_WIDTH,
    hasLaser: false,
    spawnTimer: 0, // 0 to 100
    damageTimer: 0, // For life lost animation
    effectTimer: 0, // For power-up initialization animation
    effectType: null as PowerUpType | null,
    fireTimer: 0 // For firing pulse
  });
  const ballsRef = useRef<Ball[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const lasersRef = useRef<Laser[]>([]);
  const lastLaserTimeRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<Star[]>([]);
  const bricksRef = useRef<Brick[]>([]);
  const physicalObjectsRef = useRef<PhysicalObject[]>([]);
  const keysPressedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Init stars
    const stars: Star[] = [];
    for (let i = 0; i < 100; i++) {
      stars.push({
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT,
        size: Math.random() * 2,
        speed: Math.random() * 0.5 + 0.1
      });
    }
    starsRef.current = stars;

    // Init start screen bg (Procedural 32-bit style)
    const startCanvas = document.createElement('canvas');
    startCanvas.width = 1000;
    startCanvas.height = 800;
    const sCtx = startCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createLinearGradient(0, 0, 1000, 800);
      grad.addColorStop(0, '#000044');
      grad.addColorStop(0.5, '#440044');
      grad.addColorStop(1, '#000000');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 1000, 800);
      
      // Retro scanlines
      sCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      for (let i = 0; i < 800; i += 4) {
        sCtx.fillRect(0, i, 1000, 2);
      }

      const sImg = new Image();
      sImg.src = startCanvas.toDataURL();
      sImg.onload = () => setStartBgImage(sImg);
    }

    // Load High Score
    const savedHighScore = localStorage.getItem('megaball_highscore');
    if (savedHighScore) {
      setHighScore(parseInt(savedHighScore, 10));
    }
  }, []);

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('megaball_highscore', score.toString());
    }
  }, [score, highScore]);

  useEffect(() => {
    const startMusicOnFirstInteraction = () => {
      audioService.resumeContext();
      window.removeEventListener('click', startMusicOnFirstInteraction);
      window.removeEventListener('keydown', startMusicOnFirstInteraction);
      window.removeEventListener('touchstart', startMusicOnFirstInteraction);
    };
    window.addEventListener('click', startMusicOnFirstInteraction);
    window.addEventListener('keydown', startMusicOnFirstInteraction);
    window.addEventListener('touchstart', startMusicOnFirstInteraction);
    return () => {
      window.removeEventListener('click', startMusicOnFirstInteraction);
      window.removeEventListener('keydown', startMusicOnFirstInteraction);
      window.removeEventListener('touchstart', startMusicOnFirstInteraction);
    };
  }, [isMuted, isFullscreen, level, isInfiniteMode]);

  const initBricks = useCallback((currentLevel: number) => {
    setIsLevel3Intro(currentLevel === 3);
    setHasPaddleMovedSinceLevelStart(false);
    const bricks: Brick[] = [];
    
    // Standard resolution for all levels
    const rows = 20;
    const cols = currentLevel === 3 ? 40 : 20;
    
    const brickWidth = (GAME_WIDTH - BRICK_OFFSET_LEFT * 2) / cols - BRICK_PADDING;
    const brickHeight = 20;

    const getLogoInfo = (r: number, c: number, midC: number) => {
      return { isLogo: false, isCentral: false, isArm: false };
    };

    const visited = new Set<string>();

    const rng = (s: number) => {
      const x = Math.sin(s) * 10000;
      return x - Math.floor(x);
    };

    if (currentLevel === 3) {
      // 8-BIT level redesign
      // 1. Decorative border (top and sides)
      const colors = ['#ff0055', '#33ff00', '#0099ff', '#ffff00', '#ff00ff'];
      
      // Top row border
      for (let c = 0; c < cols; c++) {
        bricks.push({
          x: BRICK_OFFSET_LEFT + c * (brickWidth + BRICK_PADDING),
          y: BRICK_OFFSET_TOP,
          width: brickWidth,
          height: brickHeight,
          color: colors[c % colors.length],
          hits: 1, active: true, resonates: true, type: 'NORMAL'
        });
      }
      
      // Far Left and Far Right pillars
      for (let r = 1; r < 15; r++) {
        // Left
        bricks.push({
          x: BRICK_OFFSET_LEFT,
          y: BRICK_OFFSET_TOP + r * (brickHeight + BRICK_PADDING),
          width: brickWidth,
          height: brickHeight,
          color: colors[r % colors.length],
          hits: 2, active: true, type: 'NORMAL'
        });
        // Right
        bricks.push({
          x: BRICK_OFFSET_LEFT + (cols - 1) * (brickWidth + BRICK_PADDING),
          y: BRICK_OFFSET_TOP + r * (brickHeight + BRICK_PADDING),
          width: brickWidth,
          height: brickHeight,
          color: colors[r % colors.length],
          hits: 2, active: true, type: 'NORMAL'
        });
      }

      // 2. The 8-BIT text layout (centered)
      const startX = 6;
      const startY = 4;
      const pattern = [
        " XXX  XXXX  XXXXX  XXXXX",
        "X   X X   X   X      X  ",
        " XXX  XXXX    X      X  ",
        "X   X X   X   X      X  ",
        " XXX  XXXX  XXXXX    X  "
      ];
      pattern.forEach((line, rOffset) => {
        line.split('').forEach((char, cOffset) => {
          if (char === 'X') {
            bricks.push({
              x: BRICK_OFFSET_LEFT + (startX + cOffset) * (brickWidth + BRICK_PADDING),
              y: BRICK_OFFSET_TOP + (startY + rOffset) * (brickHeight + BRICK_PADDING),
              width: brickWidth,
              height: brickHeight,
              color: '#ffffff', // Keep white for the text contrast
              hits: 1, active: true, type: 'NORMAL'
            });
          }
        });
      });

      // 3. Colorful accents below the text
      const accentY = 12;
      for (let c = 4; c < cols - 4; c++) {
        bricks.push({
          x: BRICK_OFFSET_LEFT + c * (brickWidth + BRICK_PADDING),
          y: BRICK_OFFSET_TOP + accentY * (brickHeight + BRICK_PADDING),
          width: brickWidth,
          height: brickHeight,
          color: '#00ffff',
          hits: 1, active: true, resonates: true, type: 'NORMAL'
        });
      }

      // 4. Indestructible platform divider
      for(let i=0; i<cols; i++) {
        if (i % 5 === 0) continue;
        bricks.push({
          x: BRICK_OFFSET_LEFT + i * (brickWidth + BRICK_PADDING),
          y: BRICK_OFFSET_TOP + 180 + 150, // Moved lower
          width: brickWidth, height: 10, color: '#444444', active: true, hits: 1, indestructible: true, type: 'NORMAL'
        });
      }
      bricksRef.current = bricks;
    } else {
      // Creative Level Designs with STRICT Symmetry
      const seed = currentLevel * 1337.42;
      const isWarpPuzzle = currentLevel % 8 === 0 && currentLevel > 1;
      
      if (isWarpPuzzle) {
        // Warp Puzzle Level Variety
        const variant = (currentLevel / 8) % 3;
        const cageX = GAME_WIDTH / 2;
        const cageY = 250;
        
        if (variant === 0) {
          // Circle Cage (Classic)
          const cageRadius = 180 + rng(seed) * 40;
          for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
              bricks.push({
                x: cageX + i * (brickWidth + 15) - brickWidth/2,
                y: cageY + j * (brickHeight + 15) - brickHeight/2,
                width: brickWidth, height: brickHeight,
                color: (i+j) % 2 === 0 ? '#00ffff' : '#ff3300', 
                active: true, hits: 2, type: (i+j) % 2 === 0 ? 'NORMAL' : 'TNT', revealed: true
              });
            }
          }
          for (let angle = 0; angle < Math.PI * 2; angle += 0.12) {
            bricks.push({
              x: cageX + Math.cos(angle) * cageRadius - 15,
              y: cageY + Math.sin(angle) * cageRadius - 10,
              width: 30, height: 20, color: '#555555', active: true, hits: 1, type: 'NORMAL', indestructible: true
            });
          }
        } else if (variant === 1) {
          // Square Fort
          const size = 200;
          for (let i = -1; i <= 1; i++) {
            bricks.push({
              x: cageX + i * (brickWidth + 10) - brickWidth/2,
              y: cageY - brickHeight/2,
              width: brickWidth, height: brickHeight,
              color: '#33ff33', active: true, hits: 1, type: 'SLIME', revealed: true
            });
          }
          // Walls
          for (let x = cageX - size; x <= cageX + size; x += 35) {
            bricks.push({ x, y: cageY - size, width: 30, height: 20, color: '#444444', active: true, hits: 1, type: 'NORMAL', indestructible: true });
            bricks.push({ x, y: cageY + size, width: 30, height: 20, color: '#444444', active: true, hits: 1, type: 'NORMAL', indestructible: true });
          }
          for (let y = cageY - size; y <= cageY + size; y += 25) {
            bricks.push({ x: cageX - size, y, width: 30, height: 20, color: '#444444', active: true, hits: 1, type: 'NORMAL', indestructible: true });
            bricks.push({ x: cageX + size, y, width: 30, height: 20, color: '#444444', active: true, hits: 1, type: 'NORMAL', indestructible: true });
          }
        } else {
          // Triangle / Delta
          for (let r = 0; r < 4; r++) {
            for (let c = 0; c <= r; c++) {
              bricks.push({
                x: cageX + (c - r/2) * (brickWidth + 10) - brickWidth/2,
                y: cageY + r * (brickHeight + 10) - 50,
                width: brickWidth, height: brickHeight,
                color: '#ff00ff', active: true, hits: 1, type: 'INVISIBLE', revealed: false
              });
            }
          }
          // Perimeter
          for (let i = 0; i < 15; i++) {
            const angle = (i / 15) * Math.PI * 2;
            bricks.push({
              x: cageX + Math.cos(angle) * 160,
              y: cageY + Math.sin(angle) * 160,
              width: 25, height: 25, color: '#333333', active: true, hits: 1, type: 'NORMAL', indestructible: true
            });
          }
        }
      } else {
        const patternType = Math.floor(rng(seed) * 16);
        const maxBrickRows = 12; // Increased for taller designs

        for (let r = 0; r < maxBrickRows; r++) {
          for (let c = 0; c < cols; c++) {
            let spawn = false;
            const midR = 5, midC = 9.5;
            const symC = c < 10 ? c : 19 - c; // Symmetrical column index
            const diffR = Math.abs(r - midR);
            const diffC = Math.abs(c - midC);
            const symDiffC = Math.abs(symC - 4.5); 

            switch(patternType) {
              case 0: spawn = r < 8 && symC >= (7-r); break; // Pyramid
              case 1: spawn = (diffR + Math.abs(symC - 5)) <= 5; break; // Diamond
              case 2: spawn = r < 10 && (symC % 3 < 2); break; // Vertical Bars
              case 3: spawn = r < 10 && (r % 3 < 2); break; // Horizontal Bars
              case 4: spawn = (r < 9) && (r === 0 || r === 8 || c === 0 || c === cols - 1); break; // Box
              case 5: spawn = (r < 9) && (r === 4 || c === 9 || c === 10); break; // Cross
              case 6: spawn = (r < 9) && (Math.abs(r - symC) < 2); break; // V / X shape
              case 7: spawn = r < 8 && (Math.sin(symC * 0.8) * 3 + 4 > r); break; // Waves
              case 8: spawn = (r < 8) && (r + symC < 8); break; // Corner clusters
              case 9: // Heart
                const heartX = (c - 9.5) / 5;
                const heartY = (r - 4) / 5;
                spawn = Math.pow(heartX*heartX + heartY*heartY - 1, 3) - heartX*heartX*heartY*heartY*heartY <= 0;
                break;
              case 10: // Checkerboard
                spawn = r < 10 && (r + c) % 2 === 0;
                break;
              case 11: // Rings
                const distToCenter = Math.sqrt(diffR * diffR + diffC * diffC);
                spawn = Math.floor(distToCenter) % 3 === 0 && distToCenter < 9;
                break;
              case 12: // Space Invader (roughly)
                const invaderRows = [
                  [0,0,1,0,0], [0,1,1,1,0], [1,1,1,1,1], [1,0,1,0,1], [1,1,1,1,1], [0,1,0,1,0]
                ];
                if (r < 6 && symC < 5) spawn = invaderRows[r][Math.floor(symC)] === 1;
                break;
              case 13: // Zig Zag
                spawn = r < 10 && (c % 6 === r % 6 || (6-c%6) === r % 6);
                break;
              case 14: // Frame within frame
                spawn = r < 10 && (r % 4 === 0 || c % 4 === 0);
                break;
              default: spawn = r < 8 && rng(seed + r * 37 + symC) < 0.5; // Random Symmetric
            }

            if (spawn) {
              const propSeed = seed + r * 13 + symC;
              const rand = rng(propSeed);
              let type: BrickType = 'NORMAL';
              let color = COLORS.bricks[r % COLORS.bricks.length];
              let hits = (currentLevel > 5 && rng(propSeed) < 0.2) ? 2 : 1;
              let revealed = true;

              if (currentLevel > 3) {
                if (rand < 0.03) { type = 'TNT'; color = '#ff3300'; }
                else if (rand < 0.06) { type = 'SLIME'; color = '#33ff33'; }
                else if (rand < 0.08) { type = 'PORTAL'; color = '#aa00ff'; }
                else if (rand < 0.10) { type = 'FIRE'; color = '#ff9900'; }
                else if (rand < 0.12) { type = 'ICE'; color = '#00ffff'; }
                else if (rand < 0.14) { type = 'GHOST'; color = 'rgba(255,255,255,0.4)'; }
                else if (rand < 0.16) { type = 'INVISIBLE'; revealed = false; color = '#444444'; }
                else if (rand < 0.20 && currentLevel > 10) { type = 'HARD'; color = '#888888'; hits = 3; }
              }

              bricks.push({
                x: c * (brickWidth + BRICK_PADDING) + BRICK_OFFSET_LEFT,
                y: r * (brickHeight + BRICK_PADDING) + BRICK_OFFSET_TOP,
                width: brickWidth, height: brickHeight,
                color, active: true, hits, type, revealed,
                indestructible: currentLevel > 15 && rng(propSeed + 100) < 0.05,
                resonates: rng(propSeed + 200) < 0.05
              });
            }
          }
        }
      }
      bricksRef.current = bricks;
    }

    // Initialize Physical Objects (Obstacles)
    if (currentLevel !== 3) {
      const objects: PhysicalObject[] = [];
      const seedBase = currentLevel * 888;
      const isWarpPuzzle = currentLevel % 8 === 0 && currentLevel > 1;
      
      // Standard Obstacles
      const availableTypes: PhysicalObjectType[] = [];
      if (rng(seedBase + 10) > 0.4) availableTypes.push('FAN');
      if (rng(seedBase + 20) > 0.4) availableTypes.push('GEAR');
      if (rng(seedBase + 30) > 0.4) availableTypes.push('MAGNET');
      if (currentLevel > 5) {
        availableTypes.push('CRUSHER');
        availableTypes.push('CONVEYOR');
      }
      
      const skipAll = currentLevel < 4 || (rng(seedBase + 44) < 0.15);

      if (availableTypes.length > 0 && !skipAll && !isWarpPuzzle) {
        const obstacleRows = Math.floor(rng(seedBase + 55) * 2) + 1;
        for (let row = 0; row < obstacleRows; row++) {
          const type = availableTypes[Math.floor(rng(seedBase + row * 9) * availableTypes.length)];
          const y = 400 + row * 150;
          const layoutType = rng(seedBase + row * 77);

          const createObject = (side: 'L' | 'R' | 'C', x: number): PhysicalObject | null => {
            const id = `obj-${currentLevel}-${row}-${side}`;
            const baseObj: PhysicalObject = {
              id, type, x, y, radius: 40,
              rotation: rng(seedBase + row) * Math.PI,
              strength: 0
            };
            switch(type) {
              case 'FAN': baseObj.radius = 70; baseObj.strength = 0.22; break;
              case 'GEAR': baseObj.radius = 45; break;
              case 'MAGNET': baseObj.radius = 55; baseObj.strength = 0.28; break;
              case 'CRUSHER': baseObj.radius = 35; baseObj.width = 80; baseObj.height = 30; baseObj.state = 'RETRACTED'; baseObj.lastMoveTime = 0; break;
              case 'CONVEYOR': baseObj.radius = 40; baseObj.width = 120; baseObj.height = 20; baseObj.direction = rng(seedBase + row) > 0.5 ? 'LEFT' : 'RIGHT'; break;
            }

            // Guard against brick overlap
            const padding = 60;
            const hasOverlap = bricks.some(b => {
              const bCenterX = b.x + b.width / 2;
              const bCenterY = b.y + b.height / 2;
              const dist = Math.sqrt((x - bCenterX) ** 2 + (y - bCenterY) ** 2);
              return dist < baseObj.radius + padding;
            });

            if (hasOverlap) return null;
            return baseObj;
          };

          if (layoutType < 0.25 && type !== 'CRUSHER') {
            const obj = createObject('C', GAME_WIDTH / 2);
            if (obj) objects.push(obj);
          } else {
            const distFromCenter = 180 + rng(seedBase + row * 11) * 220;
            const objL = createObject('L', GAME_WIDTH / 2 - distFromCenter);
            const objR = createObject('R', GAME_WIDTH / 2 + distFromCenter);
            if (objL) objects.push(objL);
            if (objR) objects.push(objR);
          }
        }
      }

      // Handle Warp Gates (Strategic Portals)
      if (isWarpPuzzle) {
        const gate1Id = `gate-${currentLevel}-1`;
        const gate2Id = `gate-${currentLevel}-2`;
        const gate3Id = `gate-${currentLevel}-3`;
        
        const variant = (currentLevel / 8) % 3;
        
        if (variant === 0) {
          // Narrow side corridors for portals
          objects.push({ id: gate1Id, type: 'WARP_GATE', x: 100, y: 600, radius: 35, targetId: gate2Id });
          objects.push({ id: gate3Id, type: 'WARP_GATE', x: GAME_WIDTH - 100, y: 600, radius: 35, targetId: gate2Id });
          
          // Obstacles blocking direct path
          objects.push({ id: `block-${currentLevel}-1`, type: 'GEAR', x: 250, y: 600, radius: 50 });
          objects.push({ id: `block-${currentLevel}-2`, type: 'GEAR', x: GAME_WIDTH - 250, y: 600, radius: 50 });
        } else if (variant === 1) {
          // Hidden behind a crusher
          objects.push({ id: gate1Id, type: 'WARP_GATE', x: GAME_WIDTH/2, y: 580, radius: 35, targetId: gate2Id });
          objects.push({ 
            id: `guard-${currentLevel}`, type: 'CRUSHER', x: GAME_WIDTH/2, y: 540, radius: 35, 
            width: 150, height: 40, state: 'RETRACTED' 
          });
        } else {
          // Far corners with wind resistance
          objects.push({ id: gate1Id, type: 'WARP_GATE', x: 80, y: 550, radius: 35, targetId: gate2Id });
          objects.push({ id: gate3Id, type: 'WARP_GATE', x: GAME_WIDTH - 80, y: 550, radius: 35, targetId: gate2Id });
          objects.push({ id: `fan-${currentLevel}`, type: 'FAN', x: GAME_WIDTH/2, y: 600, radius: 80, strength: 0.3 });
        }
        
        // Exit (Inside cage)
        objects.push({
          id: gate2Id, type: 'WARP_GATE', x: GAME_WIDTH / 2, y: 250, radius: 35, targetId: gate1Id 
        });
      }

      setPhysicalObjects(objects);
      physicalObjectsRef.current = objects;
    } else {
      setPhysicalObjects([]);
      physicalObjectsRef.current = [];
    }
  }, []);

  const resetBall = (keepLevel = false) => {
    console.log("Resetting ball...");
    if (!keepLevel) {
      setIsBlackHoleActive(false);
      setIsFireballActive(false);
      setGhostPaddleActive(false);
      setHasFloor(false);
      setHasExplosion(false);
    }
    const speed = INITIAL_BALL_SPEED + (level * 0.05);
    const currentPaddleWidth = Math.max(70, PADDLE_WIDTH - (level * 0.3));
    
    ballsRef.current = [{
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT - PADDLE_HEIGHT - BALL_RADIUS,
      dx: speed * (Math.random() > 0.5 ? 1 : -1),
      dy: -speed,
      trail: [],
      isStuck: true, // Start with glue active
      stuckOffset: currentPaddleWidth / 2,
      isBlackHole: false,
      isFireball: false,
      consecutiveWallHits: 0
    }];
    console.log("Ball count after reset:", ballsRef.current.length);
    paddleRef.current.x = (GAME_WIDTH - currentPaddleWidth) / 2;
    paddleRef.current.width = currentPaddleWidth;
    paddleRef.current.hasLaser = false;
    paddleRef.current.spawnTimer = 60; // Start spawn animation
    powerUpsRef.current = [];
    lasersRef.current = [];
    setIsRespawning(false);
    if (!keepLevel) {
      setActivePowerUps(new Map());
    }
  };

  const startGame = (infinite = isInfiniteMode) => {
    console.log("Starting game...");
    
    // Attempt pointer lock immediately on start if in fullscreen to avoid late banner jump
    if (isFullscreen && containerRef.current) {
      containerRef.current.requestPointerLock?.();
    }
    
    audioService.warmUpTTS();
    setIsInfiniteMode(infinite);
    audioService.stopGameOver();
    audioService.playMusic(level, infinite); // Start music for selected level
    initBricks(level);
    setScore(0);
    setLives(5);
    resetBall();
    setGameState('PLAYING');
    console.log("Game state set to PLAYING");
  };

  const backToMenu = () => {
    setGameState('START');
    setIsInfiniteMode(false);
    audioService.stopGameOver();
    audioService.playMusic(1, false);
  };

  const nextLevel = () => {
    setGameState('LEVEL_COMPLETE');
    audioService.playSfx('powerup');
    audioService.playVoice("Level complete!");
  };

  const startNextLevel = () => {
    const nextLvl = level + 1;
    if (nextLvl > 100) {
      setGameState('WIN');
      audioService.playVictoryMusic();
      audioService.playVoice("Congratulations! You have conquered the game!");
      return;
    }
    setLevel(nextLvl);
    initBricks(nextLvl);
    resetBall(false);
    setGameState('PLAYING');
    audioService.playMusic(nextLvl, isInfiniteMode);
  };

  const toggleFullscreen = () => {
    const doc = document as any;
    const element = containerRef.current as any;

    const isCurrentlyFull = !!(doc.fullscreenElement || doc.mozFullScreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement);

    if (!isCurrentlyFull) {
      if (element) {
        const requestMethod = element.requestFullscreen || element.mozRequestFullScreen || element.webkitRequestFullscreen || element.msRequestFullscreen;
        
        if (requestMethod) {
          requestMethod.call(element).then(() => {
            setIsFullscreen(true);
            
            if (screen.orientation && (screen.orientation as any).lock) {
              (screen.orientation as any).lock('landscape').catch(() => {});
            }

            if (gameState === 'PLAYING') {
              element.requestPointerLock?.();
            }
          }).catch(() => {
            setIsFullscreen(true);
          });
        } else {
          // iOS Safari fallback
          setIsFullscreen(true);
          // On iOS, we can't lock orientation via API, we just show the prompt
        }
      }
    } else {
      const exitMethod = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      if (exitMethod) {
        exitMethod.call(doc);
        if (screen.orientation && (screen.orientation as any).unlock) {
          screen.orientation.unlock();
        }
        setIsFullscreen(false);
      } else {
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      const doc = document as any;
      const isActuallyFullscreen = !!(doc.fullscreenElement || doc.mozFullScreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement);
      setIsFullscreen(isActuallyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('mozfullscreenchange', handleFsChange);
    document.addEventListener('MSFullscreenChange', handleFsChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('mozfullscreenchange', handleFsChange);
      document.removeEventListener('MSFullscreenChange', handleFsChange);
    };
  }, []);

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      if (gameState !== 'PLAYING') return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      
      if (document.pointerLockElement === containerRef.current) {
        // Pointer Lock movement (PC) - Increased sensitivity and smoothed
        const movementX = (e as MouseEvent).movementX || 0;
        if (Math.abs(movementX) > 0.3) {
          setHasPaddleMovedSinceLevelStart(true);
        }
        const scaleX = (GAME_WIDTH / rect.width) * MOUSE_SENSITIVITY * 1.5;
        paddleRef.current.x += movementX * scaleX;
      } else {
        // Normal movement (Touch or fallback)
        let clientX: number;
        if ('touches' in e) {
          clientX = (e as TouchEvent).touches[0].clientX;
        } else {
          clientX = (e as MouseEvent).clientX;
        }

        const relativeX = clientX - rect.left;
        const scaleX = GAME_WIDTH / rect.width;
        const gameX = relativeX * scaleX;
        const newX = gameX - paddleRef.current.width / 2;
        if (Math.abs(newX - paddleRef.current.x) > 1) {
          setHasPaddleMovedSinceLevelStart(true);
        }
        paddleRef.current.x = newX;
      }
      
      // Clamp to game boundaries
      if (paddleRef.current.x < 0) paddleRef.current.x = 0;
      if (paddleRef.current.x > GAME_WIDTH - paddleRef.current.width) {
        paddleRef.current.x = GAME_WIDTH - paddleRef.current.width;
      }
    };

    const unstickBalls = () => {
      ballsRef.current.forEach(ball => {
        if (ball.isStuck) {
          ball.isStuck = false;
          // Piercing at start removed per user request
          const paddle = paddleRef.current;
          const offset = ball.stuckOffset ?? (paddle.width / 2);
          
          // Calculate launch angle based on where the ball is on the paddle
          // -1 (left edge) to 1 (right edge)
          const hitPoint = (offset - (paddle.width / 2)) / (paddle.width / 2);
          const angle = hitPoint * (Math.PI / 3); // Max 60 degrees
          
          // Use existing speed or default to a reasonable starting speed
          const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          const speed = currentSpeed > 2 ? currentSpeed : INITIAL_BALL_SPEED * 1.2;
          
          ball.dx = speed * Math.sin(angle);
          ball.dy = -speed * Math.cos(angle);
          
          // Ensure it always moves up
          if (ball.dy > -2) ball.dy = -4;
          
          audioService.playSfx('paddle');
        }
      });
    };

    const handleGlobalDown = (e: MouseEvent | TouchEvent) => {
      window.focus();
      if (gameState !== 'PLAYING') return;
      
      if (isLevel3Intro) {
        setIsLevel3Intro(false);
      }

      // Request pointer lock on click if not already locked (and not on touch)
      if (!('touches' in e) && containerRef.current && document.pointerLockElement !== containerRef.current && isFullscreen) {
        containerRef.current.requestPointerLock();
      }

      // Hide cursor again if clicking back into the game
      setIsCursorHidden(true);

      // Check if clicking on UI elements
      if (e.target instanceof HTMLElement && e.target.closest('button')) return;

      unstickBalls();
    };

    const handlePointerLockChange = () => {
      if (document.pointerLockElement === containerRef.current) {
        setIsCursorHidden(true);
      } else {
        setIsCursorHidden(false);
      }
    };

    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      window.focus();
      
      if (isFull && gameState === 'PLAYING' && containerRef.current) {
        setTimeout(() => {
          containerRef.current?.requestPointerLock();
        }, 800); // More generous delay for macOS transition
      } else if (!isFull) {
        setIsCursorHidden(false);
        if (document.pointerLockElement) {
          try {
            document.exitPointerLock();
          } catch (e) {
            // Ignore errors
          }
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressedRef.current.add(e.code);
      
      if (e.code === 'Escape') {
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
        setIsCursorHidden(false);
        return;
      }

      // Global shortcuts
      if (e.code === 'KeyM') {
        toggleMute();
        return;
      }
      if (e.code === 'KeyF') {
        toggleFullscreen();
        return;
      }
      if (e.code === 'KeyQ') {
        backToMenu();
        return;
      }
      if (e.code === 'KeyP' || e.code === 'Space') {
        if (gameState === 'PLAYING') {
          setGameState('PAUSED');
          audioService.pauseMusic();
        } else if (gameState === 'PAUSED') {
          setGameState('PLAYING');
          audioService.resumeMusic();
        }
        return;
      }

      // Skills
      if (e.code === 'KeyT' && energy >= 50) {
        setTimeShiftActive(true);
        setEnergy(e => e - 50);
        audioService.playSfx('powerup');
        setTimeout(() => setTimeShiftActive(false), 2000);
        return;
      }

      if (e.code === 'KeyE' && energy >= 30) {
        setEnergy(e => e - 30);
        audioService.playSfx('explosion');
        setBrickShake(10);
        // Force push effect: push balls away from paddle
        ballsRef.current.forEach(ball => {
          const dx = ball.x - (paddleRef.current.x + paddleRef.current.width / 2);
          const dy = ball.y - (GAME_HEIGHT - PADDLE_HEIGHT);
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 200) {
            const angle = Math.atan2(dy, dx);
            const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
            const newSpeed = currentSpeed > 0 ? currentSpeed * 1.5 : INITIAL_BALL_SPEED * 1.5;
            ball.dx = Math.cos(angle) * newSpeed;
            ball.dy = Math.sin(angle) * newSpeed;
          }
        });
        return;
      }

      if (gameState !== 'PLAYING') return;
      if (e.code === 'Enter') {
        unstickBalls();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current.delete(e.code);
    };

    if (gameState === 'PLAYING' || gameState === 'PAUSED') {
      if (gameState === 'PLAYING') {
        setIsCursorHidden(true);
        window.addEventListener('mousemove', handleGlobalMove, { passive: true });
        window.addEventListener('touchmove', handleGlobalMove, { passive: false });
        window.addEventListener('mousedown', handleGlobalDown);
        window.addEventListener('touchstart', handleGlobalDown, { passive: false });
      }
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      document.addEventListener('pointerlockchange', handlePointerLockChange);
      document.addEventListener('fullscreenchange', handleFullscreenChange);
    } else {
      setIsCursorHidden(false);
      keysPressedRef.current.clear();
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    }
    
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('mousedown', handleGlobalDown);
      window.removeEventListener('touchstart', handleGlobalDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [gameState, level, isInfiniteMode]);

  const scrollerText = "*** WELCOME TO MEGABALL AiGA - A TRIBUTE TO THE GOLDEN ERA OF COMMODORE AMIGA *** PROMPTED BY GMX *** MUSIC PROMPTED BY GMX USING SUNO AI *** GREETINGS TO ALL RETRO GAMERS WORLDWIDE *** CRACKED BY NOBODY *** PLAY LOUD AND PROUD *** EXPERIENCE THE POWER OF THE 32-BIT AGA CHIPSET *** 256 COLORS OF PURE ARCADE ADRENALINE *** REMEMBER THE DAYS OF FLOPPY DISKS AND JOYSTICK WIGGLING? *** THIS IS A LOVE LETTER TO THE 32-BIT GENERATION *** SPECIAL THANKS TO THE DEMOSCENE FOR THE ENDLESS INSPIRATION *** KEEP THE RETRO SPIRIT ALIVE *** DON'T FORGET TO GRAB THE POWER-UPS *** WATCH OUT FOR THE FIREBALL! *** CAN YOU CLEAR ALL 100 SECTORS? *** THE GALAXY IS COUNTING ON YOU PILOT *** NO QUARTERS REQUIRED *** JUST PURE SKILL AND REFLEXES *** STAY TUNED FOR MORE UPDATES *** OVER AND OUT! *** DID YOU KNOW? THE ORIGINAL MEGABALL WAS A STAPLE OF THE AMIGA SHAREWARE SCENE! *** WE ARE KEEPING THE TRADITION ALIVE WITH THIS MODERN TRIBUTE *** FEEL THE SMOOTH 60FPS ACTION *** NO LAG, NO SLOWDOWNS, JUST PURE 32-BIT POWER *** SHOUTOUTS TO ALL THE LEGENDARY GROUPS: RAZOR 1911, FAIRLIGHT, SKIDROW, AND THE REST! *** THE DEMOSCENE LIVES ON IN OUR HEARTS *** DON'T FORGET TO CHECK THE SETTINGS FOR FULLSCREEN MODE *** USE THE MOUSE TO CONTROL THE PADDLE WITH PIXEL-PERFECT PRECISION *** COLLECT THE LASER POWER-UP TO BLAST THROUGH THE BRICKS *** THE MULTIBALL WILL HELP YOU CLEAR THE SCREEN IN NO TIME *** BUT BEWARE OF THE SPEED-UP! *** YOUR REFLEXES WILL BE TESTED TO THE LIMIT *** ARE YOU READY FOR THE ULTIMATE CHALLENGE? *** LET'S GO! *** REMEMBER THE AMIGA 500, 1200, AND 4000? *** THE GLORY DAYS OF THE WORKBENCH AND DELUXE PAINT *** THIS GAME IS BUILT WITH PASSION FOR THE PIXELS *** EVERY BRICK YOU BREAK IS A NOD TO THE PAST *** CAN YOU FIND THE HIDDEN SECRETS? *** THE MUSIC WAS COMPOSED TO BRING BACK THAT MOD-TRACKER FEEL *** CRANK UP THE VOLUME AND LET THE BASS HIT *** WATCH YOUR LIVES, they ARE PRECIOUS *** EXTRA LIVES ARE RARE, so PLAY CAREFULLY *** THE PADDLE IS YOUR ONLY DEFENSE AGAINST THE COSMIC CHAOS *** MASTER THE ANGLES TO BECOME A TRUE MEGABALL PRO *** THANKS FOR PLAYING AND SUPPORTING INDIE RETRO PROJECTS *** SPREAD THE WORD AND CHALLENGE YOUR FRIENDS *** WHO WILL GET THE HIGHEST SCORE? *** THE LEADERBOARD AWAITS YOUR NAME *** KEEP ON GAMING! *** THE AMIGA 1200 BROUGHT us INTO THE 32-BIT ERA WITH STYLE *** LONG LIVE THE AMIGA! ***   ";

  const spawnPowerUp = (x: number, y: number) => {
    const powerupProb = 0.2 - Math.min(0.1, (level / 100) * 0.1);
    if (Math.random() > powerupProb) return; 
    const types = Object.values(PowerUpType);
    
    // Weighted random or just filter
    // Make EXTRA_LIFE a bit rarer as requested
    let type: PowerUpType;
    const rand = Math.random();
    if (rand < 0.05) {
      type = PowerUpType.EXTRA_LIFE; // 5% of powerups
    } else if (rand < 0.12) {
      type = PowerUpType.SLOW_BALL; // Reduced frequency for slowdown
    } else if (rand < 0.25) {
      type = PowerUpType.DEATH; // 13% of powerups (dangerous!)
    } else {
      // Pick from the rest
      const otherTypes = types.filter(t => t !== PowerUpType.EXTRA_LIFE && t !== PowerUpType.DEATH && t !== PowerUpType.SLOW_BALL);
      type = otherTypes[Math.floor(Math.random() * otherTypes.length)];
    }
    
    const speed = Math.random() * 2 + 1; // Random speed between 1 and 3
    powerUpsRef.current.push({ x, y, type, active: true, speed });
  };

  const handleLifeLost = () => {
    if (lives <= 1) {
      setGameState('GAMEOVER');
      audioService.playGameOver();
      audioService.playVoice("Game over. You are defeated!");
      setIsRespawning(false);
      setLives(0);
    } else {
      setIsRespawning(true);
      audioService.playSfx('lose');
      audioService.playVoice("Life lost!");
      setLives(l => l - 1);
      setActivePowerUps(new Map());
      setGhostPaddleActive(false);
      setIsFireballActive(false);
      setIsBlackHoleActive(false);
      setHasFloor(false);
      setHasExplosion(false);
      setTimeShiftActive(false);
      paddleRef.current.damageTimer = 1000;
      paddleRef.current.hasLaser = false;
      paddleRef.current.width = PADDLE_WIDTH;
      setTimeout(() => {
        paddleRef.current.spawnTimer = 0; // Reset spawn timer for pop-in effect
        paddleRef.current.damageTimer = 0;
        resetBall(true);
        setIsRespawning(false);
      }, 1000);
    }
  };

  const applyPowerUp = (type: PowerUpType) => {
    audioService.playSfx('powerup');
    
    // Trigger paddle animation
    paddleRef.current.effectTimer = 600; 
    paddleRef.current.effectType = type;
    
    switch (type) {
      case PowerUpType.WIDE_PADDLE:
        paddleRef.current.width = PADDLE_WIDTH * 1.5;
        setActivePowerUps(prev => {
          const next = new Map(prev);
          next.set(PowerUpType.WIDE_PADDLE, POWERUP_DURATION);
          return next;
        });
        break;
      case PowerUpType.LASER:
        paddleRef.current.hasLaser = true;
        setActivePowerUps(prev => {
          const next = new Map(prev);
          next.set(PowerUpType.LASER, POWERUP_DURATION);
          return next;
        });
        break;
      case PowerUpType.EXTRA_LIFE:
        setLives(l => Math.min(l + 1, 10));
        audioService.playVoice("New life gained");
        break;
      case PowerUpType.SLOW_BALL:
        const wasSlowAlready = activePowerUps.has(PowerUpType.SLOW_BALL);
        if (!wasSlowAlready) {
          ballsRef.current.forEach(ball => {
            ball.dx *= 0.5;
            ball.dy *= 0.5;
          });
        }
        setActivePowerUps(prev => {
          const next = new Map(prev);
          next.set(PowerUpType.SLOW_BALL, 10000); // Strict 10 seconds
          return next;
        });
        break;
      case PowerUpType.FAST_BALL:
        ballsRef.current.forEach(ball => {
          ball.dx *= 1.4;
          ball.dy *= 1.4;
        });
        setActivePowerUps(prev => {
          const next = new Map(prev);
          next.set(PowerUpType.FAST_BALL, POWERUP_DURATION);
          return next;
        });
        break;
      case PowerUpType.MULTI_BALL:
        if (ballsRef.current.length > 0) {
          const mainBall = ballsRef.current[0];
          ballsRef.current.push({
            ...mainBall,
            dx: -mainBall.dx,
            dy: mainBall.dy,
            trail: [],
            isStuck: false
          });
          ballsRef.current.push({
            ...mainBall,
            dx: mainBall.dx,
            dy: -mainBall.dy,
            trail: [],
            isStuck: false
          });
        }
        break;
      case PowerUpType.GLUE:
        setActivePowerUps(prev => {
          const next = new Map(prev);
          next.set(PowerUpType.GLUE, POWERUP_DURATION);
          return next;
        });
        break;
      case PowerUpType.FIREBALL:
        setIsFireballActive(true);
        ballsRef.current.forEach(ball => {
          ball.isFireball = true;
        });
        setActivePowerUps(prev => {
          const next = new Map(prev);
          next.set(PowerUpType.FIREBALL, POWERUP_DURATION);
          return next;
        });
        break;
      case PowerUpType.DEATH:
        handleLifeLost();
        break;
      case PowerUpType.FLOOR:
        setHasFloor(true);
        setActivePowerUps(prev => {
          const next = new Map(prev);
          next.set(PowerUpType.FLOOR, POWERUP_DURATION);
          return next;
        });
        break;
      case PowerUpType.EXPLOSION:
        setHasExplosion(true);
        setActivePowerUps(prev => {
          const next = new Map(prev);
          next.set(PowerUpType.EXPLOSION, POWERUP_DURATION);
          return next;
        });
        break;
      case PowerUpType.BLACK_HOLE:
        setIsBlackHoleActive(true);
        ballsRef.current.forEach(ball => {
          ball.isBlackHole = true;
        });
        setActivePowerUps(prev => {
          const next = new Map(prev);
          next.set(PowerUpType.BLACK_HOLE, POWERUP_DURATION);
          return next;
        });
        break;
      case PowerUpType.GHOST_PADDLE:
        if (level === 3) break; // No ghost paddle in level 3
        setGhostPaddleActive(true);
        setActivePowerUps(prev => {
          const next = new Map<PowerUpType, number>(prev);
          next.set(PowerUpType.GHOST_PADDLE, POWERUP_DURATION);
          return next;
        });
        audioService.playSfx('powerup');
        break;
    }
  };

  const spawnParticles = (x: number, y: number, color: string) => {
    for (let i = 0; i < 20; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0 + Math.random() * 0.5,
        color,
        size: Math.random() * 4 + 1
      });
    }
  };

  const frameCountRef = useRef(0);
  const update = (delta: number) => {
    if (gameState !== 'PLAYING' || isRespawning) return;

    frameCountRef.current++;
    if (frameCountRef.current % 60 === 0) {
      console.log("Update running, balls count:", ballsRef.current.length, "delta:", delta);
    }

    if (brickShake > 0) {
      setBrickShake(s => Math.max(0, s - 0.1 * (delta / 16.67)));
    }
    if (paddleShake > 0) {
      setPaddleShake(s => Math.max(0, s - 0.1 * (delta / 16.67)));
    }

    const paddle = paddleRef.current;
    if (paddle.damageTimer > 0) {
      paddle.damageTimer -= delta;
    }
    if (paddle.effectTimer > 0) {
      paddle.effectTimer -= delta;
    }
    if (paddle.fireTimer > 0) {
      paddle.fireTimer -= delta;
    }
    let speedMultiplier = isNaN(delta) || delta > 100 ? 1 : delta / 16.67; 
    
    if (timeShiftActive) {
      speedMultiplier *= 0.3;
    }

    // Update paddle velocity for spin
    const currentPaddleVelocity = (paddle.x - lastPaddleX) / speedMultiplier;
    setPaddleVelocity(currentPaddleVelocity);
    setLastPaddleX(paddle.x);

    // Keyboard movement
    if (keysPressedRef.current.has('ArrowLeft') || keysPressedRef.current.has('KeyA')) {
      paddle.x -= PADDLE_SPEED * speedMultiplier;
    }
    if (keysPressedRef.current.has('ArrowRight') || keysPressedRef.current.has('KeyD')) {
      paddle.x += PADDLE_SPEED * speedMultiplier;
    }

    // Clamp to boundaries
    if (paddle.x < 0) paddle.x = 0;
    if (paddle.x > GAME_WIDTH - paddle.width) {
      paddle.x = GAME_WIDTH - paddle.width;
    }

    if (paddle.spawnTimer > 0) {
      paddle.spawnTimer -= 1 * (delta / 16.67);
    }

    // Move balls (frame-rate independent)
    ballsRef.current.forEach(ball => {
      if (ball.isStuck) {
        const offset = ball.stuckOffset ?? (paddle.width / 2);
        ball.x = paddle.x + offset;
        ball.y = GAME_HEIGHT - PADDLE_HEIGHT - BALL_RADIUS;
        
        // Update trail while stuck so it follows the paddle and doesn't leave a "ghost"
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 10) ball.trail.shift();
        return;
      }

      // Update trail
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 10) ball.trail.shift();

      ball.x += ball.dx * speedMultiplier;
      ball.y += ball.dy * speedMultiplier;

      // Apply spin curve
      if (ball.spin) {
        ball.dx += ball.spin * 0.1 * speedMultiplier;
        ball.spin *= 0.98; // Decay spin
      }
      
      // Black Hole Ball effect
      if (ball.isBlackHole) {
        bricksRef.current.forEach(brick => {
          if (brick.active && !brick.indestructible) {
            const dx = brick.x + brick.width/2 - ball.x;
            const dy = brick.y + brick.height/2 - ball.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 100) {
              brick.hits -= 0.1; // Gradual damage
              if (brick.hits <= 0) {
                brick.active = false;
                setScore(s => s + 10);
                spawnParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color);
                audioService.playBreakSound();
              }
            }
          }
        });
      }

      // Speed up ball slightly over time
      const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
      const maxSpeed = 15 + (level * 0.1);
      if (currentSpeed < maxSpeed) {
        ball.dx *= 1.0001;
        ball.dy *= 1.0001;
      }

      // Wall collisions
      if (ball.x + BALL_RADIUS > GAME_WIDTH || ball.x - BALL_RADIUS < 0) {
        ball.dx = -ball.dx;
        ball.consecutiveWallHits = (ball.consecutiveWallHits || 0) + 1;
        audioService.playSfx('wall');
      }
      if (ball.y - BALL_RADIUS < 0) {
        ball.dy = -ball.dy;
        ball.isPiercing = false;
        ball.consecutiveWallHits = (ball.consecutiveWallHits || 0) + 1;
        audioService.playSfx('wall');
      }

      // Anti-loop logic
      if ((ball.consecutiveWallHits || 0) > 6) {
        // Ball is likely bouncing between walls/ceiling too much
        // Force it down with a significant impulse if it's high up
        if (ball.y < 150) {
          ball.dy = 4 + Math.random() * 2;
          ball.dx += (Math.random() - 0.5) * 2;
        } else {
          // Just add random variation if elsewhere
          ball.dy += (Math.random() - 0.5) * 2;
          ball.dx += (Math.random() - 0.5) * 2;
        }
        ball.consecutiveWallHits = 0;
      }
      // Too horizontal/vertical loop fix
      if (Math.abs(ball.dy) < 1.0) ball.dy = ball.dy > 0 ? 1.0 : -1.0; // Increased min vertical speed
      if (Math.abs(ball.dx) < 1.0) ball.dx = ball.dx > 0 ? 1.0 : -1.0;

      // Floor collision
      if (hasFloor && ball.y + BALL_RADIUS > GAME_HEIGHT - 10) {
        ball.dy = -Math.abs(ball.dy);
        audioService.playSfx('paddle');
      }

      // Warp Gate (Teleport) collision
      physicalObjectsRef.current.forEach(obj => {
        if (obj.type === 'WARP_GATE') {
          const dx = ball.x - obj.x;
          const dy = ball.y - obj.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < obj.radius + BALL_RADIUS) {
            const target = physicalObjectsRef.current.find(o => o.id === obj.targetId);
            const now = Date.now();
            const lastInteraction = ball.lastInteractionFrame || 0;
            
            // Cool-down to prevent infinite ping-pong
            if (target && now - lastInteraction > 500) {
              ball.x = target.x;
              ball.y = target.y;
              ball.lastInteractionFrame = now;
              audioService.playSfx('powerup');
              spawnParticles(obj.x, obj.y, '#00ffff');
              spawnParticles(target.x, target.y, '#00ffff');
            }
          }
        }
      });

      // (Redundant block removed, interaction handled below)

      // Paddle collision
      if (
        ball.dy > 0 && 
        ball.y + BALL_RADIUS > GAME_HEIGHT - PADDLE_HEIGHT - 5 && // Visual buffer
        ball.y + BALL_RADIUS < GAME_HEIGHT && 
        ball.x > paddle.x - 5 &&
        ball.x < paddle.x + paddle.width + 5
      ) {
        if (activePowerUps.has(PowerUpType.GLUE)) {
          ball.isStuck = true;
          ball.stuckOffset = ball.x - paddle.x;
        } else {
          // Accurate reflection physics: angle based on hit position
          // Normalized hit position from -1 to 1
          const relativeHitX = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
          
          // Max bounce angle is 75 degrees
          const maxBounceAngle = (75 * Math.PI) / 180;
          const bounceAngle = relativeHitX * maxBounceAngle;
          
          const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          ball.dx = speed * Math.sin(bounceAngle);
          ball.dy = -speed * Math.cos(bounceAngle);
          
          // Move ball outside paddle to prevent multi-hit logic errors
          ball.y = GAME_HEIGHT - PADDLE_HEIGHT - BALL_RADIUS - 5;
          
          // Ensure min horizontal velocity to avoid purely vertical paths
          if (Math.abs(ball.dx) < 1.0) ball.dx = ball.dx > 0 ? 1.0 : -1.0;
          
          ball.isPiercing = false;
          ball.consecutiveWallHits = 0;
          ball.spin = (paddleVelocity * 0.08); // Reduced spin influence for stability
          setEnergy(e => Math.min(100, e + 5));
        }
        audioService.playSfx('paddle');
        setPaddleShake(4);
      }

      // Ghost Paddle collision
      const ghostY = GAME_HEIGHT - PADDLE_HEIGHT - 200;
      if (
        ghostPaddleActive &&
        ball.dy > 0 &&
        ball.y + BALL_RADIUS > ghostY &&
        ball.y - BALL_RADIUS < ghostY + PADDLE_HEIGHT &&
        ball.x + BALL_RADIUS > paddle.x - 20 &&
        ball.x - BALL_RADIUS < paddle.x + paddle.width + 20
      ) {
        const hitPos = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
        ball.dx = hitPos * INITIAL_BALL_SPEED * 1.5;
        ball.dy = -Math.abs(ball.dy);
        ball.isPiercing = false;
        ball.consecutiveWallHits = 0;
        audioService.playSfx('paddle');
        setPaddleShake(2);
      }

      // Brick collisions - Optimized: use spatial partitioning (simple Y-grid)
      const ballY = ball.y;
      const ballX = ball.x;
      const relevantBricks = bricksRef.current.filter(brick => 
        brick.active && 
        ballY + BALL_RADIUS + 5 > brick.y && 
        ballY - BALL_RADIUS - 5 < brick.y + brick.height &&
        ballX + BALL_RADIUS + 5 > brick.x &&
        ballX - BALL_RADIUS - 5 < brick.x + brick.width
      );

      let collidedThisFrame = false;
      for (const brick of relevantBricks) {
        // Simple bounding box check (very fast)
        if (
          ball.x + BALL_RADIUS > brick.x &&
          ball.x - BALL_RADIUS < brick.x + brick.width &&
          ball.y + BALL_RADIUS > brick.y &&
          ball.y - BALL_RADIUS < brick.y + brick.height
        ) {
          // Normal balls only hit one brick per frame to prevent rebound glitches
          if (!ball.isFireball && !ball.isPiercing && collidedThisFrame) continue;
          
          // Identify collision side by finding the shallowest penetration
          const overlapLeft = (ball.x + BALL_RADIUS) - brick.x;
          const overlapRight = (brick.x + brick.width) - (ball.x - BALL_RADIUS);
          const overlapTop = (ball.y + BALL_RADIUS) - brick.y;
          const overlapBottom = (brick.y + brick.height) - (ball.y - BALL_RADIUS);
          
          const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
          
          collidedThisFrame = true;
          
          if (!brick.indestructible) {
            // Invisible bricks reveal on first hit
            if (brick.type === 'INVISIBLE' && !brick.revealed) {
              brick.revealed = true;
              audioService.playSfx('wall');
              
              // Still need to bounce
              if (minOverlap === overlapLeft || minOverlap === overlapRight) {
                ball.dx *= -1;
                ball.x = minOverlap === overlapLeft ? brick.x - BALL_RADIUS : brick.x + brick.width + BALL_RADIUS;
              } else {
                ball.dy *= -1;
                ball.y = minOverlap === overlapTop ? brick.y - BALL_RADIUS : brick.y + brick.height + BALL_RADIUS;
              }
              return; 
            }

            // New Brick Types Logic
            if (brick.type === 'GHOST') {
              brick.hits = 0; // Destroy immediately
              brick.active = false;
              setScore(s => s + 15);
              spawnParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, 'rgba(255,255,255,0.5)');
              audioService.playSfx('wall');
              continue; // Pass through: no bounce
            }

            if (brick.type === 'FIRE') {
              applyPowerUp(PowerUpType.FIREBALL);
              audioService.playVoice("Fire energy!");
            }

            if (brick.type === 'ICE') {
              applyPowerUp(PowerUpType.SLOW_BALL);
              audioService.playVoice("Freezing impact!");
            }

            if (brick.type === 'PORTAL') {
              audioService.playSfx('portal');
              const otherPortals = bricksRef.current.filter(b => b.active && b.type === 'PORTAL' && b !== brick);
              if (otherPortals.length > 0) {
                const target = otherPortals[Math.floor(Math.random() * otherPortals.length)];
                ball.x = target.x + target.width / 2;
                ball.y = target.y + target.height / 2;
                // Move ball outside target to avoid immediate re-teleport
                ball.y += ball.dy > 0 ? target.height : -target.height;
                spawnParticles(brick.x + brick.width/2, brick.y + brick.height/2, '#aa00ff');
                spawnParticles(target.x + target.width/2, target.y + target.height/2, '#aa00ff');
              }
            }

            // Slime brick: ball sticks and slides
            if (brick.type === 'SLIME') {
              applyPowerUp(PowerUpType.SLOW_BALL);
              audioService.playVoice("Slime impact!");
              spawnParticles(ball.x, ball.y, '#33ff33');
            }

            brick.hits--;
            if (brick.hits <= 0) {
              brick.active = false;
              setScore(s => s + 10);
              spawnParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color);
              spawnPowerUp(brick.x + brick.width / 2, brick.y + brick.height / 2);
              audioService.playBreakSound();

              // TNT Explosion - BRUTAL VERSION
              if (brick.type === 'TNT') {
                const blastRadius = 180; // Massive radius
                
                // Clear Bricks (including indestructible)
                bricksRef.current.forEach(otherBrick => {
                  if (otherBrick.active) {
                    const bDx = otherBrick.x + otherBrick.width/2 - (brick.x + brick.width/2);
                    const bDy = otherBrick.y + otherBrick.height/2 - (brick.y + brick.height/2);
                    const bDist = Math.sqrt(bDx*bDx + bDy*bDy);
                    if (bDist < blastRadius) {
                      otherBrick.active = false;
                      setScore(s => s + 5);
                      spawnParticles(otherBrick.x + otherBrick.width/2, otherBrick.y + otherBrick.height/2, otherBrick.color);
                      // Extra particles for "brutality"
                      if (Math.random() > 0.5) spawnParticles(otherBrick.x + otherBrick.width/2, otherBrick.y + otherBrick.height/2, '#ffffff');
                      audioService.playBreakSound(); // Added missing sound
                    }
                  }
                });

                // Clear Physical Objects (Obstacles)
                physicalObjectsRef.current = physicalObjectsRef.current.filter(obj => {
                  if (obj.type === 'WARP_GATE') return true; // Keep warps? 
                  const oDx = obj.x - (brick.x + brick.width/2);
                  const oDy = obj.y - (brick.y + brick.height/2);
                  const oDist = Math.sqrt(oDx*oDx + oDy*oDy);
                  if (oDist < blastRadius + 20) {
                    spawnParticles(obj.x, obj.y, '#ffffff');
                    spawnParticles(obj.x, obj.y, '#aaaaaa');
                    return false;
                  }
                  return true;
                });

                audioService.playSfx('explosion');
                setBrickShake(35);
                
                // Add a shockwave effect (using existing particles for now or a new system if I add it)
                for(let i=0; i<40; i++) {
                  const angle = (i / 40) * Math.PI * 2;
                  const speed = 10 + Math.random() * 15;
                  particlesRef.current.push({
                    x: brick.x + brick.width/2,
                    y: brick.y + brick.height/2,
                    dx: Math.cos(angle) * speed,
                    dy: Math.sin(angle) * speed,
                    color: i % 2 === 0 ? '#ff3300' : '#ffff00',
                    life: 1.0,
                    size: 4 + Math.random() * 6
                  });
                }
              }
              
              // Chain Reaction
              if (brick.resonates) {
                const resonateColor = brick.color;
                bricksRef.current.forEach(otherBrick => {
                  if (otherBrick.active && otherBrick.color === resonateColor && !otherBrick.indestructible) {
                    const dx = otherBrick.x + otherBrick.width/2 - (brick.x + brick.width/2);
                    const dy = otherBrick.y + otherBrick.height/2 - (brick.y + brick.height/2);
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < 150) {
                      setTimeout(() => {
                        if (otherBrick.active) {
                          otherBrick.active = false;
                          setScore(s => s + 10);
                          spawnParticles(otherBrick.x + otherBrick.width/2, otherBrick.y + otherBrick.height/2, otherBrick.color);
                          audioService.playBreakSound();
                        }
                      }, 200);
                    }
                  }
                });
              }

              if (hasExplosion) {
                const explosionRadius = 80;
                bricksRef.current.forEach(otherBrick => {
                  if (otherBrick.active && !otherBrick.indestructible) {
                    const dx = otherBrick.x + otherBrick.width/2 - (brick.x + brick.width/2);
                    const dy = otherBrick.y + otherBrick.height/2 - (brick.y + brick.height/2);
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < explosionRadius) {
                      otherBrick.active = false;
                      setScore(s => s + 5);
                      spawnParticles(otherBrick.x + otherBrick.width/2, otherBrick.y + otherBrick.height/2, otherBrick.color);
                      audioService.playBreakSound();
                    }
                  }
                });
                setBrickShake(8);
                audioService.playSfx('explosion');
              }
            }
          } else {
            // Indestructible brick hit
            audioService.playSfx('wall');
          }
          
          if (!ball.isFireball || brick.indestructible) {
            if (ball.isPiercing && !brick.indestructible) {
              // Pass through only destructible bricks
            } else {
              // Proper bounce response: Detect side better
              const ballPrevX = ball.x - (ball.dx * delta / 16.6); // Approximate prev pos
              const ballPrevY = ball.y - (ball.dy * delta / 16.6);

              const hitLeft = ballPrevX + BALL_RADIUS <= brick.x;
              const hitRight = ballPrevX - BALL_RADIUS >= brick.x + brick.width;
              const hitTop = ballPrevY + BALL_RADIUS <= brick.y;
              const hitBottom = ballPrevY - BALL_RADIUS >= brick.y + brick.height;

              if (hitLeft || hitRight) {
                ball.dx *= -1;
                ball.x = hitLeft ? brick.x - BALL_RADIUS : brick.x + brick.width + BALL_RADIUS;
              } else if (hitTop || hitBottom) {
                ball.dy *= -1;
                ball.y = hitTop ? brick.y - BALL_RADIUS : brick.y + brick.height + BALL_RADIUS;
              } else {
                // Fallback to minimal overlap if previous pos was already inside or ambiguous
                if (minOverlap === overlapLeft || minOverlap === overlapRight) {
                  ball.dx = Math.abs(ball.dx) * (minOverlap === overlapLeft ? -1 : 1);
                  ball.x = minOverlap === overlapLeft ? brick.x - BALL_RADIUS : brick.x + brick.width + BALL_RADIUS;
                } else {
                  ball.dy = Math.abs(ball.dy) * (minOverlap === overlapTop ? -1 : 1);
                  ball.y = minOverlap === overlapTop ? brick.y - BALL_RADIUS : brick.y + brick.height + BALL_RADIUS;
                }
              }
              
              if (!brick.indestructible) {
                ball.consecutiveWallHits = 0; // Reset anti-loop on destructible brick hit
              }
              // If it hits an indestructible brick, it's no longer piercing
              if (brick.indestructible) ball.isPiercing = false;
            }
          }
          
          audioService.playSfx('hit');
          setBrickShake(4);
        }
      }
    });

    // Remove balls that fall out
    ballsRef.current = ballsRef.current.filter(ball => ball.y - BALL_RADIUS < GAME_HEIGHT);

    // Bottom collision (Lose life if no balls left)
    if (ballsRef.current.length === 0 && !isRespawning && gameState === 'PLAYING') {
      handleLifeLost();
    }

    // Physical Objects Interaction
    const now = Date.now();
    ballsRef.current.forEach(ball => {
      physicalObjectsRef.current.forEach(obj => {
        // Crusher Logic
        if (obj.type === 'CRUSHER') {
          const movePeriod = 2000;
          const timeOffset = obj.lastMoveTime || 0;
          const phase = ((now + timeOffset) % movePeriod) / movePeriod;
          
          if (phase < 0.5) {
            obj.state = 'EXTENDED';
            // Animation for visual
            obj.rotation = (phase * 2) * 50; // Increased extension 0-50
          } else {
            obj.state = 'RETRACTED';
            obj.rotation = ((1 - phase) * 2) * 50;
          }

          // Box Collision for Crusher
          const crusherY = obj.y - (obj.rotation || 0);
          const cX = obj.x - (obj.width! / 2);
          const cY = crusherY;
          const cW = obj.width!;
          const cH = obj.height!;

          if (
            ball.x + BALL_RADIUS > cX &&
            ball.x - BALL_RADIUS < cX + cW &&
            ball.y + BALL_RADIUS > cY &&
            ball.y - BALL_RADIUS < cY + cH
          ) {
            // Determine side of collision for proper bounce
            const overlapX = Math.min(ball.x + BALL_RADIUS - cX, cX + cW - (ball.x - BALL_RADIUS));
            const overlapY = Math.min(ball.y + BALL_RADIUS - cY, cY + cH - (ball.y - BALL_RADIUS));

            if (overlapX < overlapY) {
              ball.dx = ball.x < obj.x ? -Math.abs(ball.dx) : Math.abs(ball.dx);
              ball.x += (ball.dx < 0 ? -1 : 1) * (overlapX + 2);
            } else {
              ball.dy = ball.y < cY + cH/2 ? -Math.abs(ball.dy) : Math.abs(ball.dy);
              ball.y += (ball.dy < 0 ? -1 : 1) * (overlapY + 2);
            }
            
            audioService.playSfx('wall');
            setPaddleShake(2);
          }
        }

        // Conveyor Logic
        if (obj.type === 'CONVEYOR') {
          const cX = obj.x - (obj.width! / 2);
          const cY = obj.y;
          const cW = obj.width!;
          const cH = obj.height!;

          if (
            ball.x + BALL_RADIUS > cX &&
            ball.x - BALL_RADIUS < cX + cW &&
            ball.y + BALL_RADIUS > cY &&
            ball.y - BALL_RADIUS < cY + cH
          ) {
            const driftSpeed = 2.0;
            ball.dx += obj.direction === 'LEFT' ? -driftSpeed : driftSpeed;
            
            // Standard AABB bounce
            const overlapX = Math.min(ball.x + BALL_RADIUS - cX, cX + cW - (ball.x - BALL_RADIUS));
            const overlapY = Math.min(ball.y + BALL_RADIUS - cY, cY + cH - (ball.y - BALL_RADIUS));

            if (overlapX < overlapY) {
              ball.dx = ball.x < obj.x ? -Math.abs(ball.dx) : Math.abs(ball.dx);
              ball.x += (ball.dx < 0 ? -1 : 1) * (overlapX + 2);
            } else {
              ball.dy = ball.y < cY + cH/2 ? -Math.abs(ball.dy) : Math.abs(ball.dy);
              ball.y += (ball.dy < 0 ? -1 : 1) * (overlapY + 2);
            }
            
            audioService.playSfx('wall');
          }
        }

        const dx = ball.x - obj.x;
        const dy = ball.y - obj.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        // Interaction range varies by object type
        const sensorRange = obj.radius + BALL_RADIUS + (obj.type === 'FAN' ? 30 : (obj.type === 'MAGNET' ? 100 : 0));
        
        if (dist < sensorRange) {
          const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          
          // Solid collision for GEAR only (Fans/Magnets are traversable fields)
          if (obj.type === 'GEAR') {
            const solidRadius = obj.radius + BALL_RADIUS;
            if (dist < solidRadius && dist > 0.1) {
              const nx = dx / dist;
              const ny = dy / dist;
              const dot = ball.dx * nx + ball.dy * ny;
              
              if (dot < 0) {
                ball.dx = ball.dx - 2 * dot * nx;
                ball.dy = ball.dy - 2 * dot * ny;
                
                // Rotation/Friction kick
                const kick = 0.5;
                ball.dx += -ny * kick;
                ball.dy += nx * kick;

                // Anti-stick push
                const overlap = solidRadius - dist;
                ball.x += nx * (overlap + 1);
                ball.y += ny * (overlap + 1);

                audioService.playSfx('wall');
              }
            }
          }

          if (obj.type === 'FAN') {
            const pushForce = 0.3 * (1 - dist / sensorRange);
            const angle = Math.atan2(dy, dx);
            ball.dx += Math.cos(angle) * pushForce;
            ball.dy += Math.sin(angle) * pushForce;
          } else if (obj.type === 'MAGNET') {
            const pullForce = (obj.strength || 0.25) * (1 - dist / sensorRange);
            const angle = Math.atan2(obj.y - ball.y, obj.x - ball.x);
            ball.dx += Math.cos(angle) * pullForce;
            ball.dy += Math.sin(angle) * pullForce;
          }
        }
      });
    });

    // Physical Objects Update & Movement
    physicalObjectsRef.current.forEach((obj, idx) => {
      if (obj.type !== 'WARP_GATE' && level >= 3) {
        const baseSpeed = 0.85;
        const isLeft = obj.x < GAME_WIDTH / 2;
        
        // Symmetric movement: left side moves normally, right side is mirrored
        const vx = Math.cos(now / 1300) * baseSpeed * (isLeft ? 1 : -1);
        const vy = Math.sin(now / 1600) * baseSpeed;
        
        const oldX = obj.x;
        const oldY = obj.y;
        
        obj.x += vx * speedMultiplier;
        obj.y += vy * speedMultiplier;
        
        // Brick Collision (Avoid overlapping with bricks)
        let collision = false;
        bricksRef.current.forEach(brick => {
          if (!brick.active || collision) return;
          
          // Simple circle-rect collision
          const closestX = Math.max(brick.x, Math.min(obj.x, brick.x + brick.width));
          const closestY = Math.max(brick.y, Math.min(obj.y, brick.y + brick.height));
          const distance = Math.sqrt((obj.x - closestX) ** 2 + (obj.y - closestY) ** 2);
          
          if (distance < obj.radius) {
            collision = true;
          }
        });

        if (collision) {
          obj.x = oldX;
          obj.y = oldY;
        }

        // Inter-object collision (Physics)
        for (let j = idx + 1; j < physicalObjectsRef.current.length; j++) {
          const other = physicalObjectsRef.current[j];
          if (other.type === 'WARP_GATE') continue;
          
          const dx = other.x - obj.x;
          const dy = other.y - obj.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const minDistance = obj.radius + other.radius;
          
          if (distance < minDistance && distance > 0) {
            const overlap = minDistance - distance;
            const nx = dx / distance;
            const ny = dy / distance;
            
            // Push apart
            obj.x -= nx * (overlap / 2);
            obj.y -= ny * (overlap / 2);
            other.x += nx * (overlap / 2);
            other.y += ny * (overlap / 2);
          }
        }

        // Rotation for gears/fans: Mirrored direction
        if (obj.rotation !== undefined) {
          obj.rotation += 0.06 * speedMultiplier * (isLeft ? 1 : -1);
        }

        // Keep within bounds
        if (obj.x < 50) obj.x = 50;
        if (obj.x > GAME_WIDTH - 50) obj.x = GAME_WIDTH - 50;
        if (obj.y < 100) obj.y = 100;
        if (obj.y > 600) obj.y = 600;
      }
    });

    // Stars
    starsRef.current.forEach(star => {
      star.y += star.speed * speedMultiplier;
      if (star.y > GAME_HEIGHT) star.y = 0;
    });

    // Particles - Optimized for performance
    if (particlesRef.current.length > 0) {
      // Limit total particles to 150 for performance
      if (particlesRef.current.length > 150) {
        particlesRef.current = particlesRef.current.slice(-150);
      }
      
      particlesRef.current = particlesRef.current.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.025; // Faster fade
        return p.life > 0;
      });
    }

    // Power-ups timers update
    if (gameState === 'PLAYING') {
      setActivePowerUps(prev => {
        const next = new Map<PowerUpType, number>(prev);
        let changed = false;
        for (const [type, time] of next.entries()) {
          const t = Number(time);
          if (t > 0) {
            const newTime = t - Number(delta);
            if (newTime <= 0) {
              // Revert effects
              if (type === PowerUpType.WIDE_PADDLE) paddleRef.current.width = Math.max(70, PADDLE_WIDTH - (level * 0.3));
              if (type === PowerUpType.LASER) paddleRef.current.hasLaser = false;
              if (type === PowerUpType.FIREBALL) {
                ballsRef.current.forEach(b => b.isFireball = false);
                setIsFireballActive(false);
              }
              if (type === PowerUpType.FLOOR) setHasFloor(false);
              if (type === PowerUpType.EXPLOSION) setHasExplosion(false);
              if (type === PowerUpType.BLACK_HOLE) {
                ballsRef.current.forEach(b => b.isBlackHole = false);
                setIsBlackHoleActive(false);
              }
              if (type === PowerUpType.GHOST_PADDLE) setGhostPaddleActive(false);
              if (type === PowerUpType.SLOW_BALL) {
                ballsRef.current.forEach(b => {
                  b.dx /= 0.5;
                  b.dy /= 0.5;
                });
              }
              if (type === PowerUpType.FAST_BALL) {
                ballsRef.current.forEach(b => {
                  b.dx /= 1.4;
                  b.dy /= 1.4;
                });
              }
              next.delete(type);
            } else {
              next.set(type, newTime);
            }
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }

    // Power-ups update - Optimized loop
    const puCount = powerUpsRef.current.length;
    for (let i = puCount - 1; i >= 0; i--) {
      const pu = powerUpsRef.current[i];
      if (!pu.active) continue;
      pu.y += (pu.speed || POWERUP_SPEED) * speedMultiplier;

      // Catch power-up
      const caughtY = GAME_HEIGHT - PADDLE_HEIGHT;
      const ghostY = GAME_HEIGHT - PADDLE_HEIGHT - 200;
      const isCaughtByPaddle = pu.y + POWERUP_HEIGHT > caughtY &&
                               pu.x + POWERUP_WIDTH > paddle.x &&
                               pu.x < paddle.x + paddle.width;
      const isCaughtByGhost = ghostPaddleActive && 
                              pu.y + POWERUP_HEIGHT > ghostY &&
                              pu.y < ghostY + PADDLE_HEIGHT &&
                              pu.x + POWERUP_WIDTH > paddle.x - 20 &&
                              pu.x < paddle.x + paddle.width + 20;
      
      if (isCaughtByPaddle || isCaughtByGhost) {
        pu.active = false;
        applyPowerUp(pu.type);
      } else if (pu.y > GAME_HEIGHT) {
        pu.active = false;
      }
    }

    // Lasers update
    if (paddle.hasLaser) {
      const now = Date.now();
      if (now - lastLaserTimeRef.current > 500) {
        lasersRef.current.push({ x: paddle.x + 10, y: GAME_HEIGHT - PADDLE_HEIGHT, active: true });
        lasersRef.current.push({ x: paddle.x + paddle.width - 10, y: GAME_HEIGHT - PADDLE_HEIGHT, active: true });
        lastLaserTimeRef.current = now;
        audioService.playSfx('laser');
        paddleRef.current.fireTimer = 200; // Trigger firing pulse
      }
    }

    lasersRef.current.forEach(laser => {
      if (!laser.active) return;
      laser.y -= LASER_SPEED * speedMultiplier;
      if (laser.y < 0) laser.active = false;

      // Laser-brick collision
      bricksRef.current.forEach(brick => {
        if (!brick.active || brick.indestructible) return;
        if (
          laser.x > brick.x &&
          laser.x < brick.x + brick.width &&
          laser.y > brick.y &&
          laser.y < brick.y + brick.height
        ) {
          brick.hits--;
          if (brick.hits <= 0) {
            brick.active = false;
            setScore(s => s + 10);
            spawnParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color);
            spawnPowerUp(brick.x + brick.width / 2, brick.y + brick.height / 2);
            audioService.playBreakSound();
          }
          laser.active = false;
          audioService.playSfx('hit');
          setBrickShake(2);
        }
      });

      // Laser-obstacle collision (Bulletproof obstacles)
      if (laser.active) {
        physicalObjectsRef.current.forEach(obj => {
          if (!laser.active) return;
          
          if (obj.type === 'GEAR' || obj.type === 'FAN' || obj.type === 'MAGNET' || obj.type === 'CRUSHER' || obj.type === 'CONVEYOR') {
            let hit = false;
            if (obj.width && obj.height) {
              const objY = obj.type === 'CRUSHER' ? obj.y - (obj.rotation || 0) : obj.y;
              if (
                laser.x > obj.x - obj.width/2 &&
                laser.x < obj.x + obj.width/2 &&
                laser.y > obj.y &&
                laser.y < obj.y + obj.height
              ) {
                hit = true;
              }
            } else {
              const dx = laser.x - obj.x;
              const dy = laser.y - obj.y;
              if (Math.sqrt(dx*dx + dy*dy) < obj.radius) {
                hit = true;
              }
            }
            
            if (hit) {
              laser.active = false;
              audioService.playSfx('wall');
              spawnParticles(laser.x, laser.y, '#ffffff');
            }
          }
        });
      }
    });

    // Check for level complete
    const activeBricks = bricksRef.current.filter(b => b.active && !b.indestructible).length;
    if (activeBricks === 0 && !isInfiniteMode) {
      nextLevel();
    }

    // Infinite Mode logic
    if (isInfiniteMode && frameCountRef.current % 300 === 0) {
      bricksRef.current.forEach(brick => {
        brick.y += 20;
        if (brick.y > GAME_HEIGHT - 100 && brick.active) {
          setGameState('GAMEOVER');
        }
      });
      // Spawn new row
      for (let c = 0; c < 20; c++) {
        bricksRef.current.push({
          x: c * (50) + 40,
          y: 80,
          width: 46,
          height: 20,
          color: COLORS.bricks[Math.floor(Math.random() * COLORS.bricks.length)],
          active: true,
          hits: 1,
          type: 'NORMAL'
        });
      }
    }
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    if (level === 3) {
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    } else {
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    // Atari 800 Raster Bars (Level 3 only)
    if (level === 3) {
      ctx.save();
      const time = Date.now() / 1000;
      const barCount = 12;
      const barWidth = 40; // Width of the bars on the sides
      
      for (let i = 0; i < barCount; i++) {
        const y = (Math.sin(time + i * 0.5) * 0.5 + 0.5) * GAME_HEIGHT;
        const color = `hsl(${(time * 100 + i * 30) % 360}, 100%, 50%)`;
        
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6;
        
        // Left side bars
        ctx.fillRect(0, y, barWidth, 4);
        ctx.fillRect(0, y + 10, barWidth, 2);
        
        // Right side bars
        ctx.fillRect(GAME_WIDTH - barWidth, y, barWidth, 4);
        ctx.fillRect(GAME_WIDTH - barWidth, y + 10, barWidth, 2);
      }
      ctx.restore();
    }

    // Draw Background Image
    if (bgImage && level !== 3) {
      ctx.globalAlpha = 0.7; // Increased from 0.4
      ctx.drawImage(bgImage, 0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.globalAlpha = 1.0;
    }

    // Draw Grid (Amiga style) - Moved here to be behind bricks
    if (level !== 3) {
      ctx.save();
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      for (let x = 0; x < GAME_WIDTH; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, GAME_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y < GAME_HEIGHT; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(GAME_WIDTH, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw Stars (For level 3, we draw them later with destination-over)
    if (level !== 3) {
      ctx.fillStyle = '#ffffff';
      starsRef.current.forEach(star => {
        ctx.globalAlpha = star.speed * 2;
        ctx.fillRect(star.x, star.y, star.size, star.size);
      });
      ctx.globalAlpha = 1.0;
    }

    // Screen Shake START - Only for bricks and action elements
    ctx.save();
    if (brickShake > 0) {
      ctx.translate((Math.random() - 0.5) * brickShake * 2, (Math.random() - 0.5) * brickShake * 2);
    }

    // Draw Bricks
    bricksRef.current.forEach(brick => {
      if (!brick.active) return;

      // Invisible bricks logic
      if (brick.type === 'INVISIBLE' && !brick.revealed) {
        // Very faint outline or nothing
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
        ctx.restore();
        return;
      }
      
      // Resonating effect (draw before brick)
      if (brick.resonates) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        const pulse = Math.sin(Date.now() / 100) * 2;
        ctx.strokeRect(brick.x - pulse, brick.y - pulse, brick.width + pulse * 2, brick.height + pulse * 2);
        ctx.restore();
      }

      if (level === 3) {
        // 8-bit style: flat color
        ctx.shadowBlur = 0;
        ctx.fillStyle = brick.color;
        ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
        
        if (brick.indestructible) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.strokeRect(brick.x + 2, brick.y + 2, brick.width - 4, brick.height - 4);
        }
      } else {
        // Neon Glow (AGA style)
        if (brick.indestructible) {
          // Metallic look for indestructible bricks
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#ffffff';
          
          const grad = ctx.createLinearGradient(brick.x, brick.y, brick.x + brick.width, brick.y + brick.height);
          grad.addColorStop(0, '#e0e0e0');
          grad.addColorStop(0.5, '#ffffff');
          grad.addColorStop(1, '#808080');
          ctx.fillStyle = grad;
          ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
          
          // Rivets
          ctx.fillStyle = '#404040';
          ctx.fillRect(brick.x + 4, brick.y + 4, 2, 2);
          ctx.fillRect(brick.x + brick.width - 6, brick.y + 4, 2, 2);
          ctx.fillRect(brick.x + 4, brick.y + brick.height - 6, 2, 2);
          ctx.fillRect(brick.x + brick.width - 6, brick.y + brick.height - 6, 2, 2);
          
          ctx.shadowBlur = 0;
        } else {
          ctx.shadowBlur = 15;
          ctx.shadowColor = brick.color;
          
          // Brick body with gradient
          const grad = ctx.createLinearGradient(brick.x, brick.y, brick.x, brick.y + brick.height);
          grad.addColorStop(0, brick.color);
          grad.addColorStop(1, 'rgba(0,0,0,0.5)');
          ctx.fillStyle = grad;
          ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
          
          if (brick.hits > 1) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(brick.x + 2, brick.y + 2, brick.width - 4, brick.height - 4);
          }
          
          ctx.shadowBlur = 0; // Reset for details
          
          // Brick highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.fillRect(brick.x, brick.y, brick.width, 3);
          ctx.fillRect(brick.x, brick.y, 3, brick.height);
          
          // Brick shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(brick.x + brick.width - 3, brick.y, 3, brick.height);
          ctx.fillRect(brick.x, brick.y + brick.height - 3, brick.width, 3);
  
          // Inner glow
          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.strokeRect(brick.x + 4, brick.y + 4, brick.width - 8, brick.height - 8);
        }

        // Special types visual overlay
        if (brick.type === 'TNT') {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('TNT', brick.x + 10, brick.y + 14);
          // Fuse animation
          ctx.strokeStyle = '#ffcc00';
          ctx.beginPath();
          ctx.moveTo(brick.x + brick.width - 5, brick.y + 5);
          ctx.lineTo(brick.x + brick.width - 2, brick.y - 2);
          ctx.stroke();
        } else if (brick.type === 'SLIME') {
          ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
          const drip = Math.sin(Date.now() / 300) * 5;
          ctx.fillRect(brick.x + 5, brick.y + 10, 10, 5 + drip);
          ctx.fillRect(brick.x + brick.width - 15, brick.y + 10, 10, 5 + Math.cos(Date.now() / 400) * 5);
        } else if (brick.type === 'PORTAL') {
          // Swirling vortex for portal
          ctx.save();
          ctx.translate(brick.x + brick.width / 2, brick.y + brick.height / 2);
          ctx.rotate(Date.now() / 200);
          ctx.strokeStyle = '#ff00ff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 1.5);
          ctx.stroke();
          ctx.restore();
        } else if (brick.type === 'FIRE') {
          // Flickering flames
          const flicker = Math.random() * 5;
          ctx.fillStyle = '#ff3300';
          ctx.beginPath();
          ctx.moveTo(brick.x + 5, brick.y + brick.height - 2);
          ctx.lineTo(brick.x + brick.width / 2, brick.y + 2 + flicker);
          ctx.lineTo(brick.x + brick.width - 5, brick.y + brick.height - 2);
          ctx.fill();
        } else if (brick.type === 'ICE') {
          // Crystal look
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(brick.x, brick.y);
          ctx.lineTo(brick.x + brick.width, brick.y + brick.height);
          ctx.moveTo(brick.x + brick.width, brick.y);
          ctx.lineTo(brick.x, brick.y + brick.height);
          ctx.stroke();
        } else if (brick.type === 'GHOST') {
          // Ghostly pulse
          ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 200) * 0.2;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.strokeRect(brick.x + 2, brick.y + 2, brick.width - 4, brick.height - 4);
          ctx.globalAlpha = 1.0;
        }
      }

      // Final tactical score display logic below...
    });

    // Paint Atari Logo and Text over bricks (Level 3 only)
    if (level === 3) {
      // Draw background behind bricks (Level 3 only)
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      
      if (level3BgImage) {
        ctx.drawImage(level3BgImage, 0, 0, GAME_WIDTH, GAME_HEIGHT);
      } else {
        ctx.fillStyle = '#000000'; // Solid black background
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        
        // Minimal stars for deep space feel
        ctx.fillStyle = '#ffffff';
        starsRef.current.slice(0, 25).forEach(star => {
          ctx.globalAlpha = star.speed * 0.5;
          ctx.fillRect(star.x, star.y, star.size, star.size);
        });
      }
      ctx.restore();

      // Draw brick details (Level 3 only)
      bricksRef.current.forEach(brick => {
        if (!brick.active || level !== 3) return;
        
        // Crisp 8-bit highlights/shadows
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(brick.x, brick.y, brick.width, 2);
        ctx.fillRect(brick.x, brick.y, 2, brick.height);
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(brick.x, brick.y + brick.height - 2, brick.width, 2);
        ctx.fillRect(brick.x + brick.width - 2, brick.y, 2, brick.height);
      });
    }

    // Draw Particles
    particlesRef.current.forEach(p => {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      if (level === 3) {
        ctx.shadowBlur = 0;
      } else {
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
      }
      ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;

    // Screen Shake END
    ctx.restore();

    // Draw Floor if active (Independent of shake)
    if (hasFloor) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.4)';
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#3b82f6';
      ctx.fillRect(0, GAME_HEIGHT - 10, GAME_WIDTH, 10);
      ctx.shadowBlur = 0;
      
      // Floor pulse effect
      const floorPulse = Math.sin(Date.now() / 200) * 0.2 + 0.4;
      ctx.fillStyle = `rgba(255, 255, 255, ${floorPulse})`;
      ctx.fillRect(0, GAME_HEIGHT - 10, GAME_WIDTH, 2);
    }

    // Grid drawing removed from here (moved further up)
    ctx.globalAlpha = 1.0;

    // Draw Paddle
    const paddle = paddleRef.current;
    const spawnProgress = paddle.spawnTimer > 0 ? (60 - paddle.spawnTimer) / 60 : 1;
    
    ctx.save();
    if (paddleShake > 0) {
      ctx.translate((Math.random() - 0.5) * paddleShake * 2, (Math.random() - 0.5) * paddleShake * 2);
    }
    const centerX = paddle.x + paddle.width / 2;
    const centerY = GAME_HEIGHT - PADDLE_HEIGHT / 2;
    
    ctx.translate(centerX, centerY);
    ctx.scale(spawnProgress, spawnProgress);
    ctx.translate(-centerX, -centerY);

    // Life Lost Animation (Implosion to point)
    let fadeAlpha = 1;
    if (paddle.damageTimer > 0) {
      // Implosion: scale quickly to 0, fade out
      fadeAlpha = Math.max(0, paddle.damageTimer / 1000);
      const implosionScale = Math.pow(fadeAlpha, 2.5); // Much sharper implosion
      
      ctx.translate(centerX, centerY);
      ctx.scale(implosionScale, implosionScale);
      ctx.rotate((1 - fadeAlpha) * 8); // Rapid spin
      ctx.translate(-centerX, -centerY);
      
      // Energy particles focusing inward
      if (Math.random() > 0.2) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00ff00';
        const dist = 40 * fadeAlpha;
        const angle = Math.random() * Math.PI * 2;
        ctx.fillRect(centerX + Math.cos(angle) * dist, centerY + Math.sin(angle) * dist, 3, 3);
      }
    }

    // Firing/Action Pulse
    if (paddle.fireTimer > 0) {
      const pulseScale = 1 + (paddle.fireTimer / 200) * 0.15;
      ctx.translate(centerX, centerY);
      ctx.scale(pulseScale, pulseScale);
      ctx.translate(-centerX, -centerY);
    }

    ctx.globalAlpha = Math.min(1, Math.max(0, spawnProgress * fadeAlpha));

    if (level === 3) {
      // 8-bit style
      let primaryColor = COLORS.paddle;
      
      ctx.shadowBlur = 0;
      ctx.fillStyle = primaryColor;
      ctx.fillRect(paddle.x, GAME_HEIGHT - PADDLE_HEIGHT, paddle.width, PADDLE_HEIGHT);
      
      // Simple 8-bit highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(paddle.x, GAME_HEIGHT - PADDLE_HEIGHT, paddle.width, 4);
      ctx.fillRect(paddle.x, GAME_HEIGHT - PADDLE_HEIGHT, 4, PADDLE_HEIGHT);
      
      // Simple 8-bit shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(paddle.x, GAME_HEIGHT - 4, paddle.width, 4);
      ctx.fillRect(paddle.x + paddle.width - 4, GAME_HEIGHT - PADDLE_HEIGHT, 4, PADDLE_HEIGHT);
    } else {
      // AGA style
      let basePrimary = '#00ff00';
      let baseSecondary = '#004400';
      let glowColor = '#00ff00';
      let showGuns = false;
      let showGlue = false;
      let paddleCornerRadius = 4;

      // Professional Textures & Detailing
      if (activePowerUps.has(PowerUpType.LASER)) {
        basePrimary = '#ff3333';
        baseSecondary = '#440000';
        glowColor = '#ff0000';
        showGuns = true;
        paddleCornerRadius = 0; // Sharp edges for scifi look
      } else if (activePowerUps.has(PowerUpType.GLUE)) {
        basePrimary = '#ffee00';
        baseSecondary = '#664400';
        glowColor = '#ffff00';
        showGlue = true;
        paddleCornerRadius = 12; // Very rounded for sticky look
      } else if (ghostPaddleActive) {
        basePrimary = '#8888ff';
        baseSecondary = '#222244';
        glowColor = '#aaaaff';
        paddleCornerRadius = 6;
      }

      // Draw Main Body with Beveled Look
      const paddleGrad = ctx.createLinearGradient(paddle.x, GAME_HEIGHT - PADDLE_HEIGHT, paddle.x, GAME_HEIGHT);
      paddleGrad.addColorStop(0, baseSecondary);
      paddleGrad.addColorStop(0.2, basePrimary);
      paddleGrad.addColorStop(0.3, '#ffffff'); // Glint
      paddleGrad.addColorStop(0.5, basePrimary);
      paddleGrad.addColorStop(1, baseSecondary);
      
      ctx.fillStyle = paddleGrad;
      
      // Use different shapes based on power-up
      ctx.beginPath();
      if (showGlue) {
        // Convex/Bulging ends for Glue
        const arcRadius = 14;
        ctx.moveTo(paddle.x + arcRadius, GAME_HEIGHT - PADDLE_HEIGHT);
        ctx.lineTo(paddle.x + paddle.width - arcRadius, GAME_HEIGHT - PADDLE_HEIGHT);
        ctx.quadraticCurveTo(paddle.x + paddle.width + 12, GAME_HEIGHT - PADDLE_HEIGHT/2, paddle.x + paddle.width - arcRadius, GAME_HEIGHT);
        ctx.lineTo(paddle.x + arcRadius, GAME_HEIGHT);
        ctx.quadraticCurveTo(paddle.x - 12, GAME_HEIGHT - PADDLE_HEIGHT/2, paddle.x + arcRadius, GAME_HEIGHT - PADDLE_HEIGHT);
      } else {
        ctx.roundRect(paddle.x, GAME_HEIGHT - PADDLE_HEIGHT, paddle.width, PADDLE_HEIGHT, paddleCornerRadius);
      }
      ctx.fill();

      // Mechanical Plating detail
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const px = paddle.x + (paddle.width / 4) * i;
        ctx.beginPath();
        ctx.moveTo(px, GAME_HEIGHT - PADDLE_HEIGHT + 2);
        ctx.lineTo(px, GAME_HEIGHT - 2);
        ctx.stroke();
      }

      // Laser Cannons (Detailed with Deploying Mechanical Wings)
      if (showGuns) {
        const wingDeploy = Math.min(1, (POWERUP_DURATION - (activePowerUps.get(PowerUpType.LASER) || 0)) / 500); 
        const wingAngle = wingDeploy * 0.5;
        
        ctx.save();
        ctx.fillStyle = '#333333';
        // Left Wing
        ctx.translate(paddle.x, GAME_HEIGHT - PADDLE_HEIGHT / 2);
        ctx.rotate(-wingAngle);
        ctx.beginPath();
        ctx.moveTo(0, -PADDLE_HEIGHT/2);
        ctx.lineTo(-24, -PADDLE_HEIGHT/2 + 3);
        ctx.lineTo(-24, PADDLE_HEIGHT/2 - 3);
        ctx.lineTo(0, PADDLE_HEIGHT/2);
        ctx.fill();
        // Barrel on wing
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(-22, -PADDLE_HEIGHT / 2 - 16, 5, 20);
        ctx.restore();

        ctx.save();
        ctx.fillStyle = '#333333';
        // Right Wing
        ctx.translate(paddle.x + paddle.width, GAME_HEIGHT - PADDLE_HEIGHT / 2);
        ctx.rotate(wingAngle);
        ctx.beginPath();
        ctx.moveTo(0, -PADDLE_HEIGHT/2);
        ctx.lineTo(24, -PADDLE_HEIGHT/2 + 3);
        ctx.lineTo(24, PADDLE_HEIGHT/2 - 3);
        ctx.lineTo(0, PADDLE_HEIGHT/2);
        ctx.fill();
        // Barrel on wing
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(17, -PADDLE_HEIGHT / 2 - 16, 5, 20);
        ctx.restore();
      }

      // Scifi Force Field for Glue/Sticky Mode
      if (showGlue) {
        const slimePulse = Math.sin(Date.now() / 300) * 0.5 + 0.5;
        ctx.save();
        
        // Aura glow
        ctx.globalAlpha = 0.2 + slimePulse * 0.15;
        const slimeGrad = ctx.createRadialGradient(centerX, centerY - 10, 5, centerX, centerY - 10, paddle.width / 2 + 30);
        slimeGrad.addColorStop(0, '#ffff00');
        slimeGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = slimeGrad;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY - 8, paddle.width / 2 + 20, 30, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Animated Force Ripples
        ctx.strokeStyle = 'rgba(255, 255, 100, 0.4)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const ripple = (Date.now() / 1500 + i / 3) % 1;
          const rx = paddle.width / 2 + 10 + ripple * 20;
          const ry = 15 + ripple * 15;
          ctx.beginPath();
          ctx.ellipse(centerX, centerY - 8, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Rising Particles (Sticky Vapor)
        for (let i = 0; i < 6; i++) {
          const time = (Date.now() / 1200 + i * 0.7) % 1;
          const px = paddle.x + (paddle.width * (i / 5));
          const py = GAME_HEIGHT - PADDLE_HEIGHT - (time * 25);
          ctx.fillStyle = `rgba(255, 255, 0, ${0.8 * (1 - time)})`;
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      // Internal Lights (Pulsing)
      const lightPulse = Math.sin(Date.now() / 150) * 0.5 + 0.5;
      ctx.fillStyle = showGuns ? `rgba(255, 255, 255, ${0.4 + lightPulse * 0.6})` : (showGlue ? `rgba(255, 255, 0, ${0.4 + lightPulse * 0.6})` : `rgba(255, 0, 0, ${0.4 + lightPulse * 0.6})`);
      ctx.fillRect(paddle.x + 12, GAME_HEIGHT - PADDLE_HEIGHT + 7, 8, 2);
      ctx.fillRect(paddle.x + paddle.width - 20, GAME_HEIGHT - PADDLE_HEIGHT + 7, 8, 2);

      // Final Glow effect
      ctx.shadowBlur = (20 + lightPulse * 15) * spawnProgress;
      ctx.shadowColor = glowColor;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (ghostPaddleActive && level !== 3) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      // Positioned even higher as requested
      const ghostY = GAME_HEIGHT - PADDLE_HEIGHT - 200;
      ctx.fillRect(paddle.x, ghostY, paddle.width, PADDLE_HEIGHT);
      ctx.strokeRect(paddle.x, ghostY, paddle.width, PADDLE_HEIGHT);
      ctx.restore();
    }
    
    ctx.restore();
    ctx.shadowBlur = 0;

    // Draw Physical Objects (Obstacles) - Moved BEFORE Power-ups
    if (level !== 3 || true) { // Always draw if they exist
      ctx.save();
      ctx.globalAlpha = 1.0; 
      physicalObjectsRef.current.forEach(obj => {
        ctx.save();
        ctx.translate(obj.x, obj.y);
        
        if (obj.type === 'GEAR') {
          // Realistic Gear
          const rotation = (Date.now() / 1000) % (Math.PI * 2);
          ctx.rotate(rotation);
          
          // Metallic gradient
          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, obj.radius + 10);
          grad.addColorStop(0, '#888888');
          grad.addColorStop(0.5, '#555555');
          grad.addColorStop(1, '#333333');
          
          ctx.fillStyle = grad;
          ctx.strokeStyle = '#aaaaaa';
          ctx.lineWidth = 1;
          
          // Draw teeth (12 teeth)
          const teeth = 12;
          const toothHeight = 8;
          const toothWidth = (Math.PI * 2 * obj.radius) / (teeth * 2);
          
          ctx.beginPath();
          for (let i = 0; i < teeth; i++) {
            const angle = (i * Math.PI * 2) / teeth;
            
            // Outer part of tooth
            ctx.lineTo(
              Math.cos(angle - 0.1) * (obj.radius + toothHeight),
              Math.sin(angle - 0.1) * (obj.radius + toothHeight)
            );
            ctx.lineTo(
              Math.cos(angle + 0.1) * (obj.radius + toothHeight),
              Math.sin(angle + 0.1) * (obj.radius + toothHeight)
            );
            
            // Inner part (gap)
            const nextAngle = ((i + 1) * Math.PI * 2) / teeth;
            ctx.lineTo(
              Math.cos(nextAngle - 0.2) * obj.radius,
              Math.sin(nextAngle - 0.2) * obj.radius
            );
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          // Main body circle
          ctx.beginPath();
          ctx.arc(0, 0, obj.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
          // Inner detail (spokes)
          ctx.strokeStyle = '#222222';
          ctx.lineWidth = 3;
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(
              Math.cos((i * Math.PI) / 2) * (obj.radius - 5),
              Math.sin((i * Math.PI) / 2) * (obj.radius - 5)
            );
            ctx.stroke();
          }
          
          // Center hole
          ctx.beginPath();
          ctx.arc(0, 0, obj.radius / 3, 0, Math.PI * 2);
          ctx.fillStyle = '#111111';
          ctx.fill();
          ctx.strokeStyle = '#555555';
          ctx.lineWidth = 1;
          ctx.stroke();
          
        } else if (obj.type === 'FAN') {
          // Realistic Animated Fan
          const rotation = (Date.now() / 100) % (Math.PI * 2);
          
          // Fan cage (static)
          ctx.strokeStyle = '#444444';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, obj.radius + 5, 0, Math.PI * 2);
          ctx.stroke();
          
          // Cage crossbars
          ctx.lineWidth = 1;
          for (let i = 0; i < 8; i++) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(
              Math.cos((i * Math.PI) / 4) * (obj.radius + 5),
              Math.sin((i * Math.PI) / 4) * (obj.radius + 5)
            );
            ctx.stroke();
          }
          
          // Rotating blades
          ctx.rotate(rotation);
          const blades = 3;
          for (let i = 0; i < blades; i++) {
            ctx.rotate((Math.PI * 2) / blades);
            
            const bladeGrad = ctx.createLinearGradient(0, 0, obj.radius, 0);
            bladeGrad.addColorStop(0, '#00aaff');
            bladeGrad.addColorStop(1, '#004488');
            
            ctx.fillStyle = bladeGrad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            // Curved blade shape
            ctx.bezierCurveTo(
              obj.radius / 2, -obj.radius / 2,
              obj.radius, -obj.radius / 4,
              obj.radius, 0
            );
            ctx.bezierCurveTo(
              obj.radius, obj.radius / 4,
              obj.radius / 2, obj.radius / 2,
              0, 0
            );
            ctx.fill();
            
            // Blade edge highlight
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.stroke();
          }
          
          // Central hub
          ctx.rotate(-rotation); // Hub doesn't need to rotate visually if it's a simple circle
          const hubGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
          hubGrad.addColorStop(0, '#666666');
          hubGrad.addColorStop(1, '#222222');
          ctx.fillStyle = hubGrad;
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#888888';
          ctx.stroke();
        } else if (obj.type === 'MAGNET') {
          // Retro U-Magnet
          ctx.rotate(obj.rotation || 0);
          const size = obj.radius * 0.8;
          ctx.lineWidth = 15;
          ctx.lineCap = 'butt';
          
          // Draw the main U shape
          // North side (Red)
          ctx.strokeStyle = '#ff0000';
          ctx.beginPath();
          ctx.arc(0, 0, size, Math.PI, Math.PI * 1.5, false);
          ctx.lineTo(0, -size + 15); // Connect to tip
          ctx.stroke();
          
          // South side (Blue)
          ctx.strokeStyle = '#0000ff';
          ctx.beginPath();
          ctx.arc(0, 0, size, Math.PI * 1.5, 0, false);
          ctx.lineTo(size, 0); // Connect to tip
          ctx.stroke();

          // Magnetic field lines (visual only)
          const anim = (Date.now() / 500) % 1;
          ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
          ctx.lineWidth = 2;
          for(let i=0; i<3; i++) {
            const r = size + 10 + ((i + anim) % 3) * 15;
            ctx.beginPath();
            ctx.arc(0, 0, r, Math.PI, 0, true);
            ctx.stroke();
          }

          // Metal tips
          ctx.fillStyle = '#cccccc';
          ctx.fillRect(-size-7.5, 0, 15, 10);
          ctx.fillRect(size-7.5, 0, 15, 10);
        } else if (obj.type === 'WARP_GATE') {
          // Retro Warp Gate
          const animTime = Date.now() / 1000;
          const outerRadius = obj.radius;
          const innerRadius = obj.radius * 0.6;
          
          // Glow
          const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, outerRadius);
          grad.addColorStop(0, '#00ffff');
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
          ctx.fill();
          
          // Rings
          ctx.strokeStyle = '#00ffff';
          ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            const r = innerRadius + Math.sin(animTime * 2 + i) * 5;
            ctx.rotate(animTime + i);
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 1.2);
            ctx.stroke();
          }
          
          // Center core
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, 5 + Math.sin(animTime * 5) * 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (obj.type === 'CRUSHER') {
          // Crusher Block
          const h = obj.height!;
          const w = obj.width!;
          const offset = obj.rotation || 0; // Usage as vertical offset here

          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(-w/2 + 5, -offset + 5, w, h);

          // Body
          const grad = ctx.createLinearGradient(-w/2, -offset, -w/2, -offset + h);
          grad.addColorStop(0, '#555555');
          grad.addColorStop(0.5, '#aaaaaa');
          grad.addColorStop(1, '#222222');
          ctx.fillStyle = grad;
          ctx.fillRect(-w/2, -offset, w, h);
          
          // Spikes
          ctx.fillStyle = '#888888';
          for (let i = 0; i < 4; i++) {
            const sx = -w/2 + (i * (w/4)) + w/8;
            ctx.beginPath();
            ctx.moveTo(sx - 5, -offset + h);
            ctx.lineTo(sx, -offset + h + 10);
            ctx.lineTo(sx + 5, -offset + h);
            ctx.fill();
          }
        } else if (obj.type === 'CONVEYOR') {
          // Conveyor Belt
          const w = obj.width!;
          const h = obj.height!;
          
          ctx.fillStyle = '#333333';
          ctx.fillRect(-w/2, 0, w, h);
          
          // Moving texture
          ctx.strokeStyle = '#666666';
          ctx.lineWidth = 2;
          const anim = (Date.now() / 20) % 20;
          const dirSign = obj.direction === 'LEFT' ? -1 : 1;
          
          ctx.save();
          ctx.clip();
          ctx.beginPath();
          for (let i = -w; i < w; i += 20) {
            const tx = i + (anim * dirSign);
            ctx.moveTo(tx, 0);
            ctx.lineTo(tx + 10 * dirSign, h/2);
            ctx.lineTo(tx, h);
          }
          ctx.stroke();
          ctx.restore();
          
          // Frame
          ctx.strokeStyle = '#888888';
          ctx.strokeRect(-w/2, 0, w, h);
        }
        ctx.restore();
      });
      ctx.restore();
    }

    // Draw Balls
    ballsRef.current.forEach(ball => {
      if (level === 3) {
        // 8-bit style (square)
        ctx.shadowBlur = 0;
        ctx.fillStyle = ball.isFireball ? '#ff4400' : '#ffffff';
        ctx.fillRect(ball.x - BALL_RADIUS, ball.y - BALL_RADIUS, BALL_RADIUS * 2, BALL_RADIUS * 2);
        
        // Simple 8-bit highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillRect(ball.x - BALL_RADIUS, ball.y - BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
      } else {
        // AGA style (round with trail)
        // Trail
        ball.trail.forEach((pos, i) => {
          ctx.globalAlpha = i / ball.trail.length * 0.5;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, BALL_RADIUS * (i / ball.trail.length), 0, Math.PI * 2);
          ctx.fillStyle = ball.isFireball ? '#ff4400' : '#ffffff';
          ctx.fill();
        });
        ctx.globalAlpha = 1.0;

        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
        const ballGrad = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, BALL_RADIUS);
        if (ball.isBlackHole) {
          ballGrad.addColorStop(0, '#00ffff');
          ballGrad.addColorStop(0.5, '#000000');
          ballGrad.addColorStop(1, '#000000');
        } else {
          ballGrad.addColorStop(0, ball.isFireball ? '#ffffff' : '#ffffff');
          ballGrad.addColorStop(0.3, ball.isFireball ? '#ffaa00' : '#ffffff');
          ballGrad.addColorStop(1, ball.isFireball ? '#ff0000' : '#888888');
        }
        ctx.fillStyle = ballGrad;
        ctx.fill();
        
        // Ball glow
        ctx.shadowBlur = ball.isFireball ? 20 : (ball.isBlackHole ? 25 : 15);
        ctx.shadowColor = ball.isFireball ? '#ff4400' : (ball.isBlackHole ? '#00ffff' : '#ffffff');
        if (ball.isBlackHole) {
          ctx.strokeStyle = '#00ffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.closePath();
      }
    });

    // Draw Power-ups
      const POWERUP_ICONS: Record<PowerUpType, string> = {
        [PowerUpType.WIDE_PADDLE]: '🐘',
        [PowerUpType.LASER]: '🐉',
        [PowerUpType.EXTRA_LIFE]: '💖',
        [PowerUpType.SLOW_BALL]: '🐢',
        [PowerUpType.FAST_BALL]: '🐆',
        [PowerUpType.MULTI_BALL]: '🎾',
        [PowerUpType.GLUE]: '🍯',
        [PowerUpType.FIREBALL]: '🔥',
        [PowerUpType.DEATH]: '💀',
        [PowerUpType.FLOOR]: '🛡️',
        [PowerUpType.EXPLOSION]: '💥',
        [PowerUpType.BLACK_HOLE]: '🕳️',
        [PowerUpType.GHOST_PADDLE]: '👻',
      };

      powerUpsRef.current.forEach(pu => {
        if (!pu.active) return;
        
        const isDeath = pu.type === PowerUpType.DEATH;
        const pulse = Math.sin(Date.now() / (isDeath ? 100 : 200)) * (isDeath ? 4 : 2);
        const glow = Math.sin(Date.now() / (isDeath ? 75 : 150)) * (isDeath ? 15 : 5) + (isDeath ? 20 : 10);
        
        if (level === 3) {
          // Atari style power-ups: blocky squares
          ctx.fillStyle = isDeath ? '#ff0000' : '#e0e0e0';
          ctx.fillRect(pu.x, pu.y, POWERUP_WIDTH, POWERUP_HEIGHT);
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.strokeRect(pu.x, pu.y, POWERUP_WIDTH, POWERUP_HEIGHT);
          
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 12px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(pu.type[0].toUpperCase(), pu.x + POWERUP_WIDTH / 2, pu.y + POWERUP_HEIGHT / 2 + 4);
        } else {
          // 8-bit style: blocky square
          const isLife = pu.type === PowerUpType.EXTRA_LIFE;
          ctx.fillStyle = (isDeath) ? '#ff0000' : '#ffffff'; // White background for life too
          ctx.shadowBlur = isLife ? glow : 0;
          ctx.shadowColor = isLife ? '#ff0000' : 'transparent';
          ctx.fillRect(pu.x, pu.y, POWERUP_WIDTH, POWERUP_HEIGHT);
          
          // Simple border
          ctx.strokeStyle = (isDeath) ? '#ffffff' : (isLife ? '#ff0000' : '#00ffff');
          ctx.lineWidth = 2;
          ctx.strokeRect(pu.x, pu.y, POWERUP_WIDTH, POWERUP_HEIGHT);
          
          ctx.shadowBlur = 0;
          
          // Draw animal icon
          if (isLife) {
            // Drawn custom heart
            ctx.fillStyle = '#ff0000';
            const px = pu.x + 4;
            const py = pu.y + 7;
            const pSize = 2.5;
            const heart = [
              [0,1,0,1,0],
              [1,1,1,1,1],
              [1,1,1,1,1],
              [0,1,1,1,0],
              [0,0,1,0,0]
            ];
            heart.forEach((row, ri) => {
              row.forEach((cell, ci) => {
                if (cell) ctx.fillRect(px + ci * pSize, py + ri * pSize, pSize, pSize);
              });
            });
          } else {
            ctx.font = `${(isDeath ? 24 : 20) + pulse}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(POWERUP_ICONS[pu.type], pu.x + POWERUP_WIDTH / 2, pu.y + POWERUP_HEIGHT / 2);
          }
        }
      });

    // Draw Lasers
    lasersRef.current.forEach(laser => {
      if (!laser.active) return;
      ctx.fillStyle = '#ff0000';
      if (level === 3) {
        ctx.shadowBlur = 0;
      } else {
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff0000';
      }
      ctx.fillRect(laser.x, laser.y, LASER_WIDTH, LASER_HEIGHT);
      ctx.shadowBlur = 0;
    });

    // Final restore removed since it was moved above
  }, [brickShake, paddleShake, level, bgImage, level3BgImage, isLevel3Intro, physicalObjects, ghostPaddleActive]);

  useGameLoop((delta) => {
    update(delta);
    draw();
  });

  useEffect(() => {
    // Load high scores
    const q = query(collection(db, 'highScores'), orderBy('score', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const scores: HighScoreEntry[] = [];
      snapshot.forEach((doc) => {
        scores.push({ id: doc.id, ...doc.data() } as HighScoreEntry);
      });
      setHighScores(scores);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const timer = setInterval(() => {
      setActivePowerUps(prev => {
        const next = new Map(prev);
        let changed = false;
        for (const [type, time] of Array.from(next.entries())) {
          const newTime = (time as number) - 100;
          if (newTime <= 0) {
            next.delete(type);
            // Handle expiration effects
            if (type === PowerUpType.WIDE_PADDLE) {
              paddleRef.current.width = Math.max(60, PADDLE_WIDTH - (level * 0.6));
            } else if (type === PowerUpType.LASER) {
              paddleRef.current.hasLaser = false;
            } else if (type === PowerUpType.FLOOR) {
              setHasFloor(false);
            } else if (type === PowerUpType.EXPLOSION) {
              setHasExplosion(false);
            } else if (type === PowerUpType.FAST_BALL) {
              ballsRef.current.forEach(ball => { ball.dx /= 1.4; ball.dy /= 1.4; });
            } else if (type === PowerUpType.SLOW_BALL) {
              ballsRef.current.forEach(ball => { ball.dx /= 0.6; ball.dy /= 0.6; });
            } else if (type === PowerUpType.FIREBALL) {
              ballsRef.current.forEach(ball => { ball.isFireball = false; });
            } else if (type === PowerUpType.GLUE) {
              ballsRef.current.forEach(ball => {
                if (ball.isStuck) {
                  ball.isStuck = false;
                  ball.dy = -Math.abs(ball.dy || 6);
                }
              });
            }
            changed = true;
          } else {
            next.set(type, newTime);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [gameState, level]);

  const submitScore = async () => {
    if (!playerName.trim() || isSubmittingScore) return;
    setIsSubmittingScore(true);
    try {
      await addDoc(collection(db, 'highScores'), {
        playerName: playerName.trim(),
        score,
        level,
        timestamp: serverTimestamp()
      });
      setShowHallOfFame(true);
    } catch (err) {
      console.error("Failed to submit score:", err);
    } finally {
      setIsSubmittingScore(false);
    }
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    audioService.setMuted(nextMute);
    if (!nextMute && gameState === 'PLAYING') {
      audioService.playMusic(level, isInfiniteMode);
    } else if (nextMute) {
      audioService.pauseMusic();
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`fixed inset-0 flex flex-col items-center justify-center bg-[#050505] text-white font-mono overflow-hidden select-none ${isCursorHidden ? 'cursor-none' : ''}`}
      style={{ height: '100vh', width: '100vw' }}
    >
      <div 
        className={`relative flex flex-col bg-black overflow-hidden
          ${isFullscreen ? 'w-full h-full border-0 rounded-none' : 'w-[98vw] h-[98vh] max-w-none max-h-none shadow-[0_0_100px_rgba(0,255,0,0.1)] border border-green-500/20'}
          [container-type:size] self-center transition-all duration-300`}
      >
        {/* HUD with Glass Effect Overlay - Minimalist v3.0 */}
        <div className={`absolute top-0 left-0 w-full h-[3.5cqw] px-[1.5cqw] flex justify-between items-center z-30 transition-all duration-700
          bg-black/25 backdrop-blur-md border-b border-white/5 pointer-events-none
          ${isCursorHidden ? 'cursor-none' : ''} 
          ${gameState === 'START' ? 'opacity-0 -translate-y-full' : 'opacity-100 translate-y-0'}`}>
          
          <div className="flex gap-[3cqw] h-full items-center">
            <div className="flex flex-col">
              <span className="text-[0.5cqw] uppercase tracking-[0.3em] font-bold text-green-500/60 font-mono leading-tight">Score</span>
              <span className="text-[1.6cqw] font-black text-green-400 leading-none">{score.toString().padStart(6, '0')}</span>
            </div>
            
            <div className="flex flex-col">
              <span className="text-[0.5cqw] uppercase tracking-[0.3em] font-bold text-red-500/60 font-mono leading-tight">Shields</span>
              <div className="flex gap-[0.3cqw] mt-[0.1cqw]">
                {Array.from({ length: lives }).map((_, i) => (
                  <Heart 
                    key={i} 
                    size={16}
                    className="w-[1cqw] h-[1cqw] text-red-500 fill-red-500"
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Tactical Display - Tactical Energy & Powerups */}
          <div className="flex items-center gap-[2cqw] relative z-20 h-full pointer-events-auto">
            <div className="flex flex-col min-w-[12cqw] gap-[0.1cqw]">
              <div className="flex justify-between items-center px-1">
                <span className="text-[0.6cqw] uppercase tracking-[0.2em] font-bold text-cyan-400/50 font-mono">Energy</span>
                <span className="text-[0.8cqw] text-cyan-400 font-bold font-mono">{Math.floor(energy)}%</span>
              </div>
              <div className="h-[0.5cqw] bg-white/5 border border-white/10 rounded-full overflow-hidden relative">
                <motion.div 
                  className={`h-full transition-[width,background-color] duration-300 ${energy >= 50 ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'bg-cyan-600/40'}`} 
                  animate={{ width: `${energy}%` }}
                />
              </div>
            </div>
            
            <div className="flex gap-[0.8cqw] items-center">
              {Array.from(activePowerUps.entries()).map(([type, time]) => {
                // Determine base duration for circular progress
                let maxDur = 30000; // POWERUP_DURATION default
                if (type === PowerUpType.FAST_BALL || type === PowerUpType.SLOW_BALL) maxDur = 10000;
                if (type === PowerUpType.EXTRA_LIFE) maxDur = 0;
                
                const progress = maxDur > 0 ? (time / maxDur) * 100 : 100;

                return (
                  <div 
                    key={type}
                    className="relative w-[2.2cqw] h-[2.2cqw] flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-sm border border-white/10 overflow-hidden shadow-inner"
                    title={`${type} - ${Math.ceil(time/1000)}s`}
                  >
                    {maxDur > 0 && (
                      <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none p-[0.1cqw]">
                        <circle
                          cx="50%"
                          cy="50%"
                          r="38%"
                          fill="none"
                          stroke="rgba(255,255,255,0.05)"
                          strokeWidth="2.5"
                        />
                        <circle
                          cx="50%"
                          cy="50%"
                          r="38%"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeDasharray="100"
                          strokeDashoffset={100 - progress}
                          className={`transition-all duration-100 ${
                            type === PowerUpType.LASER ? 'text-red-500' :
                            type === PowerUpType.WIDE_PADDLE ? 'text-blue-500' :
                            type === PowerUpType.GLUE ? 'text-yellow-500' :
                            type === PowerUpType.FIREBALL ? 'text-red-600' :
                            'text-green-500'
                          }`}
                          pathLength="100"
                        />
                      </svg>
                    )}
                    
                    <div className={`${time < 3000 ? 'animate-pulse' : ''} relative z-10`}>
                      {type === PowerUpType.LASER && <Zap className="w-[1cqw] h-[1cqw] text-red-500" />}
                      {type === PowerUpType.WIDE_PADDLE && <Shield className="w-[1cqw] h-[1cqw] text-blue-500" />}
                      {type === PowerUpType.EXTRA_LIFE && <Heart className="w-[1cqw] h-[1cqw] text-red-500 fill-red-500" />}
                      {type === PowerUpType.SLOW_BALL && <Gauge className="w-[1cqw] h-[1cqw] text-cyan-500" />}
                      {type === PowerUpType.FAST_BALL && <Gauge className="w-[1cqw] h-[1cqw] text-orange-500" />}
                      {type === PowerUpType.GLUE && <Zap className="w-[1cqw] h-[1cqw] text-yellow-500" />}
                      {type === PowerUpType.FIREBALL && <Flame className="w-[1cqw] h-[1cqw] text-red-600" />}
                      {type === PowerUpType.FLOOR && <Shield className="w-[1cqw] h-[1cqw] text-green-400" />}
                      {type === PowerUpType.EXPLOSION && <Zap className="w-[1cqw] h-[1cqw] text-orange-400" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-[2cqw] relative z-20 h-full pointer-events-auto">
            <div className="flex flex-col min-w-[12cqw] gap-[0.1cqw]">
              <div className="flex justify-between items-center px-1">
                <span className="text-[0.6cqw] uppercase tracking-[0.2em] font-bold text-cyan-400/50 font-mono">Energy</span>
                <span className="text-[0.8cqw] text-cyan-400 font-bold font-mono">{Math.floor(energy)}%</span>
              </div>
              <div className="h-[0.5cqw] bg-white/5 border border-white/10 rounded-full overflow-hidden relative">
                <motion.div 
                  className={`h-full transition-[width,background-color] duration-300 ${energy >= 50 ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'bg-cyan-600/40'}`} 
                  animate={{ width: `${energy}%` }}
                />
              </div>
            </div>
            
            <div className="flex gap-[0.8cqw] items-center">
              {Array.from(activePowerUps.entries()).map(([type, time]) => {
                // Radial timer calculation
                // Durations matching logic in applyPowerUp
                const maxDuration = type === PowerUpType.EXTRA_LIFE ? 0 : 
                                    (type === PowerUpType.FAST_BALL || type === PowerUpType.SLOW_BALL) ? 10000 : 15000;
                const progress = maxDuration > 0 ? (time / maxDuration) * 100 : 100;

                return (
                  <div 
                    key={type}
                    className="relative w-[2.2cqw] h-[2.2cqw] flex items-center justify-center bg-white/5 backdrop-blur-sm rounded-sm border border-white/10"
                    title={`${type} - ${Math.ceil(time/1000)}s`}
                  >
                    {/* Radial Timer SVG */}
                    {maxDuration > 0 && (
                      <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none scale-[1.15]">
                        <circle
                          cx="50%"
                          cy="50%"
                          r="42%"
                          fill="none"
                          stroke="rgba(255,255,255,0.05)"
                          strokeWidth="3"
                        />
                        <circle
                          cx="50%"
                          cy="50%"
                          r="42%"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeDasharray="100"
                          strokeDashoffset={100 - progress}
                          className={`transition-all duration-100 ${
                            type === PowerUpType.LASER ? 'text-red-500' :
                            type === PowerUpType.WIDE_PADDLE ? 'text-blue-500' :
                            type === PowerUpType.EXTRA_LIFE ? 'text-red-500' :
                            type === PowerUpType.SLOW_BALL ? 'text-cyan-500' :
                            type === PowerUpType.FAST_BALL ? 'text-orange-500' :
                            type === PowerUpType.GLUE ? 'text-yellow-500' :
                            type === PowerUpType.FIREBALL ? 'text-red-600' :
                            type === PowerUpType.FLOOR ? 'text-green-400' :
                            'text-orange-400'
                          }`}
                          pathLength="100"
                        />
                      </svg>
                    )}
                    
                    <div className={time < 3000 ? 'animate-pulse' : ''}>
                      {type === PowerUpType.LASER && <Zap className="w-[1.1cqw] h-[1.1cqw] text-red-500" />}
                      {type === PowerUpType.WIDE_PADDLE && <Shield className="w-[1.1cqw] h-[1.1cqw] text-blue-500" />}
                      {type === PowerUpType.EXTRA_LIFE && <Heart className="w-[1.1cqw] h-[1.1cqw] text-red-500 fill-red-500" />}
                      {type === PowerUpType.SLOW_BALL && <Gauge className="w-[1.1cqw] h-[1.1cqw] text-cyan-500" />}
                      {type === PowerUpType.FAST_BALL && <Gauge className="w-[1.1cqw] h-[1.1cqw] text-orange-500" />}
                      {type === PowerUpType.GLUE && <Zap className="w-[1.1cqw] h-[1.1cqw] text-yellow-500" />}
                      {type === PowerUpType.FIREBALL && <Flame className="w-[1.1cqw] h-[1.1cqw] text-red-600" />}
                      {type === PowerUpType.FLOOR && <Shield className="w-[1.1cqw] h-[1.1cqw] text-green-400" />}
                      {type === PowerUpType.EXPLOSION && <Zap className="w-[1.1cqw] h-[1.1cqw] text-orange-400" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-[1.5cqw] pointer-events-auto">
            <div className="flex flex-col items-center">
              <span className="text-[0.4cqw] uppercase text-white/40 leading-none mb-0.5 font-mono">Sector</span>
              <div className="text-[1.3cqw] font-black text-green-400 italic">
                {level}
              </div>
            </div>
            
            <div className="h-[1.5cqw] w-[1px] bg-white/10" />

            <button 
              onClick={toggleMute}
              className="p-[0.2cqw] text-white/40 hover:text-white transition-colors"
            >
              {isMuted ? <VolumeX className="w-[1cqw] h-[1cqw]" /> : <Volume2 className="w-[1cqw] h-[1cqw]" />}
            </button>
            <button 
              onClick={toggleFullscreen}
              className="p-[0.2cqw] text-white/40 hover:text-white transition-colors"
            >
              {isFullscreen ? <Minimize className="w-[1cqw] h-[1cqw]" /> : <Maximize className="w-[1cqw] h-[1cqw]" />}
            </button>
          </div>
        </div>

        {/* Game Area - Guaranteed Full Size v2.9 */}
        <div className="absolute inset-0 bg-black flex items-center justify-center z-10 overflow-hidden">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="w-full h-full object-fill touch-none pointer-events-auto"
          />
        </div>

        {/* Overlays */}
        <AnimatePresence>
          {gameState === 'PAUSED' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/60 z-50 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center p-[4cqw] rounded-[3cqw] border-2 border-white/20 bg-white/5"
              >
                <h2 className="text-[8cqw] font-black text-white mb-[4cqw] tracking-tighter italic">PAUSED</h2>
                <button 
                  onClick={() => setGameState('PLAYING')}
                  className="group relative px-[6cqw] py-[2cqw] bg-white text-black font-black rounded-full hover:scale-110 transition-all active:scale-95 flex items-center gap-[2cqw] mx-auto text-[2cqw]"
                >
                  <Play className="w-[3cqw] h-[3cqw] fill-current" />
                  RESUME
                </button>
                <p className="mt-[2cqw] text-white/40 text-[1.2cqw] font-mono uppercase tracking-widest">Press SPACE to resume</p>
              </motion.div>
            </motion.div>
          )}

        {gameState === 'START' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 overflow-hidden p-[2cqw] backdrop-blur-sm"
            >
              {/* High Score on Start Screen */}
              <div className="absolute top-[2cqw] right-[2cqw] text-right z-30">
                <span className="text-[1.2cqw] text-yellow-500/60 uppercase block tracking-[0.2em]">High Score</span>
                <span className="text-[3.5cqw] font-black text-yellow-500 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">{highScore.toLocaleString()}</span>
              </div>

              {/* Copper Bars Effect - Optimized to CSS */}
              <div className="absolute inset-0 flex flex-col justify-around pointer-events-none overflow-hidden opacity-30">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="copper-bar"
                    style={{
                      background: `linear-gradient(to bottom, transparent, ${COLORS.bricks[i % COLORS.bricks.length]}, transparent)`,
                      animationDuration: `${4 + i * 0.5}s`,
                      animationDelay: `${i * -0.3}s`
                    }}
                  />
                ))}
              </div>

              <div className="flex-1 flex flex-col items-center justify-center gap-[2cqh] w-full max-w-[90cqw] z-30 pt-[5cqh] pb-[15cqh]">
                <motion.div
                  animate={{
                    scale: [1, 1.03, 1],
                    rotate: [-0.5, 0.5, -0.5]
                  }}
                  transition={{ duration: 5, repeat: Infinity }}
                  className="text-center"
                >
                  <h1 className="text-[min(10cqw,12cqh)] font-black italic tracking-tighter text-white mb-[0.2cqw] drop-shadow-[0_0_30px_rgba(0,255,0,1)] leading-none">
                    MEGABALL <span className="text-red-500">Ai</span><span className="text-green-500">GA</span>
                  </h1>
                  <div className="flex flex-col items-center">
                    <p className="text-[2.2cqw] text-green-500/80 mb-[0.2cqw] uppercase tracking-[0.6em]">Commodore Amiga Tribute</p>
                    <div className="px-[1cqw] py-[0.2cqw] bg-green-500/10 border border-green-500/20 rounded text-[0.8cqw] text-green-400/60 font-mono tracking-widest mt-[-0.5cqw]">
                      RELEASE v3.1.0429.2035
                    </div>
                  </div>
                  <p className="text-[1.3cqw] text-green-500/40 uppercase tracking-widest animate-pulse mt-[1cqw]">Click to activate sound & start</p>
                  {showOrientationPrompt && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-[2cqw] px-[2cqw] py-[1cqw] bg-red-500/20 border border-red-500/40 text-red-400 text-[1.2cqw] font-bold uppercase tracking-[0.2em] rounded"
                    >
                      ⚠️ Please rotate to LANDSCAPE for best experience
                    </motion.div>
                  )}
                </motion.div>

                <div className="flex flex-col items-center gap-[1cqh]">
                  <label htmlFor="level-select" className="text-[1.2cqw] text-green-500/60 uppercase tracking-widest">Select Starting Sector</label>
                  <select 
                    id="level-select"
                    value={level}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setLevel(val);
                      initBricks(val);
                    }}
                    className="bg-black text-green-500 border-2 border-green-500/50 px-[2cqw] py-[0.5cqw] rounded-sm text-[1.5cqw] font-bold focus:outline-none focus:border-green-400 cursor-pointer hover:bg-green-500/10 transition-colors"
                  >
                    {Array.from({ length: 100 }).map((_, i) => (
                      <option key={i + 1} value={i + 1}>SECTOR {i + 1}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex flex-wrap justify-center gap-[2cqw]">
                  <button
                    onClick={toggleFullscreen}
                    className="p-[1.5cqw] bg-white/5 hover:bg-white/10 text-white/50 hover:text-white rounded-full transition-all transform hover:scale-110 border border-white/10"
                    title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                  >
                    {isFullscreen ? <Minimize className="w-[2.5cqw] h-[2.5cqw]" /> : <Maximize className="w-[2.5cqw] h-[2.5cqw]" />}
                  </button>

                  <button
                    onClick={() => startGame(false)}
                    className="group relative flex items-center gap-[1.5cqw] px-[5cqw] py-[1.5cqw] bg-green-600 hover:bg-green-500 text-black font-black text-[2cqw] rounded-sm transition-all transform hover:scale-105 shadow-[0_0_30px_rgba(0,255,0,0.4)]"
                  >
                    <Play className="w-[2.5cqw] h-[2.5cqw]" fill="black" />
                    START MISSION
                    <div className="absolute -inset-[0.4cqw] border-[0.15cqw] border-green-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>

                  <button
                    onClick={() => startGame(true)}
                    className="group relative flex items-center gap-[1.5cqw] px-[4cqw] py-[1.5cqw] bg-purple-600 hover:bg-purple-500 text-white font-black text-[1.8cqw] rounded-sm transition-all transform hover:scale-105 shadow-[0_0_30px_rgba(168,85,247,0.4)]"
                  >
                    <Zap className="w-[2.5cqw] h-[2.5cqw]" fill="white" />
                    INFINITY MODE
                    <div className="absolute -inset-[0.4cqw] border-[0.15cqw] border-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>

                  <button
                    onClick={() => setShowHallOfFame(true)}
                    className="group relative flex items-center gap-[1.5cqw] px-[3cqw] py-[1.5cqw] bg-transparent border-2 border-yellow-500 text-yellow-500 font-black text-[1.5cqw] rounded-sm transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(234,179,8,0.2)]"
                  >
                    <Trophy className="w-[2.5cqw] h-[2.5cqw]" />
                    HALL OF FAME
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-[2cqw] text-[1.1cqw] text-green-500/40 uppercase tracking-widest w-full max-w-[85cqw]">
                  <div className="flex flex-col items-center">
                    <span>Mouse / Arrows</span>
                    <span className="text-green-500/70">Move Paddle</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span>Click / Space</span>
                    <span className="text-green-500/70">Launch / Fire</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-purple-400 font-black">Key E (30 NRG)</span>
                    <span className="text-white">Force Push</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-cyan-400 font-black">Key T (50 NRG)</span>
                    <span className="text-white">Time Slow</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span>P Key</span>
                    <span className="text-green-500/70">Pause Game</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span>M Key</span>
                    <span className="text-green-500/70">Mute Audio</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span>F Key</span>
                    <span className="text-green-500/70">Fullscreen</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span>ESC Key</span>
                    <span className="text-green-500/70">Exit Menu</span>
                  </div>
                </div>
              </div>
              
              <div className="absolute bottom-0 w-full bg-black/90 border-t-[0.4cqw] border-b-[0.4cqw] border-green-500 py-[1cqh] overflow-hidden z-20 h-[10cqh] flex items-center pointer-events-none">
                <RetroScroller text={scrollerText} />
              </div>
            </motion.div>
          )}

          {(gameState === 'GAMEOVER' || gameState === 'WIN' || gameState === 'LEVEL_COMPLETE') && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 overflow-hidden"
            >
              <div className="text-center p-[1.5cqw] border-[0.2cqw] border-green-500 bg-black shadow-[0_0_30px_rgba(0,255,0,0.2)] max-w-[65cqw] w-full mx-[2cqw] relative overflow-hidden rounded-md flex flex-col max-h-[85cqh]">
                {/* Background decorative elements */}
                <div className="absolute top-0 left-0 w-full h-[0.1cqw] bg-gradient-to-r from-transparent via-green-500 to-transparent animate-pulse" />
                <div className="absolute bottom-0 left-0 w-full h-[0.1cqw] bg-gradient-to-r from-transparent via-green-500 to-transparent animate-pulse" />
                
                <div className="flex-1 overflow-y-auto custom-scrollbar px-[0.8cqw] py-[1.2cqw]">
                  {gameState === 'LEVEL_COMPLETE' ? (
                    <div className="flex flex-col items-center py-[0.5cqw]">
                      <motion.div
                        animate={{ 
                          scale: [1, 1.1, 1],
                          filter: ["brightness(1)", "brightness(1.3)", "brightness(1)"]
                        }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        <Zap className="w-[3cqw] h-[3cqw] text-blue-400 mb-[0.6cqw] drop-shadow-[0_0_10px_rgba(96,165,250,0.8)]" />
                      </motion.div>
                      
                      <h2 className="text-[3.2cqw] font-black italic text-blue-500 mb-[0.1cqw] tracking-tighter drop-shadow-[0_0_6px_rgba(59,130,246,0.5)] leading-none uppercase">Sector Clear</h2>
                      <p className="text-blue-400/60 mb-[1.2cqw] uppercase tracking-[0.4em] font-bold text-[1cqw]">Mission Objective Achieved</p>
                      
                      <button
                        onClick={startNextLevel}
                        className="group relative flex items-center justify-center gap-[0.8cqw] px-[3cqw] py-[0.8cqw] bg-blue-600 hover:bg-blue-500 text-black font-black text-[1.4cqw] rounded-sm transition-all transform hover:scale-105 shadow-[0_0_15px_rgba(37,99,235,0.4)] active:scale-95"
                      >
                        <Play className="w-[1.4cqw] h-[1.4cqw]" fill="black" />
                        CONTINUE
                        <div className="absolute -inset-[0.2cqw] border-[0.1cqw] border-blue-300 opacity-0 group-hover:opacity-100 transition-opacity animate-pulse" />
                      </button>
                      
                      <p className="mt-[1.2cqw] text-blue-400/40 text-[0.8cqw] uppercase tracking-widest animate-pulse">Proceeding to next sector</p>
                    </div>
                  ) : gameState === 'WIN' ? (
                    <div className="flex flex-col items-center py-[1.5cqw] relative">
                      {winBgImage && (
                        <div className="absolute inset-0 opacity-15 pointer-events-none">
                          <img src={winBgImage.src} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="relative z-10 flex flex-col items-center">
                        <Trophy className="w-[6cqw] h-[6cqw] text-yellow-500 mb-[1.5cqw] animate-bounce" />
                        <h2 className="text-[4.5cqw] font-black italic text-yellow-500 mb-[0.4cqw] tracking-tighter drop-shadow-[0_0_15px_rgba(234,179,8,0.8)] uppercase leading-none">Victory Over Space</h2>
                        <p className="text-yellow-400/60 mb-[1.5cqw] uppercase tracking-[0.4em] font-bold text-[1.1cqw]">The Galaxy is Safe!</p>
                        <div className="bg-green-500/10 border border-green-500/30 p-[1.5cqw] rounded-lg mb-[2cqw] max-w-[50cqw]">
                           <p className="text-green-400 text-[1.1cqw] italic font-mono leading-relaxed">
                             PILOT, YOUR BRAVERY HAS ENDED THE THREAT. ALL SECTORS ARE SECURE. THE GALAXY SALUTES YOU!
                           </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-[0.5cqw]">
                      <motion.div
                        animate={{
                          scale: [1, 1.1, 1],
                          rotate: [-3, 3, -3]
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <h2 className="text-[3.5cqw] font-black italic text-red-600 mb-[0.6cqw] drop-shadow-[0_0_15px_rgba(220,38,38,0.8)] tracking-tighter leading-none uppercase">Mission Failed</h2>
                      </motion.div>
                      <p className="text-red-500/60 mb-[1.2cqw] uppercase tracking-[0.5em] font-bold text-[1.1cqw]">System Overload - Game Over</p>
                    </div>
                  )}
                  
                  <div className="flex flex-col items-center gap-[1.5cqw] mb-[1.5cqw]">
                    <div className="p-[1cqw] border-[0.1cqw] border-green-500/30 bg-green-500/5 rounded-xl inline-block w-full max-w-[40cqw]">
                      <span className="text-[0.9cqw] text-green-500/40 uppercase block mb-[0.2cqw] tracking-[0.3em]">Final Tactical Score</span>
                      <span className="text-[4.5cqw] font-black text-white tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.4)] leading-none">{score.toLocaleString()}</span>
                    </div>
                    
                    {gameState === 'GAMEOVER' && !showHallOfFame && (
                      <div className="mt-[0.5cqw] w-full max-w-[40cqw] space-y-[1cqw] bg-black/40 p-[1cqw] border border-yellow-500/20 rounded">
                        <p className="text-yellow-500 text-[1cqw] uppercase tracking-widest font-bold">Transmit ID to Command</p>
                        <div className="flex gap-[0.4cqw]">
                          <input 
                            type="text"
                            maxLength={20}
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value)}
                            placeholder="PILOT NAME"
                            className="flex-1 bg-black border-2 border-green-500/50 text-green-500 px-[1cqw] py-[0.6cqw] text-[1.2cqw] focus:outline-none focus:border-green-400 uppercase font-bold"
                          />
                          <button 
                            onClick={submitScore}
                            disabled={!playerName.trim() || isSubmittingScore}
                            className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-black px-[1.5cqw] rounded-sm transition-all shadow-[0_0_10px_rgba(0,255,0,0.3)]"
                          >
                            <Send className="w-[1.8cqw] h-[1.8cqw]" />
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="p-[0.8cqw] border-[0.1cqw] border-yellow-500/30 bg-yellow-500/5 rounded-xl inline-block w-full max-w-[32cqw]">
                      <span className="text-[0.8cqw] text-yellow-500/40 uppercase block mb-[0.2cqw] tracking-[0.3em]">Sector High Score</span>
                      <span className="text-[3cqw] font-black text-yellow-400 tracking-tighter drop-shadow-[0_0_8px_rgba(250,204,21,0.4)] leading-none">{highScore.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center gap-[1.5cqw] mt-auto py-[1.2cqw] border-t border-white/5 bg-black z-10">
                  <button
                    onClick={gameState === 'LEVEL_COMPLETE' ? startNextLevel : startGame}
                    className="flex items-center justify-center gap-[0.8cqw] px-[3cqw] py-[0.8cqw] bg-green-700 hover:bg-green-600 text-black font-black text-[1.4cqw] rounded-sm transition-all transform hover:scale-105 shadow-[0_0_15px_rgba(0,255,0,0.2)]"
                  >
                    {gameState === 'LEVEL_COMPLETE' ? <Play className="w-[1.4cqw] h-[1.4cqw]" /> : <RotateCcw className="w-[1.4cqw] h-[1.4cqw]" />}
                    {gameState === 'LEVEL_COMPLETE' ? 'NEXT MISSION' : 'TRY AGAIN'}
                  </button>
                  
                  <button
                    onClick={backToMenu}
                    className="flex items-center justify-center gap-[0.8cqw] px-[3cqw] py-[0.8cqw] bg-transparent border-2 border-green-700 hover:bg-green-700/20 text-green-600 font-bold text-[1.4cqw] rounded-sm transition-all"
                  >
                    BACK TO MENU
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          {showHallOfFame && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/95 z-[60] backdrop-blur-md p-[2cqw]"
            >
              <div className="w-full max-w-[80cqw] max-h-[90cqh] p-[3cqw] border-4 border-yellow-500/50 bg-black rounded-lg relative flex flex-col shadow-[0_0_50px_rgba(234,179,8,0.1)]">
                <button 
                  onClick={() => setShowHallOfFame(false)}
                  className="absolute top-[1cqw] right-[1cqw] text-yellow-500 hover:text-white transition-colors z-10"
                >
                  <RotateCcw className="w-[2cqw] h-[2cqw] rotate-180" />
                </button>
                
                <div className="text-center mb-[2cqw] shrink-0">
                  <Trophy className="w-[5cqw] h-[5cqw] text-yellow-500 mx-auto mb-[1cqw] animate-bounce" />
                  <h2 className="text-[4cqw] font-black italic text-yellow-500 tracking-tighter uppercase leading-none">Hall of Fame</h2>
                  <p className="text-yellow-500/50 text-[1.2cqw] uppercase tracking-[0.5em] mt-[0.5cqw]">Top Galactic Pilots</p>
                </div>

                <div className="space-y-[0.5cqw] overflow-y-auto pr-[1cqw] custom-scrollbar flex-1 min-h-0">
                  {highScores.length === 0 ? (
                    <p className="text-center text-white/20 py-[4cqw] uppercase tracking-widest italic">No records found in this sector...</p>
                  ) : (
                    highScores.map((entry, i) => (
                      <div 
                        key={entry.id}
                        className={`flex items-center justify-between p-[1cqw] border-b border-white/10 ${i === 0 ? 'bg-yellow-500/10 border-yellow-500/30' : ''}`}
                      >
                        <div className="flex items-center gap-[2cqw]">
                          <span className={`text-[2cqw] font-black w-[4cqw] ${i === 0 ? 'text-yellow-500' : 'text-white/40'}`}>
                            {(i + 1).toString().padStart(2, '0')}
                          </span>
                          <div className="flex flex-col">
                            <span className="text-[2cqw] font-bold text-white uppercase tracking-tight leading-none">{entry.playerName}</span>
                            <span className="text-[1cqw] text-white/40 uppercase mt-[0.2cqw]">Sector {entry.level}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-[2.5cqw] font-black ${i === 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                            {entry.score.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-[2cqw] text-center shrink-0">
                  <button 
                    onClick={() => setShowHallOfFame(false)}
                    className="px-[5cqw] py-[1cqw] bg-yellow-600 hover:bg-yellow-500 text-black font-black text-[1.5cqw] rounded-sm transition-all shadow-[0_0_20px_rgba(234,179,8,0.3)]"
                  >
                    RETURN TO BASE
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-8 text-[10px] text-green-500/30 uppercase tracking-[0.3em] flex gap-4 pointer-events-none">
        <span>1991-2026</span>
        <span>•</span>
        <span>AGA CHIPSET ENABLED</span>
        <span>•</span>
        <span>STEREO SOUND</span>
      </div>
    </div>
  );
};
