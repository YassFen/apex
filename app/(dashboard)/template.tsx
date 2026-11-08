// A template re-mounts on every navigation, so each page fades in (opacity only: cheap and quick).
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 flex flex-col animate-fade-in">{children}</div>
}
