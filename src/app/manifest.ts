import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plan4JU",
    short_name: "Plan4JU",
    description: "Der Familienplaner",
    lang: "de",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#faf6f1",
    theme_color: "#c8553d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
