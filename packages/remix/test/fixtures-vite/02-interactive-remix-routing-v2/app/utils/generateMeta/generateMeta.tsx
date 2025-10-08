import type { MetaFunction } from "@remix-run/node";

const generateMeta = (title: string): MetaFunction => {
  return () => {
    return [
      { title: `${title} | Remix Routing V2` },
      {
        property: "og:title",
        content: `${title} | Remix Routing V2`,
      },

      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:description",
        content: "App to visualize remix routing version 2",
      },
      {
        property: "og:image",
        content: "/og.png",
      },
      {
        property: "twitter:domain",
        content: "interactive-remix-routing-v2.netlify.app",
      },
      {
        name: "description",
        content: "App to visualize remix routing version 2",
      },
      {
        name: "twitter:image",
        content: "/og.png",
      },
      {
        name: "twitter:title",
        content: `${title} | Remix Routing V2`,
      },
      {
        name: "twitter:description",
        content: "App to visualize remix routing version 2",
      },
    ];
  };
};
export default generateMeta;
