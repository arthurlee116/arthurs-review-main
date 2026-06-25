import Image from "next/image";
import { uploadPublicPath } from "@/lib/media/paths";

export const coverImageSizes = {
  card: "(max-width: 767px) calc(100vw - 36px), 430px",
  largeCard: "(max-width: 767px) calc(100vw - 36px), 680px",
  article: "(max-width: 796px) calc(100vw - 36px), 760px",
} as const;

export function CoverImage({
  path,
  alt,
  sizes,
  className = "",
  eager = false,
}: {
  path: string;
  alt: string;
  sizes: string;
  className?: string;
  eager?: boolean;
}) {
  const src = uploadPublicPath(path);

  return (
    <div className={`${className} relative aspect-[5/3] w-full overflow-hidden`}>
      <Image
        className="object-cover"
        src={src}
        overrideSrc={src}
        alt={alt}
        fill
        sizes={sizes}
        quality={82}
        loading={eager ? "eager" : undefined}
        fetchPriority={eager ? "high" : undefined}
      />
    </div>
  );
}
