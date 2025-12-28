export interface AnimationConfig {
  type: 'fade' | 'slide' | 'scale' | 'draw' | 'morph';
  duration: number;
  delay: number;
  easing: string;
  staggerChildren?: number;
}

export interface PathAnimation {
  path: string;
  length: number;
  drawSpeed: number;
  colorTransition: boolean;
}

export interface ParticleConfig {
  count: number;
  size: number;
  speed: number;
  color: string;
  lifespan: number;
}

export interface UseScrollTriggerOptions {
  threshold: number;
  rootMargin: string;
  triggerOnce: boolean;
  elementId?: string; // Optional ID for hash matching
}

export interface SectionProps {
  id?: string;
  children: React.ReactNode;
  animationConfig?: AnimationConfig;
}

export interface SVGAnimationProps {
  path: string;
  trigger: string;
  duration: number;
  easing: string;
}
