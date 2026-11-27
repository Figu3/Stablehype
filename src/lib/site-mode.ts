/**
 * One codebase, two sites: the investor page (stablehype.com) and the control center (Vercel).
 * The investor page is the default, so a build with no flag never shows control-center content.
 * The control center builds with NEXT_PUBLIC_SITE_MODE=control. Pages named `page.control.tsx`
 * exist only in that build (see `pageExtensions` in next.config.ts).
 */
export const IS_CONTROL_SITE = process.env.NEXT_PUBLIC_SITE_MODE === "control";
