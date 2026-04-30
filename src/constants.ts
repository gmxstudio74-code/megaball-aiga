
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const PADDLE_WIDTH = 150;
export const PADDLE_HEIGHT = 20;
export const PADDLE_SPEED = 12;
export const MOUSE_SENSITIVITY = 1.0;

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
  GHOST_PADDLE = 'GHOST_PADDLE'
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

export const POWERUP_WIDTH = 60;
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

export const SCROLLER_TEXT = "   *** MEGABALL AiGA: COMMODORE AMIGA 1200 TRIBUTE ***   STARRING THE LEGENDARY BOING BALL   ***   FEATURING: 100+ LEVELS, RETRO PHYSICS, AND AMIGA VIBES   ***   GREETINGS TO ALL RETRO GAMERS!   ***   PRESS SPACE OR FIRE TO START YOUR JOURNEY...   ***   ";
