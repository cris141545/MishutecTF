"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { flushSync } from "react-dom";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: (buttonElement?: HTMLElement | null) => Promise<void>;
  setTheme: (theme: Theme) => void;
  isTransitioning: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "mishutec-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const isTransitioningRef = useRef(false);

  // Sincronizar estado inicial con el DOM en el cliente
  useEffect(() => {
    try {
      const isDark = document.documentElement.classList.contains("dark");
      setThemeState(isDark ? "dark" : "light");
    } catch {
      // noop
    }
  }, []);

  const applyThemeToDOM = (newTheme: Theme) => {
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    }
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // noop
    }
  };

  const toggleTheme = useCallback(
    async (buttonElement?: HTMLElement | null) => {
      // Evitar clics repetidos mientras ocurre la transición
      if (isTransitioningRef.current) return;

      const nextTheme: Theme = theme === "dark" ? "light" : "dark";

      // Respetar prefers-reduced-motion
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // Si el navegador no soporta startViewTransition o hay reducción de movimiento
      if (
        typeof document === "undefined" ||
        !("startViewTransition" in document) ||
        typeof (document as any).startViewTransition !== "function" ||
        prefersReducedMotion
      ) {
        applyThemeToDOM(nextTheme);
        setThemeState(nextTheme);
        return;
      }

      // Calcular el origen exacto centrado en el botón / icono
      let x = window.innerWidth / 2;
      let y = 0;

      if (buttonElement) {
        const rect = buttonElement.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      }

      // Calcular radio final hasta la esquina más alejada de la ventana
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );

      isTransitioningRef.current = true;
      setIsTransitioning(true);

      try {
        const transition = (document as any).startViewTransition(() => {
          flushSync(() => {
            applyThemeToDOM(nextTheme);
            setThemeState(nextTheme);
          });
        });

        await transition.ready;

        // Animar máscara circular de reveal en el nuevo tema
        const animation = document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 400, // Duración objetivo 350 - 450 ms
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            pseudoElement: "::view-transition-new(root)",
          } as KeyframeAnimationOptions
        );

        await Promise.allSettled([animation.finished, transition.finished]);
      } catch {
        // En caso de cualquier error de la API, asegurar consistencia de estado
        applyThemeToDOM(nextTheme);
        setThemeState(nextTheme);
      } finally {
        isTransitioningRef.current = false;
        setIsTransitioning(false);
      }
    },
    [theme]
  );

  const setTheme = useCallback((newTheme: Theme) => {
    applyThemeToDOM(newTheme);
    setThemeState(newTheme);
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, toggleTheme, setTheme, isTransitioning }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme debe utilizarse dentro de un ThemeProvider");
  }
  return context;
}
