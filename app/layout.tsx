import type { Metadata } from "next";
import localFont from "next/font/local";
import { getI18n } from "@/lib/i18n/server";
import { LanguageProvider } from "@/components/language-provider";
import "./globals.css";

const kannada = localFont({
  src: "./fonts/NotoSansKannada.ttf",
  variable: "--font-kannada",
  display: "swap",
  weight: "100 900",
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t("SevaSathi"), template: `%s | ${t("SevaSathi")}` },
    description: t(
      "A secure income-certificate workspace for revenue officers.",
    ),
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { locale, t } = await getI18n();
  return (
    <html lang={locale} className={kannada.variable}>
      <body>
        <LanguageProvider locale={locale}>
          <a
            href="#main-content"
            className="fixed top-2 left-2 z-50 -translate-y-24 rounded-lg bg-white px-4 py-3 opacity-0 shadow-lg focus:translate-y-0 focus:opacity-100"
          >
            {t("Skip to content")}
          </a>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
