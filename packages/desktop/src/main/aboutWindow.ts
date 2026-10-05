interface CustomAboutDialogHtmlInput {
  applicationName: string;
  appVersion: string;
  copyright: string;
  optimizationLine: string;
  versionLabel: string;
  okButtonLabel: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createCustomAboutDialogHtml(input: CustomAboutDialogHtmlInput): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
    />
    <title>${escapeHtml(input.applicationName)}</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
        --startup-page-bg: #f4f4f5;
        --about-primary: #0a0a0a;
        --about-primary-foreground: #fafafa;
        --about-primary-active: color-mix(in oklab, var(--about-primary) 80%, transparent);
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: var(--startup-page-bg);
      }

      body {
        display: grid;
        place-items: center;
        padding: 0;
        user-select: none;
      }

      .about-window {
        width: 100%;
        max-width: 256px;
        height: 280px;
        display: grid;
        place-items: stretch;
        padding: 0;
        background: transparent;
      }

      .about-card {
        width: 100%;
        height: 100%;
        padding: 22px 15px 14px;
        display: flex;
        flex-direction: column;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: #1d1d1f;
        box-shadow: none;
        -webkit-app-region: drag;
      }

      .content {
        width: 100%;
        max-width: 222px;
        margin: 0 auto;
        flex: 1;
        min-height: 0;
      }

      .app-icon {
        width: 52px;
        height: 52px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        background: linear-gradient(180deg, #000000 0%, #151718 100%);
        color: #ffffff;
        box-shadow: 0 10px 13px -3px rgb(0 0 0 / 0.2), 0 4px 5px -3px rgb(0 0 0 / 0.2);
      }

      .app-logo {
        width: 34px;
        height: auto;
        display: block;
      }

      .title {
        margin: 20px 0 0;
        font-size: 13.5px;
        line-height: 1.18;
        font-weight: 700;
        letter-spacing: 0;
      }

      .meta {
        margin-top: 28px;
        display: flex;
        flex-direction: column;
        gap: 17px;
        font-size: 13px;
        line-height: 1.2;
        font-weight: 400;
        letter-spacing: 0;
        color: #303033;
      }


      .ok-button {
        width: 100%;
        height: 36px;
        border: 0;
        border-radius: 18px;
        background: var(--about-primary);
        color: var(--about-primary-foreground);
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: 0;
        outline: none;
        cursor: default;
        -webkit-app-region: no-drag;
      }

      .ok-button:active {
        background: var(--about-primary-active);
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --startup-page-bg: #171717;
          --about-primary: #fafafa;
          --about-primary-foreground: #0a0a0a;
          --about-primary-active: color-mix(in oklab, var(--about-primary) 80%, transparent);
        }

        .about-card {
          color: #e8e8e8;
        }

        .meta {
          color: #e2e2e2;
        }
      }
    </style>
  </head>
  <body>
    <main class="about-window" aria-label="${escapeHtml(input.applicationName)} About Window">
      <section class="about-card" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <div class="content">
          <div class="app-icon" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="100"
              height="100"
              fill="currentColor"
              viewBox="0 0 100 100"
              class="app-logo"
              focusable="false"
            >
