import { emailShell } from "./resend.ts";

const APP_URL = "https://calisthenics-attendance-system.vercel.app";

export function trainerWelcomeEmail(fullName: string, email: string, password: string) {
  return {
    subject: "Your CalisthenicsHQ trainer login",
    html: emailShell(
      "Welcome to CalisthenicsHQ",
      `<p style="color:#c9cdc4; line-height:1.6;">Hi ${fullName}, an admin has set up your trainer account. Here are your login details:</p>
       <table style="width:100%; margin:16px 0; border-collapse:collapse;">
         <tr><td style="color:#8b8f87; padding:4px 0;">Email</td><td style="color:#fff; font-weight:600;">${email}</td></tr>
         <tr><td style="color:#8b8f87; padding:4px 0;">Password</td><td style="color:#fff; font-weight:600;">${password}</td></tr>
       </table>
       <p style="color:#c9cdc4; line-height:1.6;">
         Log in at <a href="${APP_URL}" style="color:#8CFF3C;">${APP_URL}</a> and change your password from the menu
         once you're in.
       </p>`
    ),
  };
}

export function trainerCredentialsUpdatedEmail(fullName: string, email: string, password: string) {
  return {
    subject: "Your CalisthenicsHQ login details were updated",
    html: emailShell(
      "Your login details were updated",
      `<p style="color:#c9cdc4; line-height:1.6;">Hi ${fullName}, an admin reset your trainer account password. Here are your updated login details:</p>
       <table style="width:100%; margin:16px 0; border-collapse:collapse;">
         <tr><td style="color:#8b8f87; padding:4px 0;">Email</td><td style="color:#fff; font-weight:600;">${email}</td></tr>
         <tr><td style="color:#8b8f87; padding:4px 0;">New Password</td><td style="color:#fff; font-weight:600;">${password}</td></tr>
       </table>
       <p style="color:#c9cdc4; line-height:1.6;">
         Log in at <a href="${APP_URL}" style="color:#8CFF3C;">${APP_URL}</a> with these details.
       </p>`
    ),
  };
}
