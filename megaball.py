import pygame
import random
import math
import sys
import time

# --- Constants ---
GAME_WIDTH = 1000
GAME_HEIGHT = 700

PADDLE_WIDTH = 120
PADDLE_HEIGHT = 20
PADDLE_SPEED = 10

BALL_RADIUS = 10
INITIAL_BALL_SPEED = 6

BRICK_ROWS = 10
BRICK_COLS = 14
BRICK_PADDING = 4
BRICK_OFFSET_TOP = 80
BRICK_OFFSET_LEFT = 40

COLORS = {
    'background': (5, 5, 5),
    'grid': (26, 26, 26),
    'paddle': (0, 255, 0),
    'ball': (255, 255, 255),
    'bricks': [
        (255, 0, 255), # Magenta
        (0, 255, 255), # Cyan
        (255, 255, 0), # Yellow
        (255, 0, 0),   # Red
        (0, 0, 255),   # Blue
        (255, 136, 0), # Orange
        (136, 0, 255), # Purple
        (0, 255, 136), # Spring Green
    ]
}

POWERUP_WIDTH = 30
POWERUP_HEIGHT = 15
POWERUP_SPEED = 2

LASER_WIDTH = 4
LASER_HEIGHT = 15
LASER_SPEED = 7

# PowerUp Types
class PowerUpType:
    WIDE_PADDLE = 'WIDE_PADDLE'
    LASER = 'LASER'
    EXTRA_LIFE = 'EXTRA_LIFE'
    SLOW_BALL = 'SLOW_BALL'
    FAST_BALL = 'FAST_BALL'

POWERUP_ICONS = {
    PowerUpType.WIDE_PADDLE: '🐘',
    PowerUpType.LASER: '🐉',
    PowerUpType.EXTRA_LIFE: '🐱',
    PowerUpType.SLOW_BALL: '🐢',
    PowerUpType.FAST_BALL: '🐆',
}

# --- Game Classes ---

class AudioService:
    def __init__(self):
        pygame.mixer.init()
        self.sounds = {}
        # Placeholders for sounds - in a real app, you'd load actual files
        # self.sounds['hit'] = pygame.mixer.Sound('hit.wav')
        # self.sounds['wall'] = pygame.mixer.Sound('wall.wav')
        # ...
        self.music_playing = False

    def play_sfx(self, name):
        if name in self.sounds:
            self.sounds[name].play()

    def play_music(self):
        # pygame.mixer.music.load('copper_bars.mp3')
        # pygame.mixer.music.play(-1)
        self.music_playing = True

    def stop_music(self):
        pygame.mixer.music.stop()
        self.music_playing = False

class Brick:
    def __init__(self, x, y, width, height, color):
        self.rect = pygame.Rect(x, y, width, height)
        self.color = color
        self.active = True

class PowerUp:
    def __init__(self, x, y, type):
        self.rect = pygame.Rect(x, y, POWERUP_WIDTH, POWERUP_HEIGHT)
        self.type = type
        self.active = True

class Laser:
    def __init__(self, x, y):
        self.rect = pygame.Rect(x, y, LASER_WIDTH, LASER_HEIGHT)
        self.active = True

class Particle:
    def __init__(self, x, y, color):
        self.x = x
        self.y = y
        self.vx = (random.random() - 0.5) * 10
        self.vy = (random.random() - 0.5) * 10
        self.life = 1.0 + random.random() * 0.5
        self.color = color
        self.size = random.random() * 4 + 1

    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.life -= 0.02
        return self.life > 0

class Star:
    def __init__(self):
        self.x = random.random() * GAME_WIDTH
        self.y = random.random() * GAME_HEIGHT
        self.size = random.random() * 2
        self.speed = random.random() * 0.5 + 0.1

    def update(self, speed_multiplier):
        self.y += self.speed * speed_multiplier
        if self.y > GAME_HEIGHT:
            self.y = 0

class Ball:
    def __init__(self):
        self.reset()

    def reset(self):
        self.x = GAME_WIDTH / 2
        self.y = GAME_HEIGHT - PADDLE_HEIGHT - BALL_RADIUS - 10
        self.dx = INITIAL_BALL_SPEED * (1 if random.random() > 0.5 else -1)
        self.dy = -INITIAL_BALL_SPEED
        self.trail = []

    def update_trail(self):
        self.trail.append((self.x, self.y))
        if len(self.trail) > 10:
            self.trail.pop(0)

