import logos from "../../data/logos.json";

const RESULT = { data: logos as Record<string, string> };

export function useLogos() {
  return RESULT;
}
