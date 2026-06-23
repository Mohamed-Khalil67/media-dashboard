import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";

@Component({
  selector: "app-guide",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="guide-wrap">
      <header class="guide-header">
        <div class="brand">
          <span class="signal-dot" aria-hidden="true"></span>
          <span>Media Dashboard</span>
        </div>
        <h1>Platform Setup Guide</h1>
        <p class="subtitle">Follow these steps to create your Facebook or Shopify developer app before connecting.</p>
      </header>

      <nav class="toc">
        <a href="#facebook">📘 Facebook Ads</a>
        <a href="#shopify">🛒 Shopify</a>
      </nav>

      <!-- ───────────── FACEBOOK ───────────── -->
      <section class="platform-section" id="facebook">
        <h2><span class="badge badge--fb">📘</span> Facebook Ads Setup</h2>

        <div class="step">
          <div class="step-num">1</div>
          <div class="step-body">
            <h3>Create the app</h3>
            <ol>
              <li>Go to <a href="https://developers.facebook.com" target="_blank" rel="noopener">developers.facebook.com</a> → <strong>My Apps</strong> → <strong>Create App</strong></li>
              <li>Select app type: <strong class="highlight">Business</strong> — this is the only type with Marketing API access. Cannot be changed later.</li>
              <li>Enter an app name (e.g. <em>My Media Dashboard</em>) and your contact email</li>
              <li>Click <strong>Create App</strong></li>
            </ol>
          </div>
        </div>

        <div class="step">
          <div class="step-num">2</div>
          <div class="step-body">
            <h3>Add Facebook Login product</h3>
            <ol>
              <li>On the app dashboard → <strong>Add Product</strong> → find <strong>Facebook Login</strong> → click <strong>Set Up</strong></li>
              <li>Choose <strong>Web</strong> as the platform</li>
              <li>Enter your site URL and click <strong>Save</strong></li>
              <li>Go to <strong>Facebook Login → Settings</strong></li>
              <li>Under <strong>Valid OAuth Redirect URIs</strong> add your callback URL exactly as shown in the connect modal</li>
              <li>Enable <strong>Enforce HTTPS</strong></li>
              <li>Click <strong>Save Changes</strong></li>
            </ol>
          </div>
        </div>

        <div class="step">
          <div class="step-num">3</div>
          <div class="step-body">
            <h3>Add Marketing API product</h3>
            <ol>
              <li>Dashboard → <strong>Add Product</strong> → find <strong>Marketing API</strong> → click <strong>Set Up</strong></li>
              <li>This unlocks <code>ads_read</code> and <code>ads_management</code> permissions needed to pull campaign data</li>
            </ol>
          </div>
        </div>

        <div class="step">
          <div class="step-num">4</div>
          <div class="step-body">
            <h3>Configure Basic Settings</h3>
            <ol>
              <li><strong>App Settings → Basic</strong></li>
              <li><strong>App Domains</strong>: enter your domain (no <code>https://</code>, just the hostname)</li>
              <li>Add a <strong>Privacy Policy URL</strong> — required to go Live</li>
              <li>Click <strong>Save Changes</strong></li>
              <li>Copy your <strong>App ID</strong> and <strong>App Secret</strong> (click Show next to the secret)</li>
            </ol>
          </div>
        </div>

        <div class="step">
          <div class="step-num">5</div>
          <div class="step-body">
            <h3>Switch app to Live</h3>
            <ol>
              <li>Top of the dashboard → toggle from <strong>In development</strong> to <strong>Live</strong></li>
              <li>Confirm the switch</li>
            </ol>
            <div class="callout callout--warn">
              If you skip this step, only your own Facebook account can connect. All other users will be blocked.
            </div>
          </div>
        </div>

        <div class="credentials-box">
          <h3>What to paste in the connect modal</h3>
          <table>
            <tr><th>Field</th><th>Where to find it</th></tr>
            <tr><td><strong>App ID</strong></td><td>App Settings → Basic</td></tr>
            <tr><td><strong>App Secret</strong></td><td>App Settings → Basic → click Show</td></tr>
            <tr><td><strong>Redirect URL</strong></td><td>Pre-filled automatically — <em>do not change it</em></td></tr>
            <tr><td><strong>Sync from / to</strong></td><td>Your desired historical date range</td></tr>
          </table>
        </div>
      </section>

      <!-- ───────────── SHOPIFY ───────────── -->
      <section class="platform-section" id="shopify">
        <h2><span class="badge badge--shopify">🛒</span> Shopify Setup</h2>

        <div class="step">
          <div class="step-num">1</div>
          <div class="step-body">
            <h3>Create the app</h3>
            <ol>
              <li>Go to <a href="https://dev.shopify.com/dashboard" target="_blank" rel="noopener">dev.shopify.com/dashboard</a> → <strong>Apps</strong> section</li>
              <li>Click <strong>Create app</strong> → select <strong>Start from Dev Dashboard</strong></li>
              <li>Enter your app name → confirm</li>
            </ol>
          </div>
        </div>

        <div class="step">
          <div class="step-num">2</div>
          <div class="step-body">
            <h3>Configure app version</h3>
            <ol>
              <li>Go to the <strong>Versions</strong> tab</li>
              <li>Fill in:
                <ul>
                  <li><strong>App URL</strong>: your dashboard URL</li>
                  <li><strong>Allowed redirect URLs</strong>: your callback URL exactly as shown in the connect modal</li>
                  <li><strong>Scopes</strong>: <code>read_orders,read_analytics,read_products</code></li>
                  <li><strong>Webhooks API version</strong>: select the latest available</li>
                </ul>
              </li>
              <li>Click <strong>Release</strong></li>
            </ol>
          </div>
        </div>

        <div class="step">
          <div class="step-num">3</div>
          <div class="step-body">
            <h3>Install on your store</h3>
            <ol>
              <li>App <strong>Home</strong> section → <strong>Install app</strong></li>
              <li>Choose your Shopify store → confirm installation</li>
            </ol>
            <div class="callout callout--warn">
              The store must have your app installed before OAuth will work. Shopify will reject the connection otherwise.
            </div>
          </div>
        </div>

        <div class="step">
          <div class="step-num">4</div>
          <div class="step-body">
            <h3>Get credentials</h3>
            <ol>
              <li>App → <strong>Settings</strong> tab</li>
              <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong></li>
            </ol>
          </div>
        </div>

        <div class="credentials-box">
          <h3>What to paste in the connect modal</h3>
          <table>
            <tr><th>Field</th><th>Where to find it</th></tr>
            <tr><td><strong>Shop domain</strong></td><td>Your store URL e.g. <code>my-store.myshopify.com</code> — no https://</td></tr>
            <tr><td><strong>App ID</strong></td><td>Client ID from Settings</td></tr>
            <tr><td><strong>App Secret</strong></td><td>Client Secret from Settings</td></tr>
            <tr><td><strong>Redirect URL</strong></td><td>Pre-filled automatically — <em>do not change it</em></td></tr>
            <tr><td><strong>Sync from / to</strong></td><td>Your desired historical date range</td></tr>
          </table>
        </div>
      </section>

      <footer class="guide-footer">
        <p>Once you have your credentials, close this tab and paste them into the connect modal.</p>
        <button class="close-btn" (click)="close()">Close this tab</button>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; font-family: "Space Grotesk", system-ui, sans-serif; }

    .guide-wrap {
      max-width: 780px; margin: 0 auto; padding: 2rem 1.5rem 4rem;
      color: #1a1a1a;
    }

    .guide-header {
      text-align: center; margin-bottom: 2.5rem; padding-bottom: 2rem;
      border-bottom: 1px solid #e5e7eb;
    }
    .brand {
      display: inline-flex; align-items: center; gap: .5rem;
      font-size: .85rem; font-weight: 600; color: #009e6d; margin-bottom: 1rem;
    }
    .signal-dot {
      width: 10px; height: 10px; border-radius: 50%; background: #009e6d;
      box-shadow: 0 0 0 3px rgba(0,158,109,.2);
    }
    h1 { font-size: 2rem; font-weight: 700; margin: 0 0 .5rem; color: #111; }
    .subtitle { color: #6b7280; margin: 0; }

    .toc {
      display: flex; gap: 1rem; margin-bottom: 3rem;
      background: #f9fafb; border-radius: 10px; padding: .75rem 1rem;
    }
    .toc a {
      color: #009e6d; font-weight: 500; text-decoration: none; font-size: .9rem;
      padding: .3rem .7rem; border-radius: 6px; transition: background .15s;
    }
    .toc a:hover { background: rgba(0,158,109,.1); }

    .platform-section {
      margin-bottom: 3.5rem; padding-top: 1rem;
    }
    .platform-section h2 {
      font-size: 1.4rem; font-weight: 700; margin: 0 0 1.5rem;
      display: flex; align-items: center; gap: .6rem;
    }
    .badge { font-size: 1.2rem; }

    .step {
      display: flex; gap: 1.25rem; margin-bottom: 1.75rem;
    }
    .step-num {
      flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%;
      background: #009e6d; color: white; font-weight: 700; font-size: .85rem;
      display: flex; align-items: center; justify-content: center;
      margin-top: 2px;
    }
    .step-body { flex: 1; }
    .step-body h3 { margin: 0 0 .6rem; font-size: 1rem; font-weight: 600; }
    .step-body ol { margin: 0; padding-left: 1.25rem; }
    .step-body ol li { margin-bottom: .4rem; line-height: 1.6; color: #374151; }
    .step-body ul { margin: .4rem 0 0 .5rem; padding-left: 1rem; }
    .step-body ul li { margin-bottom: .3rem; color: #374151; }

    a { color: #009e6d; }
    code {
      background: #f3f4f6; padding: .15rem .4rem; border-radius: 4px;
      font-family: "JetBrains Mono", monospace; font-size: .82rem;
    }
    .highlight { color: #009e6d; }

    .callout {
      margin-top: .75rem; padding: .65rem 1rem; border-radius: 8px;
      font-size: .875rem; line-height: 1.5;
    }
    .callout--warn { background: #fef3c7; color: #92400e; border-left: 3px solid #f59e0b; }

    .credentials-box {
      background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px;
      padding: 1.25rem 1.5rem; margin-top: 1rem;
    }
    .credentials-box h3 { margin: 0 0 .75rem; font-size: .95rem; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: .875rem; }
    th { text-align: left; color: #6b7280; font-weight: 500; padding: .4rem .5rem; border-bottom: 1px solid #e5e7eb; }
    td { padding: .5rem .5rem; border-bottom: 1px solid #f3f4f6; color: #374151; vertical-align: top; }
    td:first-child { white-space: nowrap; }

    .guide-footer {
      text-align: center; padding-top: 2rem; border-top: 1px solid #e5e7eb;
      color: #6b7280;
    }
    .close-btn {
      margin-top: .75rem; padding: .6rem 1.5rem; border-radius: 8px;
      background: #009e6d; color: white; border: none; cursor: pointer;
      font-size: .9rem; font-weight: 600;
    }
    .close-btn:hover { background: #007a56; }

    @media (max-width: 600px) {
      .step { flex-direction: column; gap: .75rem; }
      .step-num { width: 26px; height: 26px; font-size: .75rem; }
    }
  `],
})
export class GuideComponent {
  close(): void {
    window.close();
  }
}
