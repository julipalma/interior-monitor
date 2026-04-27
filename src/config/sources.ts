import type { NewsSource } from "../types.js";

/**
 * Configuración derivada del CSV de medios (sin archivo CSV en el repo).
 */
export const sources: NewsSource[] = [
  {
    id: "el-territorio",
    name: "El Territorio",
    baseUrl: "https://www.elterritorio.com.ar/",
    sitemapUrl: "https://www.elterritorio.com.ar/sitemap.xml",
    detection: { kind: "html_badge", hrefContains: "/policiales/" },
  },
  {
    id: "mdp-0223",
    name: "MDP 0223",
    baseUrl: "https://www.0223.com.ar/",
    sitemapUrl: "https://www.0223.com.ar/sitemaps_news.xml",
    detection: { kind: "news_keywords", fragments: ["seguridad"] },
  },
  {
    id: "la-nueva",
    name: "La Nueva",
    baseUrl: "https://www.lanueva.com/",
    sitemapUrl: "https://www.lanueva.com/sitemap_news.xml",
    detection: { kind: "news_keywords", fragments: ["seguridad"] },
  },
  {
    id: "nuevo-diario",
    name: "Nuevo Diario",
    baseUrl: "https://www.nuevodiarioweb.com.ar/",
    sitemapUrl: "https://www.nuevodiarioweb.com.ar/sitemap.xml",
    detection: { kind: "url_path", fragments: ["/policiales/"] },
  },
  {
    id: "todo-jujuy",
    name: "Todo Jujuy",
    baseUrl: "https://www.todojujuy.com/",
    sitemapUrl: "https://www.todojujuy.com/sitemap-news.xml",
    detection: { kind: "url_path", fragments: ["/policiales/"] },
  },
  {
    id: "lm-neuquen",
    name: "LM Neuquén",
    baseUrl: "https://www.lmneuquen.com/",
    sitemapUrl: "https://www.lmneuquen.com/sitemap.xml",
    detection: { kind: "url_path", fragments: ["/policiales/"] },
  },
  {
    id: "el-liberal",
    name: "El Liberal",
    baseUrl: "https://www.elliberal.com.ar/",
    sitemapUrl: "https://www.elliberal.com.ar/sitemap.xml",
    detection: {
      kind: "json_ld_article_section",
      sections: ["policiales", "policial"],
    },
  },
  {
    id: "misiones-online",
    name: "Misiones Online",
    baseUrl: "https://misionesonline.net/",
    sitemapUrl: "https://misionesonline.net/sitemap.xml",
    detection: {
      kind: "json_ld_article_section",
      sections: ["policiales", "policial"],
    },
  },
  {
    id: "adn-sur",
    name: "ADN Sur",
    baseUrl: "https://www.adnsur.com.ar/",
    sitemapUrl: "https://www.adnsur.com.ar/sitemap-news.xml",
    detection: {
      kind: "url_path",
      fragments: ["/policiales---judiciales/"],
    },
  },
  {
    id: "ahora",
    name: "Ahora",
    baseUrl: "https://ahora.com.ar/",
    sitemapUrl: "https://ahora.com.ar/sitemap_index.xml",
    detection: { kind: "url_path", fragments: ["/policiales/"] },
  },
  {
    id: "el-dia",
    name: "El Día",
    baseUrl: "https://www.eldia.com/",
    sitemapUrl: "https://www.eldia.com/news_1.xml",
    detection: { kind: "url_suffix", suffix: "-policiales" },
  },
  {
    id: "la-capital",
    name: "La Capital",
    baseUrl: "https://www.lacapital.com.ar/",
    sitemapUrl: "https://www.lacapital.com.ar/sitemap.xml",
    detection: { kind: "url_path", fragments: ["/policiales/"] },
  },
  {
    id: "la-voz",
    name: "La Voz",
    baseUrl: "https://www.lavoz.com.ar/",
    sitemapUrl:
      "https://www.lavoz.com.ar/arc/outboundfeeds/feeds/sitemap/?outputType=xml",
    detection: { kind: "url_path", fragments: ["/sucesos/"] },
  },
];
