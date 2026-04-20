import { useEffect, useRef, useState } from "react";
import { Box } from "@chakra-ui/react";

interface ScrollRevealProps {
  children: React.ReactNode;
  direction?: "up" | "left" | "right";
  delay?: number;
  distance?: number;
  duration?: number;
}

export function ScrollReveal({
  children,
  direction = "up",
  delay = 0,
  distance = 24,
  duration = 0.5,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const transforms: Record<string, string> = {
    up: `translateY(${distance}px)`,
    left: `translateX(-${distance}px)`,
    right: `translateX(${distance}px)`,
  };

  return (
    <Box
      ref={ref}
      css={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translate(0)" : transforms[direction],
        transition: `opacity ${duration}s cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms, transform ${duration}s cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms`,
        "@media (prefers-reduced-motion: reduce)": {
          transition: "none",
          transform: "none",
          opacity: 1,
        },
      }}
    >
      {children}
    </Box>
  );
}
