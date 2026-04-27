export type DetectionConfig =
  | { kind: "url_path"; fragments: string[] }
  | { kind: "url_suffix"; suffix: string }
  | { kind: "news_keywords"; fragments: string[] }
  | {
      kind: "html_badge";
      /** ej. a.badge-categoria con href que contenga este fragmento */
      hrefContains: string;
    }
  | {
      kind: "json_ld_article_section";
      /** coincidencia por inclusión (minúsculas) */
      sections: string[];
    };

export type NewsSource = {
  id: string;
  name: string;
  baseUrl: string;
  sitemapUrl: string;
  detection: DetectionConfig;
};

export type ArticleCandidate = {
  url: string;
  title: string;
  /** ISO o texto del sitemap */
  publishedAt: string;
  /** Texto de news:keywords si existe */
  newsKeywords?: string;
};

export type MatchedArticle = ArticleCandidate & {
  sourceId: string;
  sourceName: string;
};
