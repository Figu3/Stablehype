import logos from "../../data/logos.json";

export function useLogos() {
  return { data: logos as Record<string, string> };
}
