import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface BrandValue {
  companyName: string;
  systemName: string;
}

const BrandContext = createContext<BrandValue>({
  companyName: "Dashen Bank",
  systemName: "VTIRS",
});

export function BrandProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<BrandValue>({
    companyName: "Dashen Bank",
    systemName: "VTIRS",
  });

  useEffect(() => {
    fetch("/api/settings/public")
      .then((r) => r.json())
      .then((d) => {
        if (d.companyName && d.systemName) {
          setValue({ companyName: d.companyName, systemName: d.systemName });
          document.title = `${d.companyName} | ${d.systemName}`;
        }
      })
      .catch(() => {});
  }, []);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  return useContext(BrandContext);
}
