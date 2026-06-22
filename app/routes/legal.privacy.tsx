import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — Geopages" },
  { name: "robots", content: "index, follow" },
];

const LAST_UPDATED = "June 22, 2026";

export default function Privacy() {
  return (
    <main style={styles.page}>
      <article style={styles.article}>
        <header style={styles.header}>
          <h1 style={styles.h1}>Privacy Policy</h1>
          <p style={styles.lastUpdated}>Last updated: {LAST_UPDATED}</p>
        </header>

        <section>
          <h2 style={styles.h2}>Overview</h2>
          <p>
            Geopages (&quot;we&quot;, &quot;us&quot;, &quot;the app&quot;) is a Shopify app that
            generates SEO landing pages for service businesses. This policy explains what
            information we collect from merchants who install the app, how we use it, and
            how it is protected.
          </p>
        </section>

        <section>
          <h2 style={styles.h2}>Information we collect</h2>
          <h3 style={styles.h3}>From the merchant&apos;s Shopify store</h3>
          <ul>
            <li>Shop domain (e.g. <code>example.myshopify.com</code>) and OAuth access token, used to authenticate API calls</li>
            <li>Business information the merchant enters in the app: name, phone, address, website</li>
            <li>Services and locations the merchant configures</li>
            <li>API keys the merchant enters for third-party services (OpenAI, Google Gemini, Google Maps, Unsplash) — used only to call those services on the merchant&apos;s behalf</li>
            <li>Subscription billing state from Shopify (active, trial, cancelled)</li>
          </ul>
          <h3 style={styles.h3}>Generated content</h3>
          <ul>
            <li>AI-generated page content (HTML, SEO meta fields, FAQs) stored in our database and served to the merchant&apos;s storefront via Shopify App Proxy</li>
          </ul>
          <h3 style={styles.h3}>What we do NOT collect</h3>
          <ul>
            <li>We do not collect, store, or process any personally-identifiable information (PII) about the merchant&apos;s customers</li>
            <li>We do not track storefront visitor activity</li>
            <li>We do not access order data, customer data, or payment information</li>
          </ul>
        </section>

        <section>
          <h2 style={styles.h2}>How we use the information</h2>
          <ul>
            <li>To provide the core functionality of the app: generating, storing, and serving SEO landing pages</li>
            <li>To authenticate API calls to Shopify and to third-party services configured by the merchant</li>
            <li>To process billing through Shopify&apos;s Billing API</li>
            <li>To respond to support requests</li>
          </ul>
          <p>
            We do not sell, rent, or share merchant data with third parties for marketing
            purposes.
          </p>
        </section>

        <section>
          <h2 style={styles.h2}>Third-party services</h2>
          <p>
            When the merchant enables corresponding features, the app sends data to these
            third parties using API keys the merchant provides:
          </p>
          <ul>
            <li><strong>OpenAI</strong> — receives prompts (service name, location, business name) to generate page content. <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer">OpenAI privacy policy</a></li>
            <li><strong>Google Gemini</strong> — alternative AI provider, same data as above. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google privacy policy</a></li>
            <li><strong>Google Geocoding + Places</strong> — receives city/state to fetch neighborhood, landmark, and ZIP code data</li>
            <li><strong>Unsplash</strong> — receives service-name search query to fetch a stock photo</li>
            <li><strong>Shopify</strong> — receives GraphQL Admin API calls to manage app proxy, menus, and billing</li>
          </ul>
        </section>

        <section>
          <h2 style={styles.h2}>Data storage and security</h2>
          <ul>
            <li>All data is stored in a PostgreSQL database hosted on Fly.io in US East</li>
            <li>Database connections use Fly&apos;s private network (not exposed to the public internet)</li>
            <li>All HTTP traffic is encrypted with TLS</li>
            <li>Shopify OAuth tokens are stored in the database; we do not log or transmit them elsewhere</li>
          </ul>
        </section>

        <section>
          <h2 style={styles.h2}>Data retention</h2>
          <ul>
            <li>Merchant configuration and generated pages are retained while the app is installed</li>
            <li>When a merchant uninstalls the app, we receive an <code>app/uninstalled</code> webhook and clear the OAuth session</li>
            <li>Approximately 48 hours after uninstall, Shopify sends a <code>shop/redact</code> webhook. We then permanently delete all data associated with that shop</li>
          </ul>
        </section>

        <section>
          <h2 style={styles.h2}>GDPR and CCPA</h2>
          <p>
            Geopages does not collect data about the merchant&apos;s end customers, so we have
            no customer data subject to GDPR or CCPA deletion or access requests. For
            completeness, the app responds to the mandatory Shopify GDPR webhooks
            (<code>customers/data_request</code>, <code>customers/redact</code>,{" "}
            <code>shop/redact</code>).
          </p>
        </section>

        <section>
          <h2 style={styles.h2}>Cookies</h2>
          <p>
            The app uses session cookies set by Shopify to maintain the embedded admin
            session. We do not set our own tracking or analytics cookies.
          </p>
        </section>

        <section>
          <h2 style={styles.h2}>Changes to this policy</h2>
          <p>
            We may update this policy as the app evolves. Updates are reflected in the
            &quot;Last updated&quot; date above. Material changes will be communicated to
            installed merchants via email or in-app notice.
          </p>
        </section>

        <section>
          <h2 style={styles.h2}>Contact</h2>
          <p>
            Questions about this policy or data handling? Reach the support address listed
            in the app&apos;s Shopify App Store listing.
          </p>
        </section>

        <footer style={styles.footer}>
          <p>
            <a href="/legal/terms" style={styles.link}>Terms of Service</a>
          </p>
        </footer>
      </article>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#fafafa",
    padding: "40px 16px 80px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: "#1a1a1a",
    lineHeight: 1.7,
  },
  article: {
    maxWidth: 760,
    margin: "0 auto",
    background: "white",
    padding: "48px 40px",
    borderRadius: 12,
    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  },
  header: {
    marginBottom: 32,
    paddingBottom: 16,
    borderBottom: "1px solid #e5e5e5",
  },
  h1: {
    fontSize: 36,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    margin: 0,
  },
  h2: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    margin: "32px 0 12px",
  },
  h3: {
    fontSize: 16,
    fontWeight: 600,
    margin: "20px 0 8px",
  },
  lastUpdated: {
    color: "#6d7175",
    fontSize: 14,
    marginTop: 8,
    marginBottom: 0,
  },
  footer: {
    marginTop: 48,
    paddingTop: 24,
    borderTop: "1px solid #e5e5e5",
    fontSize: 14,
    color: "#6d7175",
  },
  link: {
    color: "#006fbb",
    textDecoration: "underline",
  },
} as const;
