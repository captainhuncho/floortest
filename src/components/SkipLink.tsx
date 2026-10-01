/** First thing a keyboard user reaches on every signed-in page: jump past the navigation. */
export function SkipLink() {
  return (
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded focus:bg-lime focus:px-3 focus:py-2 focus:text-ink">
      Skip to content
    </a>
  );
}
