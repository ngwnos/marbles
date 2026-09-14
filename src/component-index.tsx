import { createRoot } from 'react-dom/client';
import { components } from './component-links';
import './component-index.css';

function ComponentIndex() {
  return <main className="catalog">
    <header><p>MARBLEWORKS</p><h1>Component previews</h1><span>Choose a piece to inspect its geometry.</span></header>
    <a className="build-link" href="/">Build a marble run <span>Drag, rotate, and connect your pieces ↗</span></a>
    <div className="component-grid">
      {components.map((part, index) => <a className="component-card" href={part.href} key={part.href}>
        <span className="piece-number">PIECE {String(index + 1).padStart(2, '0')}</span>
        <h2>{part.name}<span aria-hidden="true">↗</span></h2>
        <p>{part.detail}</p>
      </a>)}
    </div>
    <footer><a href="/game.html">Marble playground ↗</a><a href="/surfaces.html">Join inspection ↗</a></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<ComponentIndex />);
