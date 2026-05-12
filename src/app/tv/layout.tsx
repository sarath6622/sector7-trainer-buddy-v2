export default function TvLayout({ children }: LayoutProps<'/tv'>) {
  return <div className="h-dvh w-screen overflow-hidden bg-black text-white">{children}</div>;
}
