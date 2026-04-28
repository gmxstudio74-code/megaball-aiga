/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const GAME_WIDTH = 1000;
export const GAME_HEIGHT = 700;

export const PADDLE_WIDTH = 120;
export const PADDLE_HEIGHT = 20;
export const PADDLE_SPEED = 20;
export const MOUSE_SENSITIVITY = 2.0;

export const BALL_RADIUS = 10;
export const INITIAL_BALL_SPEED = 6;

export const BRICK_ROWS = 20;
export const BRICK_COLS = 20;
export const BRICK_PADDING = 4;
export const BRICK_OFFSET_TOP = 80;
export const BRICK_OFFSET_LEFT = 40;

export const COLORS = {
  background: '#050505',
  grid: '#1a1a1a',
  paddle: '#00ff00',
  ball: '#ffffff',
  bricks: [
    '#ff00ff', // Magenta
    '#00ffff', // Cyan
    '#ffff00', // Yellow
    '#ff0000', // Red
    '#0000ff', // Blue
    '#ff8800', // Orange
    '#8800ff', // Purple
    '#00ff88', // Spring Green
  ]
};

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
}

export const POWERUP_WIDTH = 40;
export const POWERUP_HEIGHT = 20;
export const POWERUP_SPEED = 2;

export const LASER_WIDTH = 4;
export const LASER_HEIGHT = 15;
export const LASER_SPEED = 7;

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

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
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
  isStuck?: boolean;
  isFireball?: boolean;
  isBlackHole?: boolean;
  isPiercing?: boolean;
  stuckOffset?: number;
  spin?: number; // -1 to 1
  consecutiveWallHits?: number;
  lastInteractionFrame?: number;
}

export interface Portal {
  x: number;
  y: number;
  id: string;
  targetId: string;
  active: boolean;
  color: string;
}

export type PhysicalObjectType = 'GEAR' | 'FAN' | 'MAGNET' | 'WARP_GATE' | 'CRUSHER' | 'CONVEYOR';

export interface PhysicalObject {
  id: string;
  x: number;
  y: number;
  type: PhysicalObjectType;
  radius: number;
  width?: number;
  height?: number;
  rotation?: number;
  strength?: number;
  targetId?: string; // For Warp Gates
  state?: 'EXTENDED' | 'RETRACTED' | 'MOVING'; // For Crushers
  lastMoveTime?: number;
  direction?: 'LEFT' | 'RIGHT'; // For Conveyors
}

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}
