import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.EMAIL_FROM!;

export async function sendWelcomeEmail(to: string, name: string) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "欢迎加入 CineStream!",
    html: `
      <h1>欢迎, ${name}!</h1>
      <p>感谢注册 CineStream。现在就开始探索海量精彩电影吧！</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/pricing" style="display:inline-block;padding:12px 24px;background:#e50914;color:#fff;text-decoration:none;border-radius:4px;">查看会员方案</a>
    `,
  });
}

export async function sendPaymentConfirmation(
  to: string,
  name: string,
  plan: string
) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "CineStream 付款确认",
    html: `
      <h1>付款成功!</h1>
      <p>${name}，您已成功订阅 <strong>${plan}</strong> 方案。</p>
      <p>立即开始观看独家内容吧！</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="display:inline-block;padding:12px 24px;background:#e50914;color:#fff;text-decoration:none;border-radius:4px;">开始观看</a>
    `,
  });
}

export async function sendPasswordReset(to: string, resetLink: string) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "CineStream 密码重置",
    html: `
      <h1>重置密码</h1>
      <p>请点击下方链接重置您的密码（15分钟内有效）：</p>
      <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#e50914;color:#fff;text-decoration:none;border-radius:4px;">重置密码</a>
      <p>如果您没有请求重置密码，请忽略此邮件。</p>
    `,
  });
}
