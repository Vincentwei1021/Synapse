// src/app/onboarding/layout.tsx
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
