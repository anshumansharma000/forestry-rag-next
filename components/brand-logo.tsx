import Image from "next/image";
import React from "react";

/** Transparent brand emblem without the embedded wordmark. */
export function BrandLogo({
  className = "",
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <Image
      alt={decorative ? "" : "Aranyabodh AI"}
      className={`object-contain ${className}`}
      height={755}
      src="/brand/aranyabodh-ai-mark.png"
      unoptimized
      width={896}
    />
  );
}
