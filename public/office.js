// Office Scene Renderer
// Renders an 8-bit pixel art office with workstations, avatars, and speech bubbles

const PIXEL = 3; // base pixel scale
const CANVAS_W = 960;
const CANVAS_H = 540;

// Office color palette
const FLOOR_COLOR_A = '#2A2A3A';
const FLOOR_COLOR_B = '#252535';
const WALL_COLOR = '#1A1A2E';
const WALL_TRIM = '#333355';
const CEILING_LINE = '#444466';

// Workstation positions [x, y] - center of desk
const WORKSTATIONS = [
  { x: 480, y: 300, isMain: true },   // Main Claude - center
  { x: 160, y: 220, isMain: false },  // Agent 1 - top left
  { x: 320, y: 220, isMain: false },  // Agent 2 - top center-left
  { x: 640, y: 220, isMain: false },  // Agent 3 - top center-right
  { x: 800, y: 220, isMain: false },  // Agent 4 - top right
  { x: 200, y: 400, isMain: false },  // Agent 5 - bottom left
  { x: 760, y: 400, isMain: false },  // Agent 6 - bottom right
];

// Ambient decorations
const DECORATIONS = [
  { type: 'plant', x: 60, y: 180 },
  { type: 'plant', x: 900, y: 180 },
  { type: 'clock', x: 480, y: 80 },
];

// Kitchen & Bar positions
const KITCHEN = { x: 30, y: 445, w: 160, h: 80 };
const BAR = { x: 790, y: 445, w: 160, h: 80 };

// NPC waypoints around the office
const NPC_WAYPOINTS = [
  { x: 110, y: 485 },  // kitchen
  { x: 300, y: 470 },  // left hallway
  { x: 480, y: 465 },  // center
  { x: 660, y: 470 },  // right hallway
  { x: 870, y: 485 },  // bar
  { x: 480, y: 350 },  // upper center
];

// Wandering NPC configs
const NPC_CONFIGS = [
  { color: '#10B981', lightColor: '#34D399', name: 'Pixel', route: [0, 1, 2, 3, 4, 3, 2, 1], speed: 0.5 },
  { color: '#EC4899', lightColor: '#F472B6', name: 'Byte',  route: [4, 3, 5, 1, 0, 1, 5, 3], speed: 0.4 },
  { color: '#06B6D4', lightColor: '#22D3EE', name: 'Chip',  route: [2, 5, 2, 0, 2, 4, 2, 5], speed: 0.35 },
];

// Poof particles for spawn/despawn effects
class PoofEffect {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.frame = 0;
    this.maxFrames = 20;
    this.done = false;
    this.particles = [];
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        angle: (Math.PI * 2 * i) / 8,
        speed: 1 + Math.random() * 2,
        size: 3 + Math.random() * 4,
        color: ['#FFFFFF', '#CCCCCC', '#AAAAAA', '#FF9E44'][Math.floor(Math.random() * 4)],
      });
    }
  }

  update() {
    this.frame++;
    if (this.frame >= this.maxFrames) this.done = true;
  }

  draw(ctx) {
    const progress = this.frame / this.maxFrames;
    const alpha = 1 - progress;
    ctx.globalAlpha = alpha;
    for (const p of this.particles) {
      const dist = p.speed * this.frame;
      const px = this.x + Math.cos(p.angle) * dist;
      const py = this.y + Math.sin(p.angle) * dist;
      const size = p.size * (1 - progress * 0.5);
      ctx.fillStyle = p.color;
      // Draw pixelated circle (square)
      ctx.fillRect(Math.floor(px - size/2), Math.floor(py - size/2), Math.ceil(size), Math.ceil(size));
    }
    ctx.globalAlpha = 1;
  }
}

class MessageEffect {
  constructor(fromX, fromY, toX, toY) {
    this.fromX = fromX;
    this.fromY = fromY;
    this.toX = toX;
    this.toY = toY;
    this.progress = 0;
    this.speed = 0.02;  // takes ~50 frames to travel
    this.done = false;
  }

  update() {
    this.progress += this.speed;
    if (this.progress >= 1) this.done = true;
  }

  draw(ctx) {
    const t = Math.min(this.progress, 1);
    // Ease in-out
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const x = this.fromX + (this.toX - this.fromX) * ease;
    const y = this.fromY + (this.toY - this.fromY) * ease - Math.sin(t * Math.PI) * 20;  // arc up

    // Draw a small pixel envelope (6x4)
    ctx.fillStyle = '#F59E0B';  // amber/yellow
    ctx.fillRect(Math.floor(x - 3), Math.floor(y - 2), 6, 4);
    ctx.fillStyle = '#FBBF24';
    ctx.fillRect(Math.floor(x - 2), Math.floor(y - 1), 4, 2);
    // Flap
    ctx.fillStyle = '#D97706';
    ctx.fillRect(Math.floor(x - 2), Math.floor(y - 2), 4, 1);
  }
}

