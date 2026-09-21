import { useEffect, useState } from "react";

// Debounce a fast-changing value (e.g. search input) so API queries fire only
// after the user pauses. Without this, every keystroke in the registry/search
// inputs triggered a full request + full-page loader — the main cause of the
// "every page feels slow" reports.
export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
