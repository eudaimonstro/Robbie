import { lazy, Suspense } from 'react';

// The Markdown renderer (about 35 KB compressed) loads the first time something shows Markdown,
// so a page that never does (a phone in a meeting) never downloads it
const ReactMarkdown = lazy(() => import('react-markdown'));

/** Markdown as text: its paragraphs as they are, until the renderer has loaded */
function PlainParagraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
    </>
  );
}

/** Markdown rendered by react-markdown, loaded when first needed */
export function LazyMarkdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<PlainParagraphs text={children} />}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </Suspense>
  );
}
