// A template re-mounts on every navigation, so each page fades in.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 flex flex-col animate-fade-up">{children}</div>
}