class MegaballGame:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((GAME_WIDTH, GAME_HEIGHT))
        pygame.display.set_caption("MEGABALL AGA - Commodore Amiga Tribute")
        self.clock = pygame.time.Clock()
        self.font_large = pygame.font.SysFont("Arial", 80, bold=True, italic=True)
        self.font_medium = pygame.font.SysFont("Arial", 40, bold=True)
        self.font_small = pygame.font.SysFont("Courier New", 20)
        self.font_hud = pygame.font.SysFont("Courier New", 24, bold=True)
        self.font_emoji = pygame.font.SysFont("Segoe UI Emoji", 16) # For animal icons

        self.audio = AudioService()
        self.state = 'START'
        self.score = 0
        self.lives = 3
        self.level = 1
        self.is_muted = False
        self.active_powerups = set()
        self.screen_shake = 0
        self.is_respawning = False
        
        self.paddle = {
            'x': (GAME_WIDTH - PADDLE_WIDTH) / 2,
            'width': PADDLE_WIDTH,
            'has_laser': False,
            'spawn_timer': 0
        }
        self.ball = Ball()
        self.bricks = []
        self.powerups = []
        self.lasers = []
        self.last_laser_time = 0
        self.particles = []
        self.stars = [Star() for _ in range(100)]
        self.scroller_x = GAME_WIDTH
        self.scroller_text = "*** WELCOME TO MEGABALL AGA - A TRIBUTE TO THE GOLDEN ERA OF COMMODORE AMIGA *** CODE BY AIS AGENT *** MUSIC BY CONSTANTHARMONY819 *** GREETINGS TO ALL RETRO GAMERS WORLDWIDE *** PLAY LOUD ***"

    def init_bricks(self, level):
        self.bricks = []
        brick_width = (GAME_WIDTH - BRICK_OFFSET_LEFT * 2) / BRICK_COLS - BRICK_PADDING
        brick_height = 20

        for r in range(BRICK_ROWS):
            for c in range(BRICK_COLS):
                should_spawn = True
                if level == 2:
                    should_spawn = (r + c) % 2 == 0
                elif level == 3:
                    mid = BRICK_COLS // 2
                    dist = abs(c - mid)
                    should_spawn = dist <= r
                elif level == 4:
                    should_spawn = c % 3 != 0
                elif level == 5:
                    midR = BRICK_ROWS // 2
                    midC = BRICK_COLS // 2
                    should_spawn = r == midR or c == midC
                elif level == 6:
                    should_spawn = r == 0 or r == BRICK_ROWS - 1 or c == 0 or c == BRICK_COLS - 1
                elif level >= 7:
                    should_spawn = random.random() > 0.1 * (level - 6)

                if should_spawn:
                    x = c * (brick_width + BRICK_PADDING) + BRICK_OFFSET_LEFT
                    y = r * (brick_height + BRICK_PADDING) + BRICK_OFFSET_TOP
                    color = COLORS['bricks'][r % len(COLORS['bricks'])]
                    self.bricks.append(Brick(x, y, brick_width, brick_height, color))

    def start_game(self):
        self.state = 'PLAYING'
        self.score = 0
        self.lives = 3
        self.level = 1
        self.active_powerups = set()
        self.init_bricks(self.level)
        self.ball.reset()
        self.paddle['x'] = (GAME_WIDTH - PADDLE_WIDTH) / 2
        self.paddle['width'] = PADDLE_WIDTH
        self.paddle['has_laser'] = False
        self.paddle['spawn_timer'] = 60
        self.powerups = []
        self.lasers = []
        self.particles = []

    def spawn_powerup(self, x, y):
        if random.random() > 0.2: return
        types = [PowerUpType.WIDE_PADDLE, PowerUpType.LASER, PowerUpType.EXTRA_LIFE, PowerUpType.SLOW_BALL, PowerUpType.FAST_BALL]
        t = random.choice(types)
        self.powerups.append(PowerUp(x, y, t))

    def apply_powerup(self, type):
        self.audio.play_sfx('powerup')
        self.active_powerups.add(type)

        if type == PowerUpType.WIDE_PADDLE:
            self.paddle['width'] = PADDLE_WIDTH * 1.5
            # In Pygame we'd use a timer event or check time in update
            # For simplicity, we'll just keep it or use a simple frame counter
        elif type == PowerUpType.LASER:
            self.paddle['has_laser'] = True
        elif type == PowerUpType.EXTRA_LIFE:
            self.lives = min(self.lives + 1, 10)
        elif type == PowerUpType.SLOW_BALL:
            self.ball.dx *= 0.6
            self.ball.dy *= 0.6
        elif type == PowerUpType.FAST_BALL:
            self.ball.dx *= 1.4
            self.ball.dy *= 1.4

    def update(self):
        if self.state != 'PLAYING' or self.is_respawning:
            if self.state == 'START':
                self.scroller_x -= 5
                if self.scroller_x < -2000:
                    self.scroller_x = GAME_WIDTH
            return

        dt = self.clock.get_time()
        speed_multiplier = dt / 16.67

        if self.screen_shake > 0:
            self.screen_shake = max(0, self.screen_shake - 0.1 * speed_multiplier)

        if self.paddle['spawn_timer'] > 0:
            self.paddle['spawn_timer'] -= 1 * speed_multiplier

        # Ball movement
        self.ball.update_trail()
        self.ball.x += self.ball.dx * speed_multiplier
        self.ball.y += self.ball.dy * speed_multiplier

        # Stars
        for star in self.stars:
            star.update(speed_multiplier)

        # Particles
        self.particles = [p for p in self.particles if p.update()]

        # Wall collisions
        if self.ball.x + BALL_RADIUS > GAME_WIDTH or self.ball.x - BALL_RADIUS < 0:
            self.ball.dx = -self.ball.dx
            self.audio.play_sfx('wall')
            self.screen_shake = 2
        if self.ball.y - BALL_RADIUS < 0:
            self.ball.dy = -self.ball.dy
            self.audio.play_sfx('wall')
            self.screen_shake = 2

        # Paddle collision
        paddle_rect = pygame.Rect(self.paddle['x'], GAME_HEIGHT - PADDLE_HEIGHT, self.paddle['width'], PADDLE_HEIGHT)
        ball_rect = pygame.Rect(self.ball.x - BALL_RADIUS, self.ball.y - BALL_RADIUS, BALL_RADIUS*2, BALL_RADIUS*2)
        
        if ball_rect.colliderect(paddle_rect):
            hit_pos = (self.ball.x - (self.paddle['x'] + self.paddle['width'] / 2)) / (self.paddle['width'] / 2)
            self.ball.dx = hit_pos * INITIAL_BALL_SPEED * 1.5
            self.ball.dy = -abs(self.ball.dy)
            self.audio.play_sfx('paddle')
            self.screen_shake = 3

        # Power-ups
        for pu in self.powerups:
            if not pu.active: continue
            pu.rect.y += POWERUP_SPEED * speed_multiplier
            if pu.rect.colliderect(paddle_rect):
                pu.active = False
                self.apply_powerup(pu.type)
            if pu.rect.y > GAME_HEIGHT:
                pu.active = False

        # Lasers
        if self.paddle['has_laser']:
            now = pygame.time.get_ticks()
            if now - self.last_laser_time > 500:
                self.lasers.append(Laser(self.paddle['x'] + 10, GAME_HEIGHT - PADDLE_HEIGHT))
                self.lasers.append(Laser(self.paddle['x'] + self.paddle['width'] - 10, GAME_HEIGHT - PADDLE_HEIGHT))
                self.last_laser_time = now

        for laser in self.lasers:
            if not laser.active: continue
            laser.rect.y -= LASER_SPEED * speed_multiplier
            if laser.rect.y < 0: laser.active = False
            for brick in self.bricks:
                if brick.active and laser.rect.colliderect(brick.rect):
                    brick.active = False
                    laser.active = False
                    self.score += 10
                    self.audio.play_sfx('hit')
                    self.spawn_particles(brick.rect.centerx, brick.rect.centery, brick.color)
                    self.spawn_powerup(brick.rect.centerx, brick.rect.centery)
                    self.screen_shake = 2

        # Bottom collision
        if self.ball.y + BALL_RADIUS > GAME_HEIGHT:
            self.lives -= 1
            if self.lives <= 0:
                self.state = 'GAMEOVER'
            else:
                self.is_respawning = True
                self.audio.play_sfx('lose')
                # Simple delay in Pygame
                pygame.time.set_timer(pygame.USEREVENT + 1, 1000)

        # Brick collisions
        active_bricks = 0
        for brick in self.bricks:
            if not brick.active: continue
            active_bricks += 1
            if ball_rect.colliderect(brick.rect):
                brick.active = False
                self.ball.dy = -self.ball.dy
                self.score += 10
                self.audio.play_sfx('hit')
                self.spawn_particles(brick.rect.centerx, brick.rect.centery, brick.color)
                self.spawn_powerup(brick.rect.centerx, brick.rect.centery)
                self.screen_shake = 4

        if active_bricks == 0:
            self.state = 'LEVEL_COMPLETE'

    def spawn_particles(self, x, y, color):
        for _ in range(20):
            self.particles.append(Particle(x, y, color))

    def draw(self):
        self.screen.fill(COLORS['background'])
        
        # Shake offset
        shake_x = random.uniform(-self.screen_shake, self.screen_shake) * 2
        shake_y = random.uniform(-self.screen_shake, self.screen_shake) * 2
        
        # Draw Stars
        for star in self.stars:
            pygame.draw.rect(self.screen, (255, 255, 255), (star.x + shake_x, star.y + shake_y, star.size, star.size))

        # Draw Grid
        for x in range(0, GAME_WIDTH, 40):
            pygame.draw.line(self.screen, COLORS['grid'], (x + shake_x, 0), (x + shake_x, GAME_HEIGHT))
        for y in range(0, GAME_HEIGHT, 40):
            pygame.draw.line(self.screen, COLORS['grid'], (0, y + shake_y), (GAME_WIDTH, y + shake_y))

        # Draw Bricks
        for brick in self.bricks:
            if brick.active:
                pygame.draw.rect(self.screen, brick.color, (brick.rect.x + shake_x, brick.rect.y + shake_y, brick.rect.width, brick.rect.height))
                # Highlight
                pygame.draw.rect(self.screen, (255, 255, 255, 100), (brick.rect.x + shake_x, brick.rect.y + shake_y, brick.rect.width, 3))
                pygame.draw.rect(self.screen, (255, 255, 255, 100), (brick.rect.x + shake_x, brick.rect.y + shake_y, 3, brick.rect.height))

        # Draw Particles
        for p in self.particles:
            pygame.draw.rect(self.screen, p.color, (p.x + shake_x, p.y + shake_y, p.size, p.size))

        # Draw Paddle
        if self.state == 'PLAYING':
            spawn_progress = (60 - self.paddle['spawn_timer']) / 60 if self.paddle['spawn_timer'] > 0 else 1
            w = self.paddle['width'] * spawn_progress
            h = PADDLE_HEIGHT * spawn_progress
            x = self.paddle['x'] + (self.paddle['width'] - w) / 2
            y = (GAME_HEIGHT - PADDLE_HEIGHT) + (PADDLE_HEIGHT - h) / 2
            pygame.draw.rect(self.screen, COLORS['paddle'], (x + shake_x, y + shake_y, w, h))

        # Draw Power-ups
        for pu in self.powerups:
            if pu.active:
                pygame.draw.rect(self.screen, (255, 255, 255), (pu.rect.x + shake_x, pu.rect.y + shake_y, pu.rect.width, pu.rect.height), border_radius=8)
                icon_text = self.font_emoji.render(POWERUP_ICONS[pu.type], True, (0, 0, 0))
                self.screen.blit(icon_text, (pu.rect.x + 5 + shake_x, pu.rect.y + shake_y))

        # Draw Lasers
        for laser in self.lasers:
            if laser.active:
                pygame.draw.rect(self.screen, (255, 0, 0), (laser.rect.x + shake_x, laser.rect.y + shake_y, LASER_WIDTH, LASER_HEIGHT))

        # Draw Ball
        if self.state == 'PLAYING' and not self.is_respawning:
            # Trail
            for i, pos in enumerate(self.ball.trail):
                alpha = int((i / len(self.ball.trail)) * 127)
                s = pygame.Surface((BALL_RADIUS*2, BALL_RADIUS*2), pygame.SRCALPHA)
                pygame.draw.circle(s, (255, 255, 255, alpha), (BALL_RADIUS, BALL_RADIUS), BALL_RADIUS * (i / len(self.ball.trail)))
                self.screen.blit(s, (pos[0] - BALL_RADIUS + shake_x, pos[1] - BALL_RADIUS + shake_y))
            
            pygame.draw.circle(self.screen, COLORS['ball'], (int(self.ball.x + shake_x), int(self.ball.y + shake_y)), BALL_RADIUS)

        # HUD
        score_text = self.font_hud.render(f"SCORE: {str(self.score).zfill(6)}", True, (0, 255, 0))
        self.screen.blit(score_text, (20, 20))
        level_text = self.font_hud.render(f"LEVEL: {self.level}", True, (0, 255, 0))
        self.screen.blit(level_text, (GAME_WIDTH - 150, 20))
        
        # Lives (Hearts)
        for i in range(10):
            color = (255, 0, 0) if i < self.lives else (50, 50, 50)
            pygame.draw.circle(self.screen, color, (300 + i * 25, 35), 8)

        # Overlays
        if self.state == 'START':
            overlay = pygame.Surface((GAME_WIDTH, GAME_HEIGHT), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 200))
            self.screen.blit(overlay, (0, 0))
            
            title = self.font_large.render("MEGABALL AGA", True, (0, 255, 0))
            self.screen.blit(title, (GAME_WIDTH // 2 - title.get_width() // 2, 200))
            
            subtitle = self.font_medium.render("Commodore Amiga Tribute", True, (0, 200, 0))
            self.screen.blit(subtitle, (GAME_WIDTH // 2 - subtitle.get_width() // 2, 300))
            
            prompt = self.font_small.render("PRESS SPACE TO START MISSION", True, (255, 255, 255))
            self.screen.blit(prompt, (GAME_WIDTH // 2 - prompt.get_width() // 2, 450))
            
            # Scroller
            scroller = self.font_medium.render(self.scroller_text, True, (0, 255, 0))
            self.screen.blit(scroller, (self.scroller_x, 600))

        elif self.state == 'PAUSED':
            overlay = pygame.Surface((GAME_WIDTH, GAME_HEIGHT), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 150))
            self.screen.blit(overlay, (0, 0))
            text = self.font_large.render("PAUSED", True, (255, 255, 255))
            self.screen.blit(text, (GAME_WIDTH // 2 - text.get_width() // 2, GAME_HEIGHT // 2 - 50))

        elif self.state == 'GAMEOVER':
            overlay = pygame.Surface((GAME_WIDTH, GAME_HEIGHT), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 230))
            self.screen.blit(overlay, (0, 0))
            text = self.font_large.render("MISSION FAILED", True, (255, 0, 0))
            self.screen.blit(text, (GAME_WIDTH // 2 - text.get_width() // 2, 250))
            score_final = self.font_medium.render(f"FINAL SCORE: {self.score}", True, (255, 255, 255))
            self.screen.blit(score_final, (GAME_WIDTH // 2 - score_final.get_width() // 2, 350))
            prompt = self.font_small.render("PRESS SPACE TO TRY AGAIN", True, (0, 255, 0))
            self.screen.blit(prompt, (GAME_WIDTH // 2 - prompt.get_width() // 2, 450))

        elif self.state == 'LEVEL_COMPLETE':
            text = self.font_large.render("SECTOR CLEAR", True, (0, 255, 255))
            self.screen.blit(text, (GAME_WIDTH // 2 - text.get_width() // 2, GAME_HEIGHT // 2 - 50))
            prompt = self.font_small.render("PRESS SPACE FOR NEXT MISSION", True, (255, 255, 255))
            self.screen.blit(prompt, (GAME_WIDTH // 2 - prompt.get_width() // 2, GAME_HEIGHT // 2 + 50))

        pygame.display.flip()

    def run(self):
        running = True
        while running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_SPACE:
                        if self.state == 'START' or self.state == 'GAMEOVER':
                            self.start_game()
                        elif self.state == 'PLAYING':
                            self.state = 'PAUSED'
                        elif self.state == 'PAUSED':
                            self.state = 'PLAYING'
                        elif self.state == 'LEVEL_COMPLETE':
                            self.level += 1
                            self.init_bricks(self.level)
                            self.ball.reset()
                            self.state = 'PLAYING'
                
                if event.type == pygame.MOUSEMOTION and self.state == 'PLAYING':
                    mx, my = event.pos
                    self.paddle['x'] = mx - self.paddle['width'] / 2
                    if self.paddle['x'] < 0: self.paddle['x'] = 0
                    if self.paddle['x'] > GAME_WIDTH - self.paddle['width']:
                        self.paddle['x'] = GAME_WIDTH - self.paddle['width']

                if event.type == pygame.USEREVENT + 1:
                    self.is_respawning = False
                    self.ball.reset()
                    pygame.time.set_timer(pygame.USEREVENT + 1, 0)

            self.update()
            self.draw()
            self.clock.tick(60)

        pygame.quit()
        sys.exit()

if __name__ == "__main__":
    game = MegaballGame()
    game.run()
