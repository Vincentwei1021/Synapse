// src/i18n/request.ts
// Server-side i18n configuration for next-intl

import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { locales, defaultLocale, type Locale } from './config';

export default getRequestConfig(async () => {
  // Read locale from cookie (set by client-side LocaleProvider)
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get('synapse-locale')?.value;
  const locale: Locale =
    cookieLocale && locales.includes(cookieLocale as Locale)
      ? (cookieLocale as Locale)
      : defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
