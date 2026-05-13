/**
 * Settings pages are narrower than connections — single-column forms read
 * better at this width. The auth check and header/footer chrome live in the
 * parent `(account)/layout.tsx`.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl">{children}</div>;
}
