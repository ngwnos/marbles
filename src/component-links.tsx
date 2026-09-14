import './component-links.css';

export const components = [
  { href: '/part.html?piece=coil', name: 'Coil ramp', detail: 'Continuous descending helix with support bars' },
  { href: '/part.html?piece=starter-funnel', name: 'Starter funnel', detail: 'Standalone vortex bowl and socket' },
  { href: '/part.html?piece=coupler', name: 'Double-ended connector', detail: 'Slotted male ends for the extension tube' },
  { href: '/part.html?piece=extension', name: 'Extension tube', detail: 'Six-unit tube with two female ends' },
  { href: '/part.html?piece=start', name: 'Starting gate', detail: 'Six lanes with a pivoting release' },
  { href: '/part.html?piece=hairpin', name: 'Banked U-turn', detail: 'Long rising return bend and divided track' },
  { href: '/part.html?piece=passing', name: 'Passing lane', detail: 'Alternating bypasses and three rounded islands' },
  { href: '/part.html?piece=finish', name: 'Finish lane', detail: 'Closed-end lane and broad supporting base' },
  { href: '/part.html?piece=split', name: 'Split track', detail: 'One inlet and two end drops' },
  { href: '/part.html?piece=jump', name: 'Jump chute', detail: 'Raised inlet and upturned launch tip' },
  { href: '/part.html?piece=landing', name: 'Landing ramp', detail: 'Semicircular catch tray and terminal drop' },
  { href: '/base.html', name: 'Support base', detail: 'No. 143 · catch tray and C-shaped support post' },
  { href: '/bumper.html', name: 'Zigzag bumper ramp', detail: 'No. 149 · eight alternating bends' },
  { href: '/maze.html', name: 'Maze ramp', detail: 'No. 146 · scalloped tray and eight pins' },
  { href: '/paddle.html', name: 'Paddle-wheel ramp', detail: 'No. 147 · raised chute and twelve-pocket wheel' },
  { href: '/intersection.html', name: 'Intersection', detail: 'No. 204 · two inlets and one end drop' },
  { href: '/ramp.html', name: 'Standard ramp', detail: 'Sloped track with a coiled outlet' },
  { href: '/funnel.html', name: 'Funnel ramp', detail: 'No. 141 · funnel and connecting track' },
  { href: '/spacer.html', name: 'Straight spacer', detail: 'Stackable vertical connector' },
  { href: '/snake.html', name: 'Snake ramp', detail: 'No. 145 · four alternating curls' },
];

export function ComponentLinks() {
  return <nav className="component-links" aria-label="Component previews">
    <a href="/components.html">← All components</a>
    {components.map(part => <a key={part.href} href={part.href}
      aria-current={location.pathname + location.search === part.href ? 'page' : undefined}>{part.name}</a>)}
  </nav>;
}