class WanderingNPC {
  constructor(config) {
    this.color = config.color;
    this.lightColor = config.lightColor;
    this.name = config.name;
    this.speed = config.speed;
    this.route = config.route;
    this.routeIdx = 0;
    const wp = NPC_WAYPOINTS[this.route[0]];
    this.x = wp.x;
    this.y = wp.y;
    this.targetX = wp.x;
    this.targetY = wp.y;
    this.isIdle = true;
    this.idleTimer = 60 + Math.floor(Math.random() * 120);
    this.facing = 1;
    this.walkFrame = 0;
  }

  update() {
    if (this.isIdle) {
      this.idleTimer--;
      if (this.idleTimer <= 0) {
        this.isIdle = false;
        this.routeIdx = (this.routeIdx + 1) % this.route.length;
        const wp = NPC_WAYPOINTS[this.route[this.routeIdx]];
        this.targetX = wp.x;
        this.targetY = wp.y;
      }
      return;
    }

    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 2) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.isIdle = true;
      this.idleTimer = 80 + Math.floor(Math.random() * 160);
      return;
    }

    this.x += (dx / dist) * this.speed;
    this.y += (dy / dist) * this.speed;
    this.facing = dx > 0 ? 1 : -1;
    this.walkFrame++;
  }
}

class OfficeScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.effects = [];
    this.messageEffects = [];
    this.clockAngle = 0;
    this.ambientFrame = 0;
    this.npcs = NPC_CONFIGS.map(c => new WanderingNPC(c));
  }

  // Draw the tiled floor
  drawFloor(ctx) {
    const tileSize = 24;
    const floorY = 140;
    for (let y = floorY; y < CANVAS_H; y += tileSize) {
      for (let x = 0; x < CANVAS_W; x += tileSize) {
        const checker = ((Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2 === 0);
        ctx.fillStyle = checker ? FLOOR_COLOR_A : FLOOR_COLOR_B;
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
  }

  // Draw the wall and ceiling
  drawWall(ctx) {
    // Wall
    ctx.fillStyle = WALL_COLOR;
    ctx.fillRect(0, 0, CANVAS_W, 140);

    // Wall trim / baseboard
    ctx.fillStyle = WALL_TRIM;
    ctx.fillRect(0, 136, CANVAS_W, 4);

    // Ceiling line
    ctx.fillStyle = CEILING_LINE;
    ctx.fillRect(0, 0, CANVAS_W, 2);

    // Wall panels (subtle vertical lines)
    ctx.fillStyle = '#1E1E32';
    for (let x = 0; x < CANVAS_W; x += 120) {
      ctx.fillRect(x, 0, 2, 140);
    }

    // Window frames on wall
    this.drawWindow(ctx, 120, 30, 100, 80);
    this.drawWindow(ctx, 740, 30, 100, 80);

    // Poster / art on wall
    this.drawPoster(ctx, 430, 35, 100, 70);
  }

  drawWindow(ctx, x, y, w, h) {
    // Frame
    ctx.fillStyle = '#444466';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    // Glass - dark blue sky
    ctx.fillStyle = '#0D1B2A';
    ctx.fillRect(x, y, w, h);
    // Cross bars
    ctx.fillStyle = '#444466';
    ctx.fillRect(x + w/2 - 1, y, 2, h);
    ctx.fillRect(x, y + h/2 - 1, w, 2);
    // Stars
    ctx.fillStyle = '#FFFFFF';
    const starPositions = [
      [x + 15, y + 15], [x + 70, y + 25], [x + 40, y + 55],
      [x + 85, y + 12], [x + 25, y + 45],
    ];
    for (const [sx, sy] of starPositions) {
      ctx.fillRect(sx, sy, 2, 2);
    }
  }

  drawPoster(ctx, x, y, w, h) {
    // Frame
    ctx.fillStyle = '#555577';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    // Background
    ctx.fillStyle = '#FF6B00';
    ctx.fillRect(x, y, w, h);
    // Simple Claude logo-ish design
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x + 30, y + 15, 40, 8);
    ctx.fillRect(x + 35, y + 28, 30, 4);
    ctx.fillRect(x + 25, y + 38, 50, 4);
    ctx.fillStyle = '#2D2D2D';
    ctx.font = '6px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CLAUDE', x + w/2, y + h - 8);
    ctx.textAlign = 'start';
  }

  // Draw clock decoration
  drawClock(ctx, x, y) {
    const r = 16;
    // Clock face
    ctx.fillStyle = '#333355';
    ctx.fillRect(x - r - 2, y - r - 2, r*2 + 4, r*2 + 4);
    ctx.fillStyle = '#EEEEEE';
    ctx.fillRect(x - r, y - r, r*2, r*2);
    // Center dot
    ctx.fillStyle = '#333333';
    ctx.fillRect(x - 1, y - 1, 3, 3);
    // Hour hand
    const ha = this.clockAngle;
    ctx.fillStyle = '#333333';
    const hx = x + Math.cos(ha) * 8;
    const hy = y + Math.sin(ha) * 8;
    ctx.fillRect(Math.floor(hx), Math.floor(hy), 2, 2);
    ctx.fillRect(Math.floor((x + hx)/2), Math.floor((y + hy)/2), 2, 2);
    // Minute hand
    const ma = this.clockAngle * 12;
    ctx.fillStyle = '#666666';
    const mx = x + Math.cos(ma) * 12;
    const my = y + Math.sin(ma) * 12;
    ctx.fillRect(Math.floor(mx), Math.floor(my), 2, 2);
    ctx.fillRect(Math.floor((x + mx)/2), Math.floor((y + my)/2), 2, 2);
    ctx.fillRect(Math.floor((x + mx)/2 + (mx - x)/4), Math.floor((y + my)/2 + (my - y)/4), 2, 2);
  }

  // Draw a workstation (desk + monitor + chair)
  drawWorkstation(ctx, station, occupied) {
    const { x, y, isMain } = station;
    const scale = isMain ? PIXEL + 1 : PIXEL;

    // Chair (behind desk)
    if (typeof drawSprite === 'function' && SPRITES.CHAIR) {
      drawSprite(ctx, SPRITES.CHAIR, x - 18, y + 10, scale - 1);
    }

    // Desk
    if (typeof drawSprite === 'function' && SPRITES.DESK) {
      drawSprite(ctx, SPRITES.DESK, x - 48, y, scale);
    } else {
      // Fallback desk
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(x - 40, y, 80, 12);
      ctx.fillStyle = '#A0782C';
      ctx.fillRect(x - 38, y + 2, 76, 8);
      // Legs
      ctx.fillStyle = '#6B5010';
      ctx.fillRect(x - 36, y + 12, 4, 16);
      ctx.fillRect(x + 32, y + 12, 4, 16);
    }

    // Monitor on desk
    if (typeof drawSprite === 'function' && SPRITES.MONITOR) {
      drawSprite(ctx, SPRITES.MONITOR, x - 18, y - 36, scale);
    } else {
      // Fallback monitor
      ctx.fillStyle = '#333333';
      ctx.fillRect(x - 16, y - 32, 32, 24);
      ctx.fillStyle = '#003300';
      ctx.fillRect(x - 14, y - 30, 28, 20);
      // Screen glow
      if (occupied) {
        ctx.fillStyle = '#00FF41';
        ctx.globalAlpha = 0.3 + Math.sin(this.ambientFrame * 0.05) * 0.1;
        ctx.fillRect(x - 14, y - 30, 28, 20);
        ctx.globalAlpha = 1;
      }
      // Stand
      ctx.fillStyle = '#333333';
      ctx.fillRect(x - 4, y - 8, 8, 8);
    }
  }

  // Draw an avatar at a workstation
  drawAvatar(ctx, station, avatarType, isWorking, animFrame) {
    const { x, y, isMain } = station;
    const scale = isMain ? PIXEL + 1 : PIXEL;

    let sprite;
    if (avatarType === 'claude') {
      if (isWorking && SPRITES.CLAUDE_WORKING) {
        const frames = SPRITES.CLAUDE_WORKING;
        sprite = frames[animFrame % frames.length];
      } else {
        sprite = SPRITES.CLAUDE_IDLE;
      }
    } else if (avatarType === 'gemini') {
      if (isWorking && SPRITES.GEMINI_WORKING) {
        const frames = SPRITES.GEMINI_WORKING;
        sprite = frames[animFrame % frames.length];
      } else {
        sprite = SPRITES.GEMINI_IDLE;
      }
    } else {
      if (isWorking && SPRITES.AGENT_WORKING) {
        const frames = SPRITES.AGENT_WORKING;
        sprite = frames[animFrame % frames.length];
      } else {
        sprite = SPRITES.AGENT_IDLE;
      }
    }

    if (typeof drawSprite === 'function' && sprite) {
      drawSprite(ctx, sprite, x - 24, y - 20, scale);
    } else {
      // Fallback avatar (simple pixel character)
      const color = avatarType === 'claude' ? '#FF6B00' : '#4A90D9';
      const lightColor = avatarType === 'claude' ? '#FF9E44' : '#6BB5FF';
      // Head
      ctx.fillStyle = color;
      ctx.fillRect(x - 8, y - 18, 16, 14);
      // Eyes
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x - 5, y - 14, 4, 4);
      ctx.fillRect(x + 1, y - 14, 4, 4);
      ctx.fillStyle = '#000000';
      const eyeOffset = isWorking ? Math.sin(animFrame * 0.5) * 1 : 0;
      ctx.fillRect(x - 4 + eyeOffset, y - 13, 2, 2);
      ctx.fillRect(x + 2 + eyeOffset, y - 13, 2, 2);
      // Antenna
      ctx.fillStyle = lightColor;
      ctx.fillRect(x - 1, y - 22, 2, 4);
      ctx.fillRect(x - 2, y - 24, 4, 3);
      // Body
      ctx.fillStyle = '#2D2D2D';
      ctx.fillRect(x - 6, y - 4, 12, 10);
      // Arms
      if (isWorking) {
        const armOffset = Math.sin(animFrame * 0.8) * 3;
        ctx.fillStyle = '#4A4A4A';
        ctx.fillRect(x - 12 + armOffset, y, 6, 4);
        ctx.fillRect(x + 6 - armOffset, y, 6, 4);
      } else {
        ctx.fillStyle = '#4A4A4A';
        ctx.fillRect(x - 10, y - 2, 4, 6);
        ctx.fillRect(x + 6, y - 2, 4, 6);
      }
    }
  }

  // Draw speech bubble with task text
  drawSpeechBubble(ctx, x, y, text, isMain, options) {
    if (!text) return;
    options = options || {};

    if (typeof drawBubble === 'function') {
      drawBubble(ctx, text, x, y - 60, isMain ? 120 : 90, {
        accentColor: options.accentColor || '#FF6B00',
        animFrame: options.animFrame || 0,
        isWorking: options.isWorking !== false,
      });
      return;
    }

    // Fallback bubble (dark theme)
    const maxWidth = isMain ? 120 : 90;
    const fontSize = isMain ? 8 : 7;
    ctx.font = `${fontSize}px "Press Start 2P", monospace`;

    // Measure text and wrap
    const lines = [];
    const words = text.split(' ');
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth - 16) {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = fontSize + 4;
    const bubbleH = lines.length * lineHeight + 12;
    const bubbleW = maxWidth;
    const bubbleX = x - bubbleW / 2;
    const bubbleY = y - 70 - bubbleH;

    // Bubble background (dark)
    ctx.fillStyle = 'rgba(20, 20, 35, 0.92)';
    ctx.fillRect(bubbleX, bubbleY, bubbleW, bubbleH);

    // Pixel border
    ctx.fillStyle = '#555577';
    ctx.fillRect(bubbleX, bubbleY, bubbleW, 2);                    // top
    ctx.fillRect(bubbleX, bubbleY + bubbleH - 2, bubbleW, 2);      // bottom
    ctx.fillRect(bubbleX, bubbleY, 2, bubbleH);                    // left
    ctx.fillRect(bubbleX + bubbleW - 2, bubbleY, 2, bubbleH);      // right

    // Pointer triangle (dark)
    ctx.fillStyle = 'rgba(20, 20, 35, 0.92)';
    ctx.fillRect(x - 4, bubbleY + bubbleH, 8, 4);
    ctx.fillRect(x - 2, bubbleY + bubbleH + 4, 4, 3);
    ctx.fillStyle = '#555577';
    ctx.fillRect(x - 6, bubbleY + bubbleH, 2, 4);
    ctx.fillRect(x + 4, bubbleY + bubbleH, 2, 4);
    ctx.fillRect(x - 4, bubbleY + bubbleH + 4, 2, 3);
    ctx.fillRect(x + 2, bubbleY + bubbleH + 4, 2, 3);

    // Text (light)
    ctx.fillStyle = '#EEEEEE';
    ctx.textAlign = 'center';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, bubbleY + 10 + i * lineHeight + fontSize);
    }
    ctx.textAlign = 'start';
  }

  // Draw decorations (plants, coffee machine)
  drawDecorations(ctx) {
    for (const dec of DECORATIONS) {
      if (dec.type === 'plant') {
        if (typeof drawSprite === 'function' && SPRITES.PLANT) {
          drawSprite(ctx, SPRITES.PLANT, dec.x, dec.y, PIXEL);
        } else {
          // Fallback plant
          ctx.fillStyle = '#795548';
          ctx.fillRect(dec.x, dec.y + 16, 12, 10);
          ctx.fillStyle = '#4CAF50';
          ctx.fillRect(dec.x - 2, dec.y, 16, 18);
          ctx.fillStyle = '#8BC34A';
          ctx.fillRect(dec.x + 2, dec.y - 4, 8, 8);
        }
      } else if (dec.type === 'coffee') {
        if (typeof drawSprite === 'function' && SPRITES.COFFEE) {
          drawSprite(ctx, SPRITES.COFFEE, dec.x, dec.y, PIXEL);
        } else {
          // Fallback coffee machine
          ctx.fillStyle = '#333333';
          ctx.fillRect(dec.x, dec.y, 20, 30);
          ctx.fillStyle = '#555555';
          ctx.fillRect(dec.x + 2, dec.y + 2, 16, 12);
          // Red light
          ctx.fillStyle = '#FF0000';
          ctx.fillRect(dec.x + 8, dec.y + 18, 4, 4);
          // Steam
          if (Math.sin(this.ambientFrame * 0.1) > 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(dec.x + 6, dec.y - 6, 2, 4);
            ctx.fillRect(dec.x + 10, dec.y - 8, 2, 6);
          }
        }
      } else if (dec.type === 'clock') {
        this.drawClock(ctx, dec.x, dec.y);
      }
    }
  }

  // Draw a name tag below the workstation
  drawNameTag(ctx, x, y, name, isDone) {
    const tagY = y + 32;
    const fontSize = 6;
    ctx.font = `${fontSize}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';

    // Truncate long names
    let displayName = name.length > 12 ? name.substring(0, 11) + '..' : name;

    // Background pill
    const textWidth = ctx.measureText(displayName).width;
    const padX = 6;
    const padY = 3;
    const pillW = textWidth + padX * 2;
    const pillH = fontSize + padY * 2;

    ctx.fillStyle = isDone ? 'rgba(34, 197, 94, 0.2)' : 'rgba(74, 144, 217, 0.2)';
    ctx.fillRect(Math.floor(x - pillW / 2), tagY, Math.ceil(pillW), pillH);

    // Border
    ctx.fillStyle = isDone ? 'rgba(34, 197, 94, 0.4)' : 'rgba(74, 144, 217, 0.4)';
    ctx.fillRect(Math.floor(x - pillW / 2), tagY, Math.ceil(pillW), 1);
    ctx.fillRect(Math.floor(x - pillW / 2), tagY + pillH - 1, Math.ceil(pillW), 1);
    ctx.fillRect(Math.floor(x - pillW / 2), tagY, 1, pillH);
    ctx.fillRect(Math.floor(x + pillW / 2) - 1, tagY, 1, pillH);

    // Text
    ctx.fillStyle = isDone ? '#22c55e' : '#6BB5FF';
    ctx.fillText(displayName, x, tagY + fontSize + padY - 1);

    // Done checkmark
    if (isDone) {
      ctx.fillStyle = '#22c55e';
      ctx.fillText('\u2713', x + pillW / 2 + 6, tagY + fontSize + padY - 1);
    }

    ctx.textAlign = 'start';
  }

  // Draw 8-bit kitchen area
  drawKitchen(ctx) {
    const k = KITCHEN;

    // Back wall / backsplash
    ctx.fillStyle = '#1E1E32';
    ctx.fillRect(k.x, k.y - 10, k.w, 14);
    // Tile pattern on backsplash
    ctx.fillStyle = '#2A2A42';
    for (let tx = k.x + 4; tx < k.x + k.w; tx += 12) {
      ctx.fillRect(tx, k.y - 8, 8, 4);
      ctx.fillRect(tx + 6, k.y - 2, 8, 4);
    }

    // Counter top (steel gray)
    ctx.fillStyle = '#555566';
    ctx.fillRect(k.x, k.y + 2, k.w, 6);
    ctx.fillStyle = '#666677';
    ctx.fillRect(k.x + 2, k.y + 3, k.w - 4, 4);

    // Counter body (dark cabinet)
    ctx.fillStyle = '#2D2D3D';
    ctx.fillRect(k.x, k.y + 8, k.w, 30);
    // Cabinet doors
    ctx.fillStyle = '#333344';
    ctx.fillRect(k.x + 4, k.y + 10, 34, 26);
    ctx.fillRect(k.x + 42, k.y + 10, 34, 26);
    ctx.fillRect(k.x + 80, k.y + 10, 34, 26);
    ctx.fillRect(k.x + 118, k.y + 10, 34, 26);
    // Door handles
    ctx.fillStyle = '#888899';
    ctx.fillRect(k.x + 32, k.y + 20, 4, 8);
    ctx.fillRect(k.x + 70, k.y + 20, 4, 8);
    ctx.fillRect(k.x + 108, k.y + 20, 4, 8);
    ctx.fillRect(k.x + 146, k.y + 20, 4, 8);

    // Mini fridge (left side, tall)
    ctx.fillStyle = '#CCCCDD';
    ctx.fillRect(k.x - 2, k.y - 30, 28, 34);
    ctx.fillStyle = '#BBBBCC';
    ctx.fillRect(k.x, k.y - 28, 24, 14);
    ctx.fillRect(k.x, k.y - 12, 24, 14);
    // Fridge handle
    ctx.fillStyle = '#888899';
    ctx.fillRect(k.x + 20, k.y - 24, 2, 8);
    ctx.fillRect(k.x + 20, k.y - 8, 2, 8);
    // Fridge border
    ctx.fillStyle = '#999AAA';
    ctx.fillRect(k.x - 2, k.y - 30, 28, 2);
    ctx.fillRect(k.x - 2, k.y - 30, 2, 34);
    ctx.fillRect(k.x + 24, k.y - 30, 2, 34);

    // Microwave on counter
    ctx.fillStyle = '#444455';
    ctx.fillRect(k.x + 90, k.y - 16, 36, 20);
    ctx.fillStyle = '#111122';
    ctx.fillRect(k.x + 93, k.y - 14, 20, 16);
    // Microwave light
    const microGlow = Math.sin(this.ambientFrame * 0.04) > 0.5;
    ctx.fillStyle = microGlow ? '#00FF41' : '#333333';
    ctx.fillRect(k.x + 118, k.y - 10, 4, 4);
    // Microwave buttons
    ctx.fillStyle = '#666677';
    ctx.fillRect(k.x + 118, k.y - 4, 4, 2);

    // Coffee mug on counter
    ctx.fillStyle = '#FF6B00';
    ctx.fillRect(k.x + 55, k.y - 6, 8, 8);
    ctx.fillStyle = '#FF9E44';
    ctx.fillRect(k.x + 56, k.y - 5, 6, 5);
    // Steam from mug
    if (Math.sin(this.ambientFrame * 0.08) > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(k.x + 57, k.y - 10, 2, 3);
      ctx.fillRect(k.x + 60, k.y - 12, 2, 4);
    }

    // "KITCHEN" label
    ctx.fillStyle = '#555566';
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('KITCHEN', k.x + k.w / 2, k.y + 50);
    ctx.textAlign = 'start';
  }

  // Draw 8-bit bar area
  drawBar(ctx) {
    const b = BAR;

    // Back shelf (behind bar)
    ctx.fillStyle = '#2A1A0A';
    ctx.fillRect(b.x + 20, b.y - 30, 120, 34);
    ctx.fillStyle = '#3D2A14';
    // Shelf boards
    ctx.fillRect(b.x + 22, b.y - 14, 116, 3);
    ctx.fillRect(b.x + 22, b.y + 0, 116, 3);

    // Bottles on shelf (colorful)
    const bottles = [
      { x: 30, h: 14, color: '#22c55e' },  // green
      { x: 46, h: 12, color: '#3B82F6' },  // blue
      { x: 60, h: 16, color: '#EF4444' },  // red
      { x: 74, h: 13, color: '#F59E0B' },  // amber
      { x: 88, h: 15, color: '#8B5CF6' },  // purple
      { x: 102, h: 12, color: '#EC4899' }, // pink
      { x: 116, h: 14, color: '#06B6D4' }, // cyan
    ];
    for (const bot of bottles) {
      // Bottle body
      ctx.fillStyle = bot.color;
      ctx.fillRect(b.x + bot.x, b.y - 14 - bot.h, 8, bot.h);
      // Bottle neck
      ctx.fillRect(b.x + bot.x + 2, b.y - 14 - bot.h - 4, 4, 5);
      // Bottle highlight
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(b.x + bot.x + 2, b.y - 14 - bot.h + 2, 2, bot.h - 4);
    }

    // Second row of bottles (lower shelf)
    const bottles2 = [
      { x: 38, h: 10, color: '#14B8A6' },
      { x: 54, h: 11, color: '#D946EF' },
      { x: 68, h: 9, color: '#FF6B00' },
      { x: 82, h: 12, color: '#64748B' },
      { x: 98, h: 10, color: '#A3E635' },
      { x: 112, h: 11, color: '#FB923C' },
    ];
    for (const bot of bottles2) {
      ctx.fillStyle = bot.color;
      ctx.fillRect(b.x + bot.x, b.y - bot.h, 8, bot.h);
      ctx.fillRect(b.x + bot.x + 2, b.y - bot.h - 3, 4, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(b.x + bot.x + 2, b.y - bot.h + 2, 2, bot.h - 4);
    }

    // Bar counter top (dark wood)
    ctx.fillStyle = '#5C3D1E';
    ctx.fillRect(b.x, b.y + 4, b.w, 8);
    ctx.fillStyle = '#6B4A28';
    ctx.fillRect(b.x + 2, b.y + 5, b.w - 4, 6);
    // Wood grain
    ctx.fillStyle = '#7A5832';
    for (let gx = b.x + 6; gx < b.x + b.w - 6; gx += 14) {
      ctx.fillRect(gx, b.y + 7, 8, 2);
    }

    // Bar counter front
    ctx.fillStyle = '#3D2A14';
    ctx.fillRect(b.x, b.y + 12, b.w, 26);
    // Panel details
    ctx.fillStyle = '#4A3320';
    ctx.fillRect(b.x + 6, b.y + 14, 44, 22);
    ctx.fillRect(b.x + 54, b.y + 14, 44, 22);
    ctx.fillRect(b.x + 102, b.y + 14, 50, 22);

    // Bar stools (3)
    for (let i = 0; i < 3; i++) {
      const sx = b.x + 20 + i * 50;
      const sy = b.y + 42;
      // Seat
      ctx.fillStyle = '#4A4A5A';
      ctx.fillRect(sx - 8, sy, 16, 6);
      ctx.fillStyle = '#5A5A6A';
      ctx.fillRect(sx - 6, sy + 1, 12, 4);
      // Leg
      ctx.fillStyle = '#333344';
      ctx.fillRect(sx - 1, sy + 6, 3, 14);
      // Base
      ctx.fillRect(sx - 6, sy + 18, 13, 3);
    }

    // Glasses on counter
    ctx.fillStyle = 'rgba(200,220,255,0.4)';
    ctx.fillRect(b.x + 30, b.y - 4, 6, 8);
    ctx.fillRect(b.x + 80, b.y - 4, 6, 8);
    ctx.fillRect(b.x + 130, b.y - 4, 6, 8);
    // Liquid in glasses
    ctx.fillStyle = 'rgba(59,130,246,0.3)';
    ctx.fillRect(b.x + 31, b.y - 1, 4, 4);
    ctx.fillStyle = 'rgba(239,68,68,0.3)';
    ctx.fillRect(b.x + 81, b.y - 1, 4, 4);
    ctx.fillStyle = 'rgba(34,197,94,0.3)';
    ctx.fillRect(b.x + 131, b.y - 1, 4, 4);

    // Neon sign above bar
    const neonGlow = 0.6 + Math.sin(this.ambientFrame * 0.03) * 0.3;
    ctx.globalAlpha = neonGlow;
    ctx.fillStyle = '#FF00FF';
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BAR', b.x + b.w / 2, b.y - 38);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
  }

  // Draw a wandering NPC
  drawWanderingNPC(ctx, npc) {
    const x = Math.floor(npc.x);
    const y = Math.floor(npc.y);
    const bounce = npc.isIdle ? 0 : Math.floor(Math.sin(npc.walkFrame * 0.15) * 2);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(x - 5, y + 6, 10, 3);

    // Head
    ctx.fillStyle = npc.color;
    ctx.fillRect(x - 5, y - 14 + bounce, 10, 9);

    // Eyes
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - 3, y - 11 + bounce, 3, 3);
    ctx.fillRect(x + 1, y - 11 + bounce, 3, 3);
    ctx.fillStyle = '#000000';
    const eyeDir = npc.isIdle ? 0 : npc.facing;
    ctx.fillRect(x - 2 + eyeDir, y - 10 + bounce, 2, 2);
    ctx.fillRect(x + 2 + eyeDir, y - 10 + bounce, 2, 2);

    // Antenna
    ctx.fillStyle = npc.lightColor;
    ctx.fillRect(x, y - 17 + bounce, 2, 3);
    ctx.fillRect(x - 1, y - 19 + bounce, 4, 2);
    // Antenna blink
    if (Math.sin(this.ambientFrame * 0.05 + npc.x) > 0.7) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x, y - 19 + bounce, 2, 2);
    }

    // Body
    ctx.fillStyle = '#2D2D2D';
    ctx.fillRect(x - 4, y - 5 + bounce, 8, 7);
    // Badge
    ctx.fillStyle = npc.color;
    ctx.fillRect(x - 2, y - 3 + bounce, 4, 3);

    // Legs (animated when walking)
    ctx.fillStyle = '#4A4A4A';
    if (!npc.isIdle) {
      const legOffset = Math.floor(Math.sin(npc.walkFrame * 0.2) * 3);
      ctx.fillRect(x - 3 + legOffset, y + 2, 3, 4);
      ctx.fillRect(x + 1 - legOffset, y + 2, 3, 4);
    } else {
      ctx.fillRect(x - 3, y + 2, 3, 4);
      ctx.fillRect(x + 1, y + 2, 3, 4);
    }
  }

  // Add a poof effect at position
  addPoof(x, y) {
    this.effects.push(new PoofEffect(x, y));
  }

  // Add a message envelope effect flying between workstations
  addMessageEffect(fromStation, toStation) {
    this.messageEffects.push(new MessageEffect(
      fromStation.x, fromStation.y - 30,
      toStation.x, toStation.y - 30
    ));
  }

  // Main render method
  render(state) {
    const ctx = this.ctx;
    this.ambientFrame++;
    this.clockAngle += 0.001;

    // Clear
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Update NPCs
    for (const npc of this.npcs) {
      npc.update();
    }

    // Draw background
    this.drawFloor(ctx);
    this.drawWall(ctx);
    this.drawDecorations(ctx);

    // Draw kitchen & bar areas
    this.drawKitchen(ctx);
    this.drawBar(ctx);

    // Draw all workstations (collect bubbles and name tags for top-layer passes)
    const pendingBubbles = [];
    const pendingNameTags = [];

    for (let i = 0; i < WORKSTATIONS.length; i++) {
      const station = WORKSTATIONS[i];
      let occupied = false;
      let isWorking = false;
      let avatarType = 'agent';
      let task = null;
      let animFrame = this.ambientFrame;

      let agentName = null;
      let isDone = false;

      if (i === 0) {
        // Main Claude workstation
        occupied = true;
        isWorking = state.mainAvatar.status === 'working';
        avatarType = 'claude';
        task = state.mainAvatar.currentTask;
      } else {
        // Agent workstations
        const agent = state.agents.find(a => a.workstationIndex === i);
        if (agent) {
          occupied = true;
          isWorking = agent.status === 'working';
          isDone = agent.status === 'done';
          avatarType = agent.avatarType || 'agent';
          task = isWorking ? agent.task : null;
          agentName = agent.name;
          // Permanent agents always show as occupied even when idle
          if (agent.permanent && agent.status === 'idle') {
            occupied = true;
          }
        }
      }

      this.drawWorkstation(ctx, station, occupied);

      if (occupied) {
        this.drawAvatar(ctx, station, avatarType, isWorking, Math.floor(animFrame / 8));
        if (task) {
          pendingBubbles.push({
            x: station.x,
            y: station.y,
            task: task,
            isMain: station.isMain,
            options: {
              accentColor: avatarType === 'claude' ? '#FF6B00' : '#4A90D9',
              animFrame: animFrame,
              isWorking: isWorking,
            }
          });
        }
        if (agentName) {
          pendingNameTags.push({ x: station.x, y: station.y, name: agentName, isDone });
        }
      }
    }

    // Draw wandering NPCs
    for (const npc of this.npcs) {
      this.drawWanderingNPC(ctx, npc);
    }

    // Draw effects (poofs)
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].update();
      this.effects[i].draw(ctx);
      if (this.effects[i].done) {
        this.effects.splice(i, 1);
      }
    }

    // Draw deferred name tags (after NPCs and poofs, before bubbles)
    for (const nt of pendingNameTags) {
      this.drawNameTag(ctx, nt.x, nt.y, nt.name, nt.isDone);
    }

    // Draw speech bubbles on top of everything
    for (const b of pendingBubbles) {
      this.drawSpeechBubble(ctx, b.x, b.y, b.task, b.isMain, b.options);
    }

    // Draw message effects (flying envelopes)
    for (let i = this.messageEffects.length - 1; i >= 0; i--) {
      this.messageEffects[i].update();
      this.messageEffects[i].draw(ctx);
      if (this.messageEffects[i].done) {
        this.messageEffects.splice(i, 1);
      }
    }

    // Draw "waiting for connection" overlay if disconnected
    if (state.disconnected) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#FF4444';
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DISCONNECTED', CANVAS_W / 2, CANVAS_H / 2 - 10);
      ctx.fillStyle = '#AAAAAA';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('Reconnecting...', CANVAS_W / 2, CANVAS_H / 2 + 10);
      ctx.textAlign = 'start';
    }

    // Idle title card when no activity (ignore permanent agents like Gemini)
    const transientAgents = state.agents.filter(a => !a.permanent);
    if (!state.disconnected && state.mainAvatar.status === 'idle' && transientAgents.length === 0 && !state.mainAvatar.currentTask) {
      ctx.fillStyle = '#00FF41';
      ctx.globalAlpha = 0.5 + Math.sin(this.ambientFrame * 0.03) * 0.3;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for commands...', CANVAS_W / 2, CANVAS_H - 30);
      ctx.textAlign = 'start';
      ctx.globalAlpha = 1;
    }
  }
}
