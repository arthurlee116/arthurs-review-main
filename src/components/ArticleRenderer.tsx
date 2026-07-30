import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "video", "source"],
  attributes: {
    ...defaultSchema.attributes,
    video: [...(defaultSchema.attributes?.video ?? []), "controls", "poster", "src", "className"],
  },
};

export function ArticleRenderer({ markdown }: { markdown: string }) {
  return (
    <div className="prose min-w-0 max-w-full">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          h1: "h2",
          a: ({ node: _node, ...props }) => <a {...props} className="prose-link" />,
          table: ({ node: _node, ...props }) => (
            <div className="prose-table-scroll">
              <table {...props} />
            </div>
          ),
          img: ({ node: _node, src, alt, ...props }) => {
            if (typeof src === "string" && /\.mp4(\?|$)/i.test(src)) {
              const [videoSrc, query] = src.split("?", 2);
              const poster = query ? new URLSearchParams(query).get("poster") : null;
              return <video controls src={videoSrc} poster={poster ?? undefined} className="w-full" aria-label={alt} />;
            }
            return <img src={src} alt={alt} {...props} />;
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
