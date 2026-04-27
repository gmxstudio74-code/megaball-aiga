import pygame
import random
import math
import sys
from pygame import gfxdraw

# --- CONFIGURATION ---
WIDTH = 1200
HEIGHT = 800
FPS = 60

# COLORS (Matching React version)
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GREEN = (34, 197, 94)  # Tailwind green-500
RED = (239, 68, 68)    # Tailwind red-500
BLUE = (59, 130, 246)   # Tailwind blue-500
YELLOW = (234, 179, 8)  # Tailwind yellow-500
PURPLE = (168, 85, 247) # Tailwind purple-500
CYAN = (6, 182, 212)    # Tailwind cyan-500
ORANGE = (249, 115, 22) # Tailwind orange-500

BRICK_COLORS = [RED, GREEN, BLUE, YELLOW, PURPLE, CYAN, ORANGE, WHITE]

# --- UTILS ---
def draw_glow_circle(surface, x, y, radius, color, intensity=10):
    for i in range(intensity):
        alpha = int(100 * (1 - i / intensity))
        glow_color = (*color, alpha)
        glow_surface = pygame.Surface((radius * 4, radius * 4), pygame.SRCALPHA)
        pygame.draw.circle(glow_surface, glow_color, (radius * 2, radius * 2), radius + i * 2)
        surface.blit(glow_surface, (x - radius * 2, y - radius * 2))

def draw_beveled_rect(surface, rect, color, border_width=2):
    pygame.draw.rect(surface, color, rect)
    # Highlight
    pygame.draw.line(surface, WHITE, rect.topleft, rect.topright, border_width)
    pygame.draw.line(surface, WHITE, rect.topleft, rect.bottomleft, border_width)
    # Shadow
    pygame.draw.line(surface, (50, 50, 50), rect.bottomleft, rect.bottomright, border_width)
    pygame.draw.line(surface, (50, 50, 50), rect.topright, rect.bottomright, border_width)

# --- GAME OBJECTS ---

