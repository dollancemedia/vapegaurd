export const getPathLength = (pathElement: SVGPathElement): number => {
  return pathElement.getTotalLength();
};

export const animatePathDraw = (
  pathElement: SVGPathElement,
  duration: number = 2,
  delay: number = 0
): void => {
  const length = getPathLength(pathElement);
  
  pathElement.style.strokeDasharray = length.toString();
  pathElement.style.strokeDashoffset = length.toString();
  
  setTimeout(() => {
    pathElement.style.transition = `stroke-dashoffset ${duration}s ease-in-out`;
    pathElement.style.strokeDashoffset = '0';
  }, delay * 1000);
};

export const createParticle = (
  x: number,
  y: number,
  config: { size: number; color: string; speed: number; lifespan: number }
): SVGElement => {
  const particle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  particle.setAttribute('cx', x.toString());
  particle.setAttribute('cy', y.toString());
  particle.setAttribute('r', config.size.toString());
  particle.setAttribute('fill', config.color);
  particle.setAttribute('opacity', '0.8');
  
  return particle;
};

export const animateParticleSystem = (
  container: SVGElement,
  particleCount: number,
  config: { size: number; color: string; speed: number; lifespan: number }
): void => {
  const particles: SVGElement[] = [];
  const containerRect = container.getBoundingClientRect();
  
  for (let i = 0; i < particleCount; i++) {
    const x = Math.random() * containerRect.width;
    const y = Math.random() * containerRect.height;
    const particle = createParticle(x, y, config);
    
    container.appendChild(particle);
    particles.push(particle);
    
    // Animate particle
    const animateTransform = document.createElementNS('http://www.w3.org/2000/svg', 'animateTransform');
    animateTransform.setAttribute('attributeName', 'transform');
    animateTransform.setAttribute('type', 'translate');
    animateTransform.setAttribute('values', `0,0; ${Math.random() * 100 - 50},${Math.random() * 100 - 50}`);
    animateTransform.setAttribute('dur', `${config.lifespan}s`);
    animateTransform.setAttribute('repeatCount', 'indefinite');
    
    particle.appendChild(animateTransform);
    
    // Fade animation
    const animateOpacity = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
    animateOpacity.setAttribute('attributeName', 'opacity');
    animateOpacity.setAttribute('values', '0.8;0;0.8');
    animateOpacity.setAttribute('dur', `${config.lifespan}s`);
    animateOpacity.setAttribute('repeatCount', 'indefinite');
    
    particle.appendChild(animateOpacity);
  }
};

export const createWaveAnimation = (
  pathElement: SVGPathElement,
  amplitude: number = 20,
  frequency: number = 0.02,
  speed: number = 0.05
): void => {
  const originalPath = pathElement.getAttribute('d') || '';
  let time = 0;
  
  const animate = () => {
    time += speed;
    
    // Create wave effect by modifying path data
    const pathData = originalPath.replace(/(\d+)(\.*\d*)/g, (match, x, y) => {
      const xNum = parseFloat(x);
      const yNum = parseFloat(y) || 0;
      const waveOffset = Math.sin(xNum * frequency + time) * amplitude;
      return `${xNum},${yNum + waveOffset}`;
    });
    
    pathElement.setAttribute('d', pathData);
    requestAnimationFrame(animate);
  };
  
  animate();
};

export const animateCounter = (
  element: HTMLElement,
  start: number,
  end: number,
  duration: number,
  suffix: string = ''
): void => {
  let startTime: number | null = null;
  const step = (timestamp: number) => {
    if (!startTime) startTime = timestamp;
    const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
    
    // Easing function (easeOutQuad)
    const easedProgress = 1 - (1 - progress) * (1 - progress);
    
    const currentValue = start + (end - start) * easedProgress;
    
    // Format logic based on whether it's an integer or float
    if (end % 1 !== 0) {
      element.textContent = currentValue.toFixed(1) + suffix;
    } else {
      element.textContent = Math.floor(currentValue) + suffix;
    }
    
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  
  window.requestAnimationFrame(step);
};
