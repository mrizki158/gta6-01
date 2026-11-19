// Keyboard and mouse state. The game reads `keys` (a Set of codes), the mouse position in
// canvas pixels and its buttons; edge-triggered presses are queued in `pressed` and drained
// once a frame by whoever handles menus and one-shot actions.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      this.pressed.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });
    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
      this.mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.mouse.down = true;
        this.mouse.clicked = true;
      }
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  /** Is one of these keys held down right now? */
  down(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  /** Was one of these keys pressed this frame (edge trigger)? */
  hit(...codes) {
    return codes.some((code) => this.pressed.has(code));
  }

  /** End-of-frame bookkeeping: clears edge triggers and the click flag. */
  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
  }
}
