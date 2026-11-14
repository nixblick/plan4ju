import Image from "next/image";

/** App symbol "Wochenhaus". Below 64 px the week dots vanish, so small sizes use the variant without them. */
export function Logo({ size }: { size: number }) {
  return <Image src={size < 64 ? "/logo-klein.svg" : "/logo.svg"} alt="" width={size} height={size} unoptimized />;
}

/** Wordmark "plan4ju" (Outfit 700, outlined; the 4 in brand terracotta). */
export function Wortmarke({ height }: { height: number }) {
  return <Image src="/wortmarke.svg" alt="Plan4JU" width={Math.round((height * 330) / 99)} height={height} unoptimized />;
}