<circle cx="50" cy="50" r="47" opacity="0.16" />
<circle cx="29.9" cy="10.4" r="2.44" />
<circle cx="37.3" cy="10.4" r="2.93" />
<circle cx="44.7" cy="10.4" r="3.03" />
<circle cx="52.1" cy="10.4" r="2.96" />
<circle cx="59.5" cy="10.4" r="2.67" />
<circle cx="66.9" cy="10.4" r="2.01" />
<circle cx="18.8" cy="16.8" r="1.95" />
<circle cx="26.2" cy="16.8" r="3.05" />
<circle cx="33.6" cy="16.8" r="3.21" />
<circle cx="41.0" cy="16.8" r="3.22" />
<circle cx="48.4" cy="16.8" r="3.11" />
<circle cx="55.8" cy="16.8" r="3.26" />
<circle cx="63.2" cy="16.8" r="3.04" />
<circle cx="70.6" cy="16.8" r="2.49" />
<circle cx="78.0" cy="16.8" r="1.42" />
<circle cx="15.1" cy="23.2" r="2.56" />
<circle cx="22.5" cy="23.2" r="3.2" />
<circle cx="29.9" cy="23.2" r="3.14" />
<circle cx="37.3" cy="23.2" r="2.87" />
<circle cx="44.7" cy="23.2" r="2.49" />
<circle cx="52.1" cy="23.2" r="2.73" />
<circle cx="59.5" cy="23.2" r="3.33" />
<circle cx="66.9" cy="23.2" r="3.15" />
<circle cx="74.3" cy="23.2" r="2.58" />
<circle cx="81.7" cy="23.2" r="1.56" />
<circle cx="11.4" cy="29.6" r="2.59" />
<circle cx="18.8" cy="29.6" r="3.25" />
<circle cx="26.2" cy="29.6" r="3.1" />
<circle cx="33.6" cy="29.6" r="2.46" />
<circle cx="41.0" cy="29.6" r="1.98" />
<circle cx="48.4" cy="29.6" r="2.36" />
<circle cx="55.8" cy="29.6" r="3.08" />
<circle cx="63.2" cy="29.6" r="3.28" />
<circle cx="70.6" cy="29.6" r="3.02" />
<circle cx="78.0" cy="29.6" r="2.44" />
<circle cx="85.4" cy="29.6" r="1.37" />
<circle cx="7.7" cy="36.0" r="2.23" />
<circle cx="15.1" cy="36.0" r="3.23" />
<circle cx="22.5" cy="36.0" r="3.24" />
<circle cx="29.9" cy="36.0" r="2.59" />
<circle cx="37.3" cy="36.0" r="1.62" />
<circle cx="44.7" cy="36.0" r="1.5" />
<circle cx="52.1" cy="36.0" r="2.44" />
<circle cx="59.5" cy="36.0" r="2.8" />
<circle cx="66.9" cy="36.0" r="2.66" />
<circle cx="74.3" cy="36.0" r="2.71" />
<circle cx="81.7" cy="36.0" r="2.11" />
<circle cx="89.1" cy="36.0" r="0.96" />
<circle cx="11.4" cy="42.5" r="3.05" />
<circle cx="18.8" cy="42.5" r="3.37" />
<circle cx="26.2" cy="42.5" r="3.11" />
<circle cx="33.6" cy="42.5" r="2.32" />
<circle cx="41.0" cy="42.5" r="1.73" />
<circle cx="48.4" cy="42.5" r="2.17" />
<circle cx="55.8" cy="42.5" r="2.45" />
<circle cx="63.2" cy="42.5" r="1.62" />
<circle cx="70.6" cy="42.5" r="2.2" />
<circle cx="78.0" cy="42.5" r="2.4" />
<circle cx="85.4" cy="42.5" r="1.6" />
<circle cx="7.7" cy="48.9" r="2.5" />
<circle cx="15.1" cy="48.9" r="3.26" />
<circle cx="22.5" cy="48.9" r="3.21" />
<circle cx="29.9" cy="48.9" r="2.65" />
<circle cx="37.3" cy="48.9" r="2.74" />
<circle cx="44.7" cy="48.9" r="2.69" />
<circle cx="52.1" cy="48.9" r="2.95" />
<circle cx="59.5" cy="48.9" r="1.88" />
<circle cx="66.9" cy="48.9" r="1.8" />
<circle cx="74.3" cy="48.9" r="2.35" />
<circle cx="81.7" cy="48.9" r="1.94" />
<circle cx="89.1" cy="48.9" r="0.93" />
<circle cx="11.4" cy="55.3" r="2.81" />
<circle cx="18.8" cy="55.3" r="3.18" />
<circle cx="26.2" cy="55.3" r="2.35" />
<circle cx="33.6" cy="55.3" r="2.16" />
<circle cx="41.0" cy="55.3" r="2.78" />
<circle cx="48.4" cy="55.3" r="2.09" />
<circle cx="55.8" cy="55.3" r="2.32" />
<circle cx="63.2" cy="55.3" r="2.5" />
<circle cx="70.6" cy="55.3" r="2.45" />
<circle cx="78.0" cy="55.3" r="2.08" />
<circle cx="85.4" cy="55.3" r="1.22" />
<circle cx="7.7" cy="61.7" r="1.72" />
<circle cx="15.1" cy="61.7" r="2.82" />
<circle cx="22.5" cy="61.7" r="3.03" />
<circle cx="29.9" cy="61.7" r="2.73" />
<circle cx="37.3" cy="61.7" r="2.96" />
<circle cx="44.7" cy="61.7" r="2.06" />
<circle cx="52.1" cy="61.7" r="1.74" />
<circle cx="59.5" cy="61.7" r="2.32" />
<circle cx="66.9" cy="61.7" r="2.14" />
<circle cx="74.3" cy="61.7" r="1.58" />
<circle cx="81.7" cy="61.7" r="1.27" />
<circle cx="11.4" cy="68.1" r="1.76" />
<circle cx="18.8" cy="68.1" r="2.63" />
<circle cx="26.2" cy="68.1" r="2.96" />
<circle cx="33.6" cy="68.1" r="3.03" />
<circle cx="41.0" cy="68.1" r="2.63" />
<circle cx="48.4" cy="68.1" r="2.13" />
<circle cx="55.8" cy="68.1" r="2.17" />
<circle cx="63.2" cy="68.1" r="2.25" />
<circle cx="70.6" cy="68.1" r="1.23" />
<circle cx="78.0" cy="68.1" r="1.06" />
<circle cx="15.1" cy="74.5" r="1.45" />
<circle cx="22.5" cy="74.5" r="2.24" />
<circle cx="29.9" cy="74.5" r="2.57" />
<circle cx="37.3" cy="74.5" r="2.62" />
<circle cx="44.7" cy="74.5" r="2.43" />
<circle cx="52.1" cy="74.5" r="2.22" />
<circle cx="59.5" cy="74.5" r="2.03" />
<circle cx="66.9" cy="74.5" r="1.56" />
<circle cx="74.3" cy="74.5" r="0.96" />
<circle cx="18.8" cy="80.9" r="0.87" />
<circle cx="26.2" cy="80.9" r="1.6" />
<circle cx="33.6" cy="80.9" r="1.92" />
<circle cx="41.0" cy="80.9" r="1.97" />
<circle cx="48.4" cy="80.9" r="1.85" />
<circle cx="55.8" cy="80.9" r="1.59" />
<circle cx="63.2" cy="80.9" r="1.2" />
<circle cx="29.9" cy="87.3" r="0.77" />
<circle cx="37.3" cy="87.3" r="1.03" />
<circle cx="44.7" cy="87.3" r="1.06" />
<circle cx="52.1" cy="87.3" r="0.92" />
</svg>
          </div>
          <h1 id="about-title" class="title">
            ${escapeHtml(input.applicationName)}<br />
            ${escapeHtml(input.versionLabel)} ${escapeHtml(input.appVersion)}
          </h1>
          <div class="meta">
            ${input.optimizationLine ? `<div>${escapeHtml(input.optimizationLine)}</div>` : ""}
            <div>${escapeHtml(input.copyright)}</div>
          </div>
        </div>
        <div class="spacer"></div>
        <button class="ok-button" type="button" autofocus>${escapeHtml(input.okButtonLabel)}</button>
      </section>
    </main>
    <script>
      const closeWindow = () => window.close();
      document.querySelector(".ok-button")?.addEventListener("click", closeWindow);
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" || event.key === "Enter") {
          closeWindow();
        }
      });
    </script>
  </body>
</html>`;
}
