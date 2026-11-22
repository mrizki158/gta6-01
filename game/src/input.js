// Keyboard and mouse state. Game code polls `keys` / `pressed` once per frame; `pressed`
// holds edge-triggered keys for exactly one step so menus and the enter-car key feel crisp.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this._downHandler = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    };
    this._upHandler = (e) => this.keys.delete(e.code);
    this._blurHandler = () => this.keys.clear();
    window.addEventListener('keydown', this._downHandler);
    window.addEventListener('keyup', this._upHandler);
    window.addEventListener('blur', this._blurHandler);
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * canvas.width;
      this.mouse.y = ((e.clientY - r.top) / r.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', () => {
      this.mouse.down = true;
      this.mouse.clicked = true;
    });
    window.addEventListener('mouseup', () => {
      this.mouse.down = false;
    });
  }

  /** Call at the end of each frame: edge triggers last exactly one step. */
  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
  }

  axis() {
    const x = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0)
      - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const y = (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0)
      - (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0);
    return { x, y };
  }
}
