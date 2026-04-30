/**
 * Transactional email via Resend.
 *
 * Resend's free tier covers 3000 emails/month from one verified domain,
 * which is enough for the welcome email + occasional service notices.
 *
 * Configure via env:
 *   RESEND_API_KEY=re_...
 *   RESEND_FROM=hello@piggyback.finance
 *
 * If RESEND_API_KEY is missing the helper logs and returns gracefully —
 * we don't want an email outage to take down the provisioning flow.
 */

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(args: SendArgs): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "hello@piggyback.finance";
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY missing, skipping email to ${args.to}`);
    return { ok: false, error: "Resend not configured" };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        ...(args.text ? { text: args.text } : {}),
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      console.error("[email] Resend rejected:", response.status, text);
      return { ok: false, error: `Resend ${response.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] failed:", err);
    return { ok: false, error: String(err) };
  }
}

export function welcomeEmail(args: {
  email: string;
  displayName: string | null;
  subdomain: string;
}): { subject: string; html: string; text: string } {
  const name = (args.displayName ?? "there").split(" ")[0];
  const subdomainUrl = `https://${args.subdomain}.piggyback.finance`;
  const subject = "Your PiggyBack is ready 🐷";
  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 40px auto; padding: 24px; color: #1f1f1f;">
    <h1 style="font-size: 24px; margin-bottom: 8px;">Welcome to PiggyBack, ${name}.</h1>
    <p style="color: #555; line-height: 1.6;">Your PiggyBack is provisioned and ready at:</p>
    <p style="text-align: center; margin: 32px 0;">
      <a href="${subdomainUrl}" style="display: inline-block; background: #ff8a72; color: white; padding: 14px 28px; text-decoration: none; border-radius: 999px; font-weight: 600;">${args.subdomain}.piggyback.finance</a>
    </p>
    <h2 style="font-size: 18px; margin-top: 40px;">One more step: connect Up Bank</h2>
    <p style="color: #555; line-height: 1.6;">
      Open your deployment, go to <strong>Settings → Up Connection</strong>, and paste your
      Personal Access Token. Generate one at
      <a href="https://api.up.com.au/getting_started" style="color: #ff8a72;">api.up.com.au/getting_started</a>.
    </p>
    <p style="color: #555; line-height: 1.6;">
      Your token is encrypted and stored only in your own Supabase. We never see it.
    </p>
    <h2 style="font-size: 18px; margin-top: 40px;">Manage your subscription</h2>
    <p style="color: #555; line-height: 1.6;">
      View invoices, update your card, or cancel any time at
      <a href="https://piggyback.finance/account" style="color: #ff8a72;">piggyback.finance/account</a>.
    </p>
    <p style="color: #555; line-height: 1.6;">
      Cancel anytime, keep your app — your Vercel project and Supabase data are yours forever.
    </p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 40px 0;">
    <p style="font-size: 12px; color: #999;">
      Questions? Just reply to this email. <br>
      —Ben<br>
      <a href="https://piggyback.finance" style="color: #999;">piggyback.finance</a>
    </p>
  </body>
</html>`;
  const text = `Welcome to PiggyBack, ${name}.

Your PiggyBack is provisioned and ready at:
  ${subdomainUrl}

One more step: connect Up Bank.
Open your deployment → Settings → Up Connection. Paste your Personal Access Token.
Generate one at https://api.up.com.au/getting_started

Your token is encrypted and stored only in your own Supabase. We never see it.

Manage your subscription, view invoices, or cancel any time at:
  https://piggyback.finance/account

Cancel anytime, keep your app — your Vercel project and Supabase data are yours forever.

—Ben
piggyback.finance`;
  return { subject, html, text };
}
