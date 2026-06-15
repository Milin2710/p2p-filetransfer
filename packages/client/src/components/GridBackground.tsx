import { useEffect, useRef } from 'react';
import './GridBackground.css';

interface Cell {
  x: number;
  y: number;
  alpha: number;
  fading: boolean;
  lastTouched: number;
}

export default function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const squareSize = 80;
    const grid: Cell[] = [];

    const initGrid = () => {
      grid.length = 0;

      for (let x = 0; x < width; x += squareSize) {
        for (let y = 0; y < height; y += squareSize) {
          grid.push({
            x,
            y,
            alpha: 0,
            fading: false,
            lastTouched: 0,
          });
        }
      }
    };

    const getCellAt = (x: number, y: number) => {
      return grid.find(
        (cell) => x >= cell.x && x < cell.x + squareSize && y >= cell.y && y < cell.y + squareSize,
      );
    };

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initGrid();
    };

    const handleMouseMove = (e: MouseEvent) => {
      const cell = getCellAt(e.clientX, e.clientY);

      if (cell && cell.alpha === 0) {
        cell.alpha = 1;
        cell.lastTouched = Date.now();
        cell.fading = false;
      }
    };

    let animationId: number;

    const drawGrid = () => {
      ctx.clearRect(0, 0, width, height);

      const now = Date.now();

      for (const cell of grid) {
        if (cell.alpha > 0 && !cell.fading && now - cell.lastTouched > 500) {
          cell.fading = true;
        }

        if (cell.fading) {
          cell.alpha -= 0.02;

          if (cell.alpha <= 0) {
            cell.alpha = 0;
            cell.fading = false;
          }
        }

        if (cell.alpha > 0) {
          const centerX = cell.x + squareSize / 2;
          const centerY = cell.y + squareSize / 2;

          const gradient = ctx.createRadialGradient(
            centerX,
            centerY,
            5,
            centerX,
            centerY,
            squareSize,
          );

          gradient.addColorStop(0, `rgba(31, 237, 51, ${cell.alpha})`);
          gradient.addColorStop(1, `rgba(31, 237, 51, 0)`);

          ctx.strokeStyle = gradient;
          ctx.lineWidth = 1.3;

          ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, squareSize - 1, squareSize - 1);
        }
      }

      animationId = requestAnimationFrame(drawGrid);
    };

    initGrid();
    drawGrid();

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="grid-canvas" />;
}
