export async function sendEmail(opts: { to: string[]; subject: string; html: string }) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("REPORT_FROM_EMAIL") ?? "reports@calisthenicshq.dev";

  if (!apiKey) {
    throw new Error("RESEND_API_KEY secret is not set. Run: supabase secrets set RESEND_API_KEY=...");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }

  return res.json();
}

export function emailShell(title: string, bodyHtml: string) {
  return `
  <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; background:#0a0b0a; padding:32px; color:#fff;">
    <div style="max-width:600px; margin:0 auto; background:#121412; border:1px solid #2e322a; border-radius:12px; overflow:hidden;">
      <div style="background:#8CFF3C; padding:18px 24px;">
        <span style="font-weight:700; font-size:18px; color:#0a0b0a;">CalisthenicsHQ</span>
      </div>
      <div style="padding:24px;">
        <h1 style="font-size:20px; margin:0 0 16px;">${title}</h1>
        ${bodyHtml}
      </div>
      <div style="padding:16px 24px; border-top:1px solid #2e322a; color:#8b8f87; font-size:12px;">
        Automated report from your Attendance & Membership Tracker.
      </div>
    </div>
  </div>`;
}
