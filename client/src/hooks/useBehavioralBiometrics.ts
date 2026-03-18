import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';

export interface TypingData {
  key: string;
  dwellTime: number;
  flightTime: number;
  timestamp: number;
}

export interface ScrollData {
  deltaY: number;
  speed: number;
  timestamp: number;
}

export interface OrientationData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  timestamp: number;
}

export const useBehavioralBiometrics = () => {
  const typingBuffer = useRef<TypingData[]>([]);
  const scrollBuffer = useRef<ScrollData[]>([]);
  const orientationBuffer = useRef<OrientationData[]>([]);
  
  const lastKeyUpTime = useRef<number>(0);
  const lastKeyDownTime = useRef<Record<string, number>>({});
  const lastScrollTime = useRef<number>(0);
  const lastScrollY = useRef<number>(0);

  const submitMutation = trpc.behavioral.submitSession.useMutation();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      lastKeyDownTime.current[e.key] = Date.now();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const now = Date.now();
      const keyDownTime = lastKeyDownTime.current[e.key];
      
      if (keyDownTime) {
        const dwellTime = now - keyDownTime;
        const flightTime = lastKeyUpTime.current ? now - lastKeyUpTime.current : 0;
        
        typingBuffer.current.push({
          key: e.key,
          dwellTime,
          flightTime,
          timestamp: now
        });
        
        lastKeyUpTime.current = now;
        delete lastKeyDownTime.current[e.key];
      }
    };

    const handleScroll = () => {
      const now = Date.now();
      const currentY = window.scrollY;
      const deltaY = currentY - lastScrollY.current;
      const deltaTime = now - lastScrollTime.current;
      
      if (deltaTime > 0) {
        const speed = Math.abs(deltaY / deltaTime);
        scrollBuffer.current.push({
          deltaY,
          speed,
          timestamp: now
        });
      }
      
      lastScrollY.current = currentY;
      lastScrollTime.current = now;
    };

    const handleOrientation = (e: DeviceOrientationEvent) => {
      orientationBuffer.current.push({
        alpha: e.alpha,
        beta: e.beta,
        gamma: e.gamma,
        timestamp: Date.now()
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('scroll', handleScroll);
    window.addEventListener('deviceorientation', handleOrientation);

    // Periodically send data (every 30 seconds or when buffer is large)
    const interval = setInterval(() => {
      if (
        typingBuffer.current.length > 0 || 
        scrollBuffer.current.length > 0 || 
        orientationBuffer.current.length > 0
      ) {
        const data = {
          typing: [...typingBuffer.current],
          scroll: [...scrollBuffer.current],
          orientation: [...orientationBuffer.current],
          deviceInfo: {
            userAgent: navigator.userAgent,
            screenSize: `${window.innerWidth}x${window.innerHeight}`,
            platform: navigator.platform
          }
        };

        submitMutation.mutate(data);

        // Clear buffers
        typingBuffer.current = [];
        scrollBuffer.current = [];
        orientationBuffer.current = [];
      }
    }, 30000);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('deviceorientation', handleOrientation);
      clearInterval(interval);
    };
  }, [submitMutation]);

  return null;
};
