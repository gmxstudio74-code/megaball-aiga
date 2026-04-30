
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const PADDLE_WIDTH = 150;
export const PADDLE_HEIGHT = 20;
export const PADDLE_SPEED = 12;
export const MOUSE_SENSITIVITY = 1.85; // Final bump for smooth trackpad feel

export const BALL_RADIUS = 10;
export const INITIAL_BALL_SPEED = 8;

export const BRICK_ROWS = 10;
export const BRICK_COLS = 15;
export const BRICK_PADDING = 5;
export const BRICK_OFFSET_TOP = 100;
export const BRICK_OFFSET_LEFT = 50;

export enum PowerUpType {
  WIDE_PADDLE = 'WIDE_PADDLE',
  LASER = 'LASER',
  EXTRA_LIFE = 'EXTRA_LIFE',
  SLOW_BALL = 'SLOW_BALL',
  FAST_BALL = 'FAST_BALL',
  MULTI_BALL = 'MULTI_BALL',
  GLUE = 'GLUE',
  FIREBALL = 'FIREBALL',
  DEATH = 'DEATH',
  FLOOR = 'FLOOR',
  EXPLOSION = 'EXPLOSION',
  BLACK_HOLE = 'BLACK_HOLE',
  GHOST_PADDLE = 'GHOST_PADDLE',
  BIG_BALL = 'BIG_BALL',
  CRUISER = 'CRUISER'
}

export interface PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
  active: boolean;
  speed: number;
}

export interface Laser {
  x: number;
  y: number;
  active: boolean;
}

export const POWERUP_WIDTH = 40;
export const POWERUP_HEIGHT = 20;
export const POWERUP_SPEED = 4;

export const LASER_WIDTH = 4;
export const LASER_HEIGHT = 15;
export const LASER_SPEED = 10;

export interface Particle {
  x: number;
  y: number;
  size: number;
  color: string;
  life: number;
  dx: number;
  dy: number;
  gravityScale?: number;
  rotation?: number;
  rotationSpeed?: number;
}

export interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
}

export interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
  trail: { x: number; y: number }[];
  isFireball?: boolean;
  isBlackHole?: boolean;
  isStuck?: boolean;
  stuckOffset?: number;
  isPiercing?: boolean;
  spin?: number;
  lastInteractionFrame?: number;
  consecutiveWallHits?: number;
  radiusScale?: number;
  combo?: number;
  isCruiser?: boolean;
  cruiserTimer?: number;
  rotation?: number;
  squish?: number; // Current deformation (-1 to 1)
  squishDir?: number; // Direction of squish (radians)
}

export type PhysicalObjectType = 'GEAR' | 'FAN' | 'MAGNET' | 'WARP_GATE' | 'CRUSHER' | 'CONVEYOR';

export interface PhysicalObject {
  id: string;
  type: PhysicalObjectType;
  x: number;
  y: number;
  radius: number;
  width?: number;
  height?: number;
  rotation?: number;
  direction?: 'LEFT' | 'RIGHT';
  targetId?: string;
  strength?: number;
  state?: any;
  lastMoveTime?: number;
}

export const COLORS = {
  background: '#050505',
  grid: '#111111',
  paddle: '#ffffff',
  bricks: [
    '#ef4444', // red-500
    '#22c55e', // green-500
    '#3b82f6', // blue-500
    '#eab308', // yellow-500
    '#a855f7', // purple-500
    '#06b6d4', // cyan-500
    '#f97316', // orange-500
    '#ffffff'  // white
  ]
};

export const SCROLLER_TEXT = "   *** MEGABALL AiGA: COMMODORE AMIGA 1200 TRIBUTE - RELEASE v0.8.0 ***   STARRING THE LEGENDARY BOING BALL   ***   GREETINGS TO ALL RETRO GAMERS WORLDWIDE!   ***   PLAY LOUD AND PROUD   ***   EXPERIENCE THE POWER OF THE 32-BIT AGA CHIPSET   ***   256 COLORS OF PURE ARCADE ADRENALINE   ***   REMEMBER THE DAYS OF FLOPPY DISKS AND JOYSTICK WIGGLING?   ***   THIS IS A LOVE LETTER TO THE 32-BIT GENERATION   ***   SPECIAL THANKS TO THE DEMOSCENE FOR THE ENDLESS INSPIRATION   ***   KEEP THE RETRO SPIRIT ALIVE   ***   DON'T FORGET TO GRAB THE POWER-UPS   ***   WATCH OUT FOR THE FIREBALL!   ***   CAN YOU CLEAR ALL 100 SECTORS?   ***   THE GALAXY IS COUNTING ON YOU PILOT   ***   NO QUARTERS REQUIRED   ***   JUST PURE SKILL AND REFLEXES   ***   DID YOU KNOW? THE ORIGINAL MEGABALL WAS A STAPLE OF THE AMIGA SHAREWARE SCENE!   ***   WE ARE KEEPING THE TRADITION ALIVE WITH THIS MODERN TRIBUTE   ***   FEEL THE SMOOTH 60FPS ACTION   ***   NO LAG, NO SLOWDOWNS, JUST PURE 32-BIT POWER   ***   SHOUTOUTS TO ALL THE LEGENDARY GROUPS: RAZOR 1911, FAIRLIGHT, SKIDROW, AND THE REST!   ***   THE DEMOSCENE LIVES ON IN OUR HEARTS   ***   DON'T FORGET TO CHECK THE SETTINGS FOR FULLSCREEN MODE   ***   USE THE MOUSE TO CONTROL THE PADDLE WITH PIXEL-PERFECT PRECISION   ***   COLLECT THE LASER POWER-UP TO BLAST THROUGH THE BRICKS   ***   THE MULTIBALL WILL HELP YOU CLEAR THE SCREEN IN NO TIME   ***   BUT BEWARE OF THE SPEED-UP!   ***   YOUR REFLEXES WILL BE TESTED TO THE LIMIT   ***   ARE YOU READY FOR THE ULTIMATE CHALLENGE?   ***   LET'S GO!   ***   REMEMBER THE AMIGA 500, 1200, AND 4000?   ***   THE GLORY DAYS OF THE WORKBENCH AND DELUXE PAINT   ***   THIS GAME IS BUILT WITH PASSION FOR THE PIXELS   ***   EVERY BRICK YOU BREAK IS A NOD TO THE PAST   ***   CAN YOU FIND THE HIDDEN SECRETS?   ***   THE MUSIC WAS COMPOSED TO BRING BACK THAT MOD-TRACKER FEEL   ***   CRANK UP THE VOLUME AND LET THE BASS HIT   ***   WATCH YOUR LIVES, THEY ARE PRECIOUS   ***   EXTRA LIVES ARE RARE, SO PLAY CAREFULLY   ***   THE PADDLE IS YOUR ONLY DEFENSE AGAINST THE COSMIC CHAOS   ***   MASTER THE ANGLES TO BECOME A TRUE MEGABALL PRO   ***   THANKS FOR PLAYING AND SUPPORTING INDIE RETRO PROJECTS   ***   SPREAD THE WORD AND CHALLENGE YOUR FRIENDS   ***   WHO WILL GET THE HIGHEST SCORE?   ***   THE LEADERBOARD AWAITS YOUR NAME   ***   KEEP ON GAMING!   ***   THE AMIGA 1200 BROUGHT US INTO THE 32-BIT ERA WITH STYLE   ***   LONG LIVE THE AMIGA!   ***   ";
