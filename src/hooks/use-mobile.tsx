import * as React from "react";

// Mesmo breakpoint usado pelo AppShell (Tailwind `lg:` = 1024px) por padrão —
// aceita um breakpoint diferente pra telas que precisam de outro corte em JS
// (ex: chat.tsx usa 768/1280 pra decidir quando montar o layout de painéis
// redimensionáveis em vez do empilhado de celular).
export function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < breakpoint);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpoint]);

  return !!isMobile;
}