class Paddle:
    def __init__(self):
        self.width = 150
        self.height = 25
        self.x = WIDTH // 2 - self.width // 2
        self.y = HEIGHT - 80
        self.color = WHITE

    def update(self):
        mouse_x = pygame.mouse.get_pos()[0]
        self.x = mouse_x - self.width // 2
        if self.x < 10: self.x = 10
        if self.x > WIDTH - self.width - 10: self.x = WIDTH - self.width - 10

    def draw(self, screen):
        rect = pygame.Rect(self.x, self.y, self.width, self.height)
        draw_beveled_rect(screen, rect, self.color)
        # Add a subtle glow
        draw_glow_circle(screen, self.x + self.width // 2, self.y + self.height // 2, self.width // 2, WHITE, 5)

class Ball:
    def __init__(self):
        self.reset()

    def reset(self):
        self.radius = 10
        self.x = WIDTH // 2
        self.y = HEIGHT // 2
        self.dx = random.choice([-6, 6])
        self.dy = -6
        self.active = False

    def update(self):
        if not self.active:
            return
        self.x += self.dx
        self.y += self.dy
        if self.x - self.radius < 10 or self.x + self.radius > WIDTH - 10:
            self.dx *= -1
        if self.y - self.radius < 70: # HUD area
            self.dy *= -1

    def draw(self, screen):
        draw_glow_circle(screen, int(self.x), int(self.y), self.radius, WHITE, 8)
        pygame.draw.circle(screen, WHITE, (int(self.x), int(self.y)), self.radius)

class Brick:
    def __init__(self, x, y, color):
        self.width = 75
        self.height = 30
        self.x = x
        self.y = y
        self.color = color
        self.alive = True

    def draw(self, screen):
        if self.alive:
            rect = pygame.Rect(self.x, self.y, self.width, self.height)
            draw_beveled_rect(screen, rect, self.color)

class Game:
    def __init__(self):
        pygame.init()
        pygame.mixer.init()
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        pygame.display.set_caption("MEGABALL AGA - GMX EDITION")
        self.clock = pygame.time.Clock()
        
        # Fonts
        try:
            self.font_large = pygame.font.SysFont("Impact", 120, italic=True)
            self.font_medium = pygame.font.SysFont("Impact", 50, italic=True)
            self.font_small = pygame.font.SysFont("Courier New", 24, bold=True)
            self.font_hud = pygame.font.SysFont("Courier New", 18, bold=True)
        except:
            self.font_large = pygame.font.SysFont("Arial", 100, bold=True)
            self.font_medium = pygame.font.SysFont("Arial", 40, bold=True)
            self.font_small = pygame.font.SysFont("Arial", 20, bold=True)
            self.font_hud = pygame.font.SysFont("Arial", 16, bold=True)

        self.state = "START"
        self.score = 0
        self.lives = 3
        self.level = 1
        self.paddle = Paddle()
        self.ball = Ball()
        self.bricks = []
        self.init_level()
        
        self.scroller_text = "*** WELCOME TO MEGABALL AGA - A TRIBUTE TO THE GOLDEN ERA OF COMMODORE AMIGA *** PROMPTOVAL TO GMX *** HUDBU PROMPTOVAL GMX POMOCOU SUNO *** GREETINGS TO ALL RETRO GAMERS WORLDWIDE *** CRACKED BY NOBODY *** PLAY LOUD ***   "
        self.scroller_x = WIDTH
        self.scroller_angle = 0
        
        # Music Setup
        self.music_playing = False
        # Note: User needs to provide 'music.mp3' in the same folder
        try:
            pygame.mixer.music.load("music.mp3")
            pygame.mixer.music.set_volume(0.5)
        except:
            print("Music file 'music.mp3' not found. Please add it to the folder.")

    def init_level(self):
        self.bricks = []
        rows = 4 + self.level
        cols = (WIDTH - 40) // 80
        for r in range(rows):
            for c in range(cols):
                color = BRICK_COLORS[r % len(BRICK_COLORS)]
                self.bricks.append(Brick(c * 80 + 25, r * 35 + 120, color))

    def handle_collisions(self):
        if (self.ball.y + self.ball.radius >= self.paddle.y and 
            self.ball.x >= self.paddle.x and 
            self.ball.x <= self.paddle.x + self.paddle.width):
            self.ball.dy *= -1
            hit_pos = (self.ball.x - (self.paddle.x + self.paddle.width / 2)) / (self.paddle.width / 2)
            self.ball.dx = hit_pos * 10
            self.ball.y = self.paddle.y - self.ball.radius

        for brick in self.bricks:
            if brick.alive:
                if (self.ball.x + self.ball.radius > brick.x and 
                    self.ball.x - self.ball.radius < brick.x + brick.width and 
                    self.ball.y + self.ball.radius > brick.y and 
                    self.ball.y - self.ball.radius < brick.y + brick.height):
                    brick.alive = False
                    self.ball.dy *= -1
                    self.score += 100
                    break

    def draw_copper_bars(self):
        time = pygame.time.get_ticks() * 0.002
        for i in range(12):
            y_base = (HEIGHT // 12) * i
            y_offset = math.sin(time + i * 0.5) * 50
            y = y_base + y_offset
            color = BRICK_COLORS[i % len(BRICK_COLORS)]
            
            # Draw a gradient bar
            for j in range(20):
                alpha = int(100 * (1 - abs(j - 10) / 10))
                s = pygame.Surface((WIDTH, 2), pygame.SRCALPHA)
                s.fill((*color, alpha))
                self.screen.blit(s, (0, y + j))

    def draw_hud(self):
        pygame.draw.rect(self.screen, BLACK, (0, 0, WIDTH, 70))
        pygame.draw.line(self.screen, GREEN, (0, 70), (WIDTH, 70), 2)
        
        score_label = self.font_hud.render("SCORE", True, (0, 150, 0))
        score_val = self.font_medium.render(f"{self.score:06}", True, GREEN)
        self.screen.blit(score_label, (20, 5))
        self.screen.blit(score_val, (20, 20))
        
        lives_label = self.font_hud.render("LIVES", True, (0, 150, 0))
        self.screen.blit(lives_label, (WIDTH - 200, 5))
        for i in range(self.lives):
            pygame.draw.circle(self.screen, RED, (WIDTH - 180 + i * 25, 40), 8)
            
        level_box = pygame.Rect(WIDTH // 2 - 60, 15, 120, 40)
        pygame.draw.rect(self.screen, GREEN, level_box, 2)
        level_text = self.font_hud.render(f"LEVEL {self.level}", True, GREEN)
        self.screen.blit(level_text, (WIDTH // 2 - level_text.get_width() // 2, 25))

    def draw_scroller(self):
        self.scroller_x -= 5
        if self.scroller_x < -len(self.scroller_text) * 30:
            self.scroller_x = WIDTH
        
        self.scroller_angle += 0.1
        for i, char in enumerate(self.scroller_text):
            y_offset = math.sin(self.scroller_angle + i * 0.2) * 40
            char_surf = self.font_medium.render(char, True, WHITE)
            # Add glow to scroller text
            glow = self.font_medium.render(char, True, GREEN)
            self.screen.blit(glow, (self.scroller_x + i * 30 - 2, HEIGHT - 120 + y_offset - 2))
            self.screen.blit(char_surf, (self.scroller_x + i * 30, HEIGHT - 120 + y_offset))

    def run(self):
        while True:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    sys.exit()
                if event.type == pygame.MOUSEBUTTONDOWN:
                    if self.state == "START":
                        self.state = "PLAYING"
                        self.ball.active = True
                        if not self.music_playing:
                            try:
                                pygame.mixer.music.play(-1)
                                self.music_playing = True
                            except: pass
                    elif self.state == "PLAYING" and not self.ball.active:
                        self.ball.active = True
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_SPACE:
                        if self.state == "GAMEOVER":
                            self.score = 0
                            self.lives = 3
                            self.level = 1
                            self.init_level()
                            self.ball.reset()
                            self.state = "START"

            if self.state == "START":
                self.screen.fill(BLACK)
                self.draw_copper_bars()
                
                title = self.font_large.render("MEGABALL AGA", True, GREEN)
                # Title Glow
                title_glow = self.font_large.render("MEGABALL AGA", True, (0, 100, 0))
                self.screen.blit(title_glow, (WIDTH // 2 - title.get_width() // 2 + 5, 205))
                self.screen.blit(title, (WIDTH // 2 - title.get_width() // 2, 200))
                
                sub = self.font_medium.render("COMMODORE AMIGA TRIBUTE", True, (0, 200, 0))
                self.screen.blit(sub, (WIDTH // 2 - sub.get_width() // 2, 330))
                
                prompt = self.font_small.render("CLICK TO START MISSION", True, WHITE)
                if (pygame.time.get_ticks() // 500) % 2 == 0:
                    self.screen.blit(prompt, (WIDTH // 2 - prompt.get_width() // 2, 480))
                
                self.draw_scroller()

            elif self.state == "PLAYING":
                self.screen.fill(BLACK)
                # Border
                pygame.draw.rect(self.screen, GREEN, (5, 70, WIDTH - 10, HEIGHT - 75), 4)
                
                self.paddle.update()
                self.ball.update()
                self.handle_collisions()
                
                if self.ball.y > HEIGHT:
                    self.lives -= 1
                    if self.lives <= 0:
                        self.state = "GAMEOVER"
                    else:
                        self.ball.reset()
                
                if all(not b.alive for b in self.bricks):
                    self.level += 1
                    self.init_level()
                    self.ball.reset()

                self.paddle.draw(self.screen)
                self.ball.draw(self.screen)
                for brick in self.bricks:
                    brick.draw(self.screen)
                self.draw_hud()

            elif self.state == "GAMEOVER":
                self.screen.fill(BLACK)
                self.draw_copper_bars()
                title = self.font_large.render("GAME OVER", True, RED)
                self.screen.blit(title, (WIDTH // 2 - title.get_width() // 2, 300))
                score_text = self.font_medium.render(f"FINAL SCORE: {self.score}", True, WHITE)
                self.screen.blit(score_text, (WIDTH // 2 - score_text.get_width() // 2, 450))
                prompt = self.font_small.render("PRESS SPACE TO RESTART", True, GREEN)
                self.screen.blit(prompt, (WIDTH // 2 - prompt.get_width() // 2, 550))

            pygame.display.flip()
            self.clock.tick(FPS)

if __name__ == "__main__":
    game = Game()
    game.run()
