import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

export function ArticleRenderer({ markdown }: { markdown: string }) {
  return (
    <div className="prose min-w-0 max-w-full">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: "h2",
          a: ({ node: _node, ...props }) => <a {...props} className="prose-link" />,
          table: ({ node: _node, ...props }) => (
            <div className="prose-table-scroll">
              <table {...props} />
            </div>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
