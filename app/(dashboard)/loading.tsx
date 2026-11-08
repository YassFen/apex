// Shown instantly while a dashboard page loads its data on the server.
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="flex-1 flex flex-col">
      <div className="h-[60px] px-4 lg:px-6 flex items-center">
        <div className="skeleton h-6 w-40 rounded-lg" />
      </div>
      <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-2xl w-full">
        <div className="skeleton h-36 rounded-[20px]" />
        <div className="grid grid-cols-3 gap-3">
          <div className="skeleton h-24 rounded-[20px]" />
          <div className="skeleton h-24 rounded-[20px]" />
          <div className="skeleton h-24 rounded-[20px]" />
        </div>
        <div className="skeleton h-14 rounded-2xl" />
        <div className="skeleton h-14 rounded-2xl" />
        <div className="skeleton h-14 rounded-2xl" />
      </div>
    </div>
  )
}
