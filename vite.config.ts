import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: {
        index: 'index.html',
        components: 'components.html',
        build: 'build.html',
        part: 'part.html',
        game: 'game.html',
        ramp: 'ramp.html',
        funnel: 'funnel.html',
        spacer: 'spacer.html',
        snake: 'snake.html',
        surfaces: 'surfaces.html',
        intersection: 'intersection.html',
        paddle: 'paddle.html',
        maze: 'maze.html',
        bumper: 'bumper.html',
        base: 'base.html',
      },
    },
  },
  server: { host: '127.0.0.1', port: 5215, strictPort: true },
});
