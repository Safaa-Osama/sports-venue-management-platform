import nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer/index';

export const sendMail = async (mailOptions: Mail.Options): Promise<boolean> => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    tls: { rejectUnauthorized: false },
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASS,
    },
  });

  const info = await transporter.sendMail({
    from: `sports-venue-platform <${process.env.EMAIL}>`,
    ...mailOptions,
  });

  return info.accepted.length > 0;
};

export const generateOtp = () => {
  return Math.floor(Math.random() * 900000 + 100000);
};
