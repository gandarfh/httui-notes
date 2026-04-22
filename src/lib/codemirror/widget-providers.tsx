/**
 * Widget Providers — wraps block widget React roots with necessary app contexts.
 *
 * Block widgets are rendered in isolated React roots (via createRoot) that
 * don't inherit the app's context tree. This module stores context values
 * from the app and provides them to widget React roots.
 */
import type { ReactNode } from "react";
import { Provider } from "@/components/ui/provider";
import { EnvironmentContext, type EnvironmentContextValue } from "@/contexts/EnvironmentContext";

// Module-level store for context values — set by the app, read by widgets
let environmentContextValue: EnvironmentContextValue | null = null;

/** Call this from the app to keep the environment context available for widgets */
export function setWidgetEnvironmentContext(value: EnvironmentContextValue) {
  environmentContextValue = value;
}

/** Wrapper component that provides all necessary contexts for block widgets */
export function WidgetProviders({ children }: { children: ReactNode }) {
  return (
    <Provider>
      {environmentContextValue ? (
        <EnvironmentContext.Provider value={environmentContextValue}>
          {children}
        </EnvironmentContext.Provider>
      ) : (
        children
      )}
    </Provider>
  );
}
